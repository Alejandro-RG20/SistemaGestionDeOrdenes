-- =====================================================================
-- 0023 · El sistema deja de gestionar dinero; el inventario gana reservas
-- =====================================================================
--
-- ALCANCE
--
-- El sistema se acota a dos cosas: ordenes de reparacion e inventario de
-- repuestos. Los expedientes de cobro a proveedores y los pagos de clientes
-- salen del funcionamiento de la aplicacion. Esta migracion hace cuatro
-- cosas, y ninguna borra datos de negocio:
--
--   1. Retira los permisos del modulo de cobros y desactiva los dos roles
--      que solo existian para el (gestor_cobros, jefe_cobros).
--   2. Congela `pago` y `expediente_cobro` como historico de solo lectura.
--   3. Hace inmutables los registros que cuentan la historia de una orden y
--      del inventario: la trazabilidad no puede depender de que nadie
--      ejecute un UPDATE a mano.
--   4. Da a cada tecnico de planta su bodega de banco y publica la vista de
--      disponibilidad (existente, reservado, comprometido, disponible).
--
-- LO QUE NO SE HACE
--
-- No se borran las tablas `pago` ni `expediente_cobro`, ni el enumerado
-- `estado_expediente`, ni ninguna fila de ellas. Son registro de lo que
-- paso; borrarlas no simplifica nada y destruye historia. Tampoco se borran
-- ni se desactivan los USUARIOS que tenian un rol de cobros: sus cuentas
-- quedan, con su historial en la bitacora, y la administracion les asigna
-- un rol operativo si siguen trabajando en el centro. Mientras tanto su rol
-- no tiene permisos, asi que no pueden operar nada.
--
-- La reversion esta escrita en base-datos/reversiones/0023_revertir.sql.

-- ── 1. permisos y roles financieros ─────────────────────────────────────

DELETE FROM rol_permiso
 WHERE id_permiso IN (SELECT id FROM permiso WHERE codigo LIKE 'cobros.%');

DELETE FROM permiso WHERE codigo LIKE 'cobros.%';

UPDATE rol SET activo = false
 WHERE codigo IN ('gestor_cobros', 'jefe_cobros');

-- Pedir un repuesto deja de ser el mismo permiso que aprobarlo. Con uno
-- solo, el tecnico de planta —que tenia que poder pedir— tambien podia
-- aprobarse su propia solicitud. Separacion de funciones: el tecnico pide,
-- bodega revisa.
INSERT INTO permiso (codigo, modulo, descripcion)
SELECT 'inventario.solicitud.crear', 'inventario',
       'Solicitar repuestos para una orden asignada'
 WHERE NOT EXISTS (SELECT 1 FROM permiso WHERE codigo = 'inventario.solicitud.crear');

INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT r.id, p.id
  FROM rol r, permiso p
 WHERE r.codigo IN ('tecnico_ruta', 'tecnico_planta', 'administrador')
   AND p.codigo = 'inventario.solicitud.crear'
ON CONFLICT DO NOTHING;

DELETE FROM rol_permiso
 WHERE id_rol IN (SELECT id FROM rol WHERE codigo = 'tecnico_planta')
   AND id_permiso IN (SELECT id FROM permiso WHERE codigo = 'inventario.solicitud.gestionar');

-- La entrega la seguian registrando la jefatura de atencion y el mostrador
-- de tienda; la jefatura de cobros, que tambien podia, deja de existir. No
-- hace falta reasignar nada.

-- La jefatura de atencion recibe y entrega en el mostrador del centro: tiene
-- que poder adjuntar la fotografia de lo que entra y la firma de quien retira.
INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT r.id, p.id
  FROM rol r, permiso p
 WHERE r.codigo = 'jefe_atencion_cliente' AND p.codigo = 'campo.evidencia.cargar'
ON CONFLICT DO NOTHING;

-- ── 2. historico financiero de solo lectura ─────────────────────────────

CREATE OR REPLACE FUNCTION fn_solo_historico() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es historica y ya no admite cambios (migracion 0023).', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_pago_historico
  BEFORE INSERT OR UPDATE OR DELETE ON pago
  FOR EACH ROW EXECUTE FUNCTION fn_solo_historico();

CREATE TRIGGER tg_expediente_cobro_historico
  BEFORE INSERT OR UPDATE OR DELETE ON expediente_cobro
  FOR EACH ROW EXECUTE FUNCTION fn_solo_historico();

COMMENT ON TABLE pago IS
  'Historico. El sistema dejo de registrar pagos en la migracion 0023; se conserva sin cambios.';
COMMENT ON TABLE expediente_cobro IS
  'Historico. El sistema dejo de gestionar expedientes de cobro en la migracion 0023.';

-- ── 3. trazabilidad que no se reescribe ─────────────────────────────────
--
-- Estas tablas son el relato de cada orden y de cada pieza. Se agregan
-- filas; no se editan ni se borran. Una correccion es una fila nueva —una
-- nota de correccion, un movimiento de ajuste con su justificacion— y la
-- anterior queda a la vista. `TRUNCATE` (que solo usa la siembra de datos de
-- prueba) no dispara estos disparadores de fila.

CREATE OR REPLACE FUNCTION fn_solo_agregar() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % no se modifican ni se borran: registre una correccion.',
    TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_evento_orden_inmutable
  BEFORE UPDATE OR DELETE ON evento_orden
  FOR EACH ROW EXECUTE FUNCTION fn_solo_agregar();

CREATE TRIGGER tg_movimiento_inmutable
  BEFORE UPDATE OR DELETE ON movimiento_repuesto
  FOR EACH ROW EXECUTE FUNCTION fn_solo_agregar();

CREATE TRIGGER tg_bitacora_inmutable
  BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION fn_solo_agregar();

CREATE TRIGGER tg_nota_correccion_inmutable
  BEFORE UPDATE OR DELETE ON nota_correccion
  FOR EACH ROW EXECUTE FUNCTION fn_solo_agregar();

CREATE TRIGGER tg_entrega_inmutable
  BEFORE UPDATE OR DELETE ON entrega
  FOR EACH ROW EXECUTE FUNCTION fn_solo_agregar();

CREATE TRIGGER tg_validacion_inmutable
  BEFORE UPDATE OR DELETE ON validacion_tecnica
  FOR EACH ROW EXECUTE FUNCTION fn_solo_agregar();

-- La evidencia SI se actualiza una vez: cuando termina de subir el archivo
-- se anota su ruta. Lo que no admite es desaparecer.
CREATE TRIGGER tg_evidencia_no_se_borra
  BEFORE DELETE ON evidencia
  FOR EACH ROW EXECUTE FUNCTION fn_solo_agregar();

-- ── 4. bodega de banco y disponibilidad ─────────────────────────────────
--
-- Hasta aqui solo el tecnico de ruta tenia bodega propia (la del vehiculo).
-- Al de planta la pieza se le «entregaba» sin movimiento: seguia contando en
-- la bodega central hasta que se instalaba, y la que no se usaba no tenia
-- como volver, porque nunca habia salido. Con una bodega de banco por
-- tecnico, entregar, consumir y devolver son movimientos reales en los dos
-- casos y el kardex dice en todo momento quien tiene cada pieza.
--
-- Se reutiliza el tipo 'movil' —«bodega personal de un tecnico»— en vez de
-- agregar un valor al enumerado: la restriccion ck_bodega_movil y el indice
-- unico por tecnico ya dicen exactamente eso.
INSERT INTO bodega (id_centro, tipo, nombre, id_tecnico, activa, surte_repuestos)
SELECT t.id_centro, 'movil', 'Banco de taller · ' || trim(u.nombres), t.id, true, true
  FROM tecnico t
  JOIN usuario u ON u.id = t.id_usuario
 WHERE t.tipo = 'planta'
   AND NOT EXISTS (
     SELECT 1 FROM bodega b WHERE b.id_tecnico = t.id AND b.tipo = 'movil' AND b.activa
   );

-- Disponibilidad por repuesto.
--
--   existencia_bodegas  lo que hay fisicamente en las bodegas centrales que
--                       surten (no cuenta la de piezas sustituidas).
--   en_tecnicos         lo que ya se entrego y esta en bodegas de tecnicos.
--   reservado           solicitudes aprobadas o preparadas: apartadas para
--                       una orden, todavia en la bodega.
--   comprometido        solicitudes pedidas y aun sin revisar: demanda que
--                       viene, sin autorizar.
--   disponible          existencia_bodegas - reservado. Es lo que se puede
--                       prometer a una solicitud nueva.
--
-- Las solicitudes de ordenes ya cerradas no reservan nada: si la orden se
-- entrego, anulo o cerro sin reparar, la pieza no se va a instalar.
CREATE VIEW v_disponibilidad_repuesto AS
  WITH fisico AS (
    SELECT e.id_repuesto,
           sum(e.cantidad) FILTER (WHERE b.tipo = 'central' AND b.surte_repuestos) AS en_bodegas,
           sum(e.cantidad) FILTER (WHERE b.tipo = 'movil') AS en_tecnicos
      FROM existencia e
      JOIN bodega b ON b.id = e.id_bodega AND b.activa
     GROUP BY e.id_repuesto
  ), pedido AS (
    SELECT s.id_repuesto,
           sum(s.cantidad) FILTER (WHERE s.estado IN ('aprobada', 'preparada')) AS reservado,
           sum(s.cantidad) FILTER (WHERE s.estado IN ('solicitada', 'en_revision')) AS comprometido
      FROM solicitud_repuesto s
      JOIN orden_servicio o ON o.id = s.id_orden
     WHERE o.estado NOT IN ('entregada', 'cerrada_sin_reparar', 'anulada')
     GROUP BY s.id_repuesto
  )
  SELECT r.id AS id_repuesto,
         coalesce(f.en_bodegas, 0)::int   AS existencia_bodegas,
         coalesce(f.en_tecnicos, 0)::int  AS en_tecnicos,
         coalesce(p.reservado, 0)::int    AS reservado,
         coalesce(p.comprometido, 0)::int AS comprometido,
         (coalesce(f.en_bodegas, 0) - coalesce(p.reservado, 0))::int AS disponible
    FROM repuesto r
    LEFT JOIN fisico f ON f.id_repuesto = r.id
    LEFT JOIN pedido p ON p.id_repuesto = r.id;

COMMENT ON VIEW v_disponibilidad_repuesto IS
  'Existente, en tecnicos, reservado, comprometido y disponible por repuesto. Disponible = bodegas - reservado.';
