-- =====================================================================
-- 0015 · La tienda como sucursal: usuarios y ordenes cuelgan de ella
-- =====================================================================
--
-- POR QUE SE EXTIENDE `tienda_origen` EN VEZ DE CREAR UNA TABLA NUEVA
--
-- Hasta aqui `tienda_origen` respondia a una sola pregunta —«¿donde se
-- compro el articulo?»— porque es lo que decide si la garantia del
-- proveedor aplica (`regla_cobertura.exige_tienda_grupo`). El pliego pide
-- ademas una sucursal con codigo, direccion y telefono, a la que pertenecen
-- los usuarios y desde la que se levantan las ordenes.
--
-- En Unicomer son LA MISMA COSA: la sucursal de La Curacao donde el cliente
-- compro la refrigeradora es la sucursal desde la que el usuario de tienda
-- levanta la orden. Partirlas en dos tablas obligaria a mantener dos
-- catalogos de lo mismo y, peor, a decidir cual de los dos manda cuando el
-- motor de garantias pregunte si la compra fue en el grupo.
--
-- Por eso se extiende. `pertenece_al_grupo` sigue siendo lo que usa el motor
-- de garantias y no cambia de significado.

ALTER TABLE tienda_origen
  ADD COLUMN codigo        text,
  ADD COLUMN direccion     text,
  ADD COLUMN telefono      text,
  ADD COLUMN creado_en     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN creado_por    uuid REFERENCES usuario(id),
  ADD COLUMN modificado_en timestamptz,
  ADD COLUMN modificado_por uuid REFERENCES usuario(id);

-- El codigo se completa en la siembra y a partir de ahi es obligatorio y
-- unico: es lo que el personal dicta por telefono, no el uuid.
CREATE UNIQUE INDEX ux_tienda_codigo ON tienda_origen (codigo) WHERE codigo IS NOT NULL;

-- ── el usuario y su tienda ───────────────────────────────────────────
--
-- Es NULL a proposito. Un tecnico de ruta, un bodeguero o la jefatura no
-- pertenecen a ninguna sucursal: trabajan en el centro de servicio. Quien
-- necesita tienda es el usuario de tienda, y esa exigencia se comprueba en
-- el servicio, donde se puede explicar («su cuenta no tiene tienda
-- asignada; pidasela a la jefatura»), no con un NOT NULL que solo produce
-- un error de base de datos que nadie entiende.
ALTER TABLE usuario
  ADD COLUMN id_tienda uuid REFERENCES tienda_origen(id);
CREATE INDEX ix_usuario_tienda ON usuario (id_tienda) WHERE id_tienda IS NOT NULL;

-- ── la orden y la tienda desde la que se levanto ─────────────────────
--
-- NO es la tienda donde se compro el articulo —esa ya cuelga del articulo—
-- sino desde donde entro la solicitud: la sucursal que atendio al cliente o
-- la que el agente telefonico selecciono. Las dos pueden diferir: alguien
-- compra en Tropigas Masaya y reclama en La Curacao Managua.
--
-- Queda congelada en la orden (RN-22) igual que el telefono y la direccion:
-- si la sucursal se desactiva o se renombra manana, la orden de hoy sigue
-- diciendo de donde vino.
ALTER TABLE orden_servicio
  ADD COLUMN id_tienda uuid REFERENCES tienda_origen(id);
CREATE INDEX ix_orden_tienda ON orden_servicio (id_tienda) WHERE id_tienda IS NOT NULL;

COMMENT ON COLUMN orden_servicio.id_tienda IS
  'Sucursal desde la que se levanto la orden. Distinta de articulo.id_tienda_origen, que es donde se compro.';
COMMENT ON COLUMN usuario.id_tienda IS
  'Sucursal a la que pertenece el usuario. NULL para el personal del centro de servicio.';
