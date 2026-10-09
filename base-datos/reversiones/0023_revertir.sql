-- =====================================================================
-- Reversion manual de la migracion 0023
-- =====================================================================
--
-- No vive en base-datos/migraciones a proposito: el ejecutor aplica todo
-- lo que hay alli. Se ejecuta a mano, con respaldo previo:
--
--   pg_dump -Fc servitotal > respaldo_antes_de_revertir_0023.dump
--   psql servitotal -f base-datos/reversiones/0023_revertir.sql
--
-- Devuelve el esquema al estado de 0022. Los datos de `pago` y
-- `expediente_cobro` nunca se tocaron, asi que no hay nada que restaurar.
-- Los permisos de cobros los vuelve a crear la siembra de seguridad del
-- codigo que los declare; aqui solo se reactivan los roles.
--
-- Atencion: las bodegas de banco que se crearon y los movimientos que se
-- registraron en ellas NO se borran: son historia del inventario.

BEGIN;

DROP VIEW IF EXISTS v_disponibilidad_repuesto;

DROP TRIGGER IF EXISTS tg_pago_historico ON pago;
DROP TRIGGER IF EXISTS tg_expediente_cobro_historico ON expediente_cobro;
DROP FUNCTION IF EXISTS fn_solo_historico();

DROP TRIGGER IF EXISTS tg_evento_orden_inmutable ON evento_orden;
DROP TRIGGER IF EXISTS tg_movimiento_inmutable ON movimiento_repuesto;
DROP TRIGGER IF EXISTS tg_bitacora_inmutable ON bitacora;
DROP TRIGGER IF EXISTS tg_nota_correccion_inmutable ON nota_correccion;
DROP TRIGGER IF EXISTS tg_entrega_inmutable ON entrega;
DROP TRIGGER IF EXISTS tg_validacion_inmutable ON validacion_tecnica;
DROP TRIGGER IF EXISTS tg_evidencia_no_se_borra ON evidencia;
DROP FUNCTION IF EXISTS fn_solo_agregar();

UPDATE rol SET activo = true WHERE codigo IN ('gestor_cobros', 'jefe_cobros');

INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT r.id, p.id FROM rol r, permiso p
 WHERE r.codigo = 'tecnico_planta' AND p.codigo = 'inventario.solicitud.gestionar'
ON CONFLICT DO NOTHING;

DELETE FROM rol_permiso
 WHERE id_permiso IN (SELECT id FROM permiso WHERE codigo = 'inventario.solicitud.crear');
DELETE FROM permiso WHERE codigo = 'inventario.solicitud.crear';

DELETE FROM migracion_aplicada WHERE nombre = '0023_desacople_financiero_y_reservas.sql';

COMMIT;
