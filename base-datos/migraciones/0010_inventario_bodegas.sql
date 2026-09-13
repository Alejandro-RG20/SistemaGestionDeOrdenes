-- =====================================================================
-- 0010 · Inventario y bodegas
-- =====================================================================

CREATE TABLE bodega (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_centro     uuid NOT NULL REFERENCES centro(id),
  tipo          tipo_bodega NOT NULL,
  nombre        text NOT NULL,
  id_tecnico    uuid REFERENCES tecnico(id),   -- AD-05: la movil pertenece a un solo tecnico
  activa        boolean NOT NULL DEFAULT true,
  CONSTRAINT ck_bodega_movil CHECK (
    (tipo = 'movil' AND id_tecnico IS NOT NULL) OR
    (tipo = 'central' AND id_tecnico IS NULL)
  )
);
-- Sin concurrencia posible: un tecnico, una bodega movil
CREATE UNIQUE INDEX ux_bodega_movil_tecnico ON bodega (id_tecnico) WHERE tipo = 'movil' AND activa;

CREATE TABLE repuesto (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo            text NOT NULL UNIQUE,
  descripcion       text NOT NULL,
  id_marca          uuid REFERENCES marca(id),
  unidad_medida     text NOT NULL DEFAULT 'u',
  precio            numeric(12,2) NOT NULL DEFAULT 0,
  stock_minimo      integer NOT NULL DEFAULT 0,
  via_abastecimiento via_abastecimiento NOT NULL DEFAULT 'compra_local',
  activo            boolean NOT NULL DEFAULT true
);
-- (inmutable_unaccent: ver nota en la migracion 0001)
CREATE INDEX ix_repuesto_desc_trgm ON repuesto USING gin (lower(inmutable_unaccent(descripcion)) gin_trgm_ops);

-- H8: los movimientos son la fuente de verdad
CREATE TABLE movimiento_repuesto (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_repuesto       uuid NOT NULL REFERENCES repuesto(id),
  tipo              tipo_movimiento NOT NULL,
  id_bodega_origen  uuid REFERENCES bodega(id),
  id_bodega_destino uuid REFERENCES bodega(id),
  cantidad          integer NOT NULL CHECK (cantidad > 0),
  precio_unitario   numeric(12,2) NOT NULL DEFAULT 0,   -- congelado (RN-22)
  id_orden          uuid REFERENCES orden_servicio(id), -- RN-12: todo consumo va a una orden
  id_responsable    uuid NOT NULL REFERENCES usuario(id),
  justificacion     text,
  momento_dispositivo timestamptz,
  registrado_sin_conexion boolean NOT NULL DEFAULT false,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_mov_consumo CHECK (tipo <> 'consumo' OR id_orden IS NOT NULL),
  CONSTRAINT ck_mov_ajuste  CHECK (tipo <> 'ajuste'  OR justificacion IS NOT NULL)
);
CREATE INDEX ix_mov_repuesto_bodega ON movimiento_repuesto (id_bodega_destino, id_repuesto);
CREATE INDEX ix_mov_orden ON movimiento_repuesto (id_orden) WHERE id_orden IS NOT NULL;

-- H8: proyeccion reconstruible a partir de los movimientos
CREATE TABLE existencia (
  id_bodega     uuid NOT NULL REFERENCES bodega(id),
  id_repuesto   uuid NOT NULL REFERENCES repuesto(id),
  cantidad      integer NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_bodega, id_repuesto)
);
-- RF-54: alerta de reorden sin recorrer el catalogo completo
CREATE INDEX ix_existencia_bajo_minimo ON existencia (id_repuesto, cantidad);

-- Solicitudes de abastecimiento: sostienen el estado 'esperando_repuesto'
CREATE TABLE solicitud_repuesto (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden          uuid NOT NULL REFERENCES orden_servicio(id),
  id_repuesto       uuid NOT NULL REFERENCES repuesto(id),
  cantidad          integer NOT NULL CHECK (cantidad > 0),
  via               via_abastecimiento NOT NULL,
  fecha_solicitud   date NOT NULL DEFAULT current_date,
  fecha_estimada    date,                      -- RF-52, visible en el portal (RF-68)
  fecha_ingreso     date,
  liberada          boolean NOT NULL DEFAULT false,  -- RF-53 · RN-15
  creado_por        uuid REFERENCES usuario(id)
);
CREATE INDEX ix_solicitud_pendiente ON solicitud_repuesto (id_repuesto) WHERE NOT liberada;
