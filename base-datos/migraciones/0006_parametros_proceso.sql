-- =====================================================================
-- 0006 · Parametros de proceso (H2, H3)
-- =====================================================================

-- H3 · RN-16: plazos por estado y tipo de garantia, en horas laborables
CREATE TABLE regla_plazo (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  estado            estado_orden NOT NULL,
  tipo              tipo_garantia,           -- NULL = aplica a todos
  horas_maximas     smallint NOT NULL,
  horas_alerta      smallint NOT NULL,       -- aviso previo al vencimiento
  activa            boolean NOT NULL DEFAULT true
);
-- Una regla por estado y tipo, mas una regla general por estado (tipo NULL)
CREATE UNIQUE INDEX ux_regla_plazo_tipo ON regla_plazo (estado, tipo) WHERE activa AND tipo IS NOT NULL;
CREATE UNIQUE INDEX ux_regla_plazo_gral ON regla_plazo (estado)       WHERE activa AND tipo IS NULL;

-- H3: los plazos se cuentan en horas laborables, no corridas
CREATE TABLE calendario_laboral (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_centro     uuid NOT NULL REFERENCES centro(id),
  dia_semana    smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio   time NOT NULL,
  hora_fin      time NOT NULL,
  activo        boolean NOT NULL DEFAULT true
);

CREATE TABLE dia_no_laborable (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_centro     uuid NOT NULL REFERENCES centro(id),
  fecha         date NOT NULL,
  motivo        text,
  UNIQUE (id_centro, fecha)
);

-- H2 · RN-06: la matriz de evidencia obligatoria es una entidad, no codigo
CREATE TABLE regla_evidencia (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo              tipo_garantia NOT NULL,
  id_categoria      uuid REFERENCES categoria_articulo(id),  -- NULL = toda categoria
  id_marca          uuid REFERENCES marca(id),               -- NULL = toda marca
  momento           momento_evidencia NOT NULL,
  clave             text NOT NULL,        -- foto_articulo, factura_compra, medicion_aire...
  etiqueta          text NOT NULL,
  obligatoria       boolean NOT NULL DEFAULT true,
  bloquea_avance    boolean NOT NULL DEFAULT true,
  activa            boolean NOT NULL DEFAULT true
);
CREATE INDEX ix_regla_evidencia ON regla_evidencia (tipo, momento) WHERE activa;

-- Plantillas de diagnostico por categoria, con campos tipificados
CREATE TABLE checklist_plantilla (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_categoria  uuid NOT NULL REFERENCES categoria_articulo(id),
  nombre        text NOT NULL,
  version       smallint NOT NULL DEFAULT 1,
  activa        boolean NOT NULL DEFAULT true
);

CREATE TABLE checklist_item_plantilla (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_plantilla  uuid NOT NULL REFERENCES checklist_plantilla(id),
  orden         smallint NOT NULL,
  etiqueta      text NOT NULL,
  tipo_campo    tipo_campo_checklist NOT NULL,
  unidad        text,                    -- psi, A, °C
  rango_min     numeric(12,3),
  rango_max     numeric(12,3),
  opciones      text[],
  obligatorio   boolean NOT NULL DEFAULT true
);
