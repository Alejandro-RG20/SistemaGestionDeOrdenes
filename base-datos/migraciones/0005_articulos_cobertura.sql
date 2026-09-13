-- =====================================================================
-- 0005 · Articulos y cobertura
-- =====================================================================

CREATE TABLE marca (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre            text NOT NULL UNIQUE,
  contacto_garantia text,
  activa            boolean NOT NULL DEFAULT true
);

CREATE TABLE tienda_origen (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre            text NOT NULL UNIQUE,   -- La Curacao, Tropigas, RadioShack, Externa
  pertenece_al_grupo boolean NOT NULL,
  activa            boolean NOT NULL DEFAULT true
);

CREATE TABLE categoria_articulo (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        text NOT NULL UNIQUE,   -- refrigeracion, lavado, aire_acondicionado, audio_video
  linea         text NOT NULL CHECK (linea IN ('blanca','marron','otros')),
  activa        boolean NOT NULL DEFAULT true
);

CREATE TABLE articulo (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_cliente          uuid NOT NULL REFERENCES cliente(id),
  id_marca            uuid NOT NULL REFERENCES marca(id),
  id_categoria        uuid NOT NULL REFERENCES categoria_articulo(id),
  id_tienda_origen    uuid NOT NULL REFERENCES tienda_origen(id),
  modelo              text,
  numero_serie        text,
  sin_serie_legible   boolean NOT NULL DEFAULT false,   -- RF-77
  fecha_compra        date,
  factura_referencia  text,
  activo              boolean NOT NULL DEFAULT true,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  creado_por          uuid REFERENCES usuario(id),
  modificado_en       timestamptz,
  modificado_por      uuid REFERENCES usuario(id)
);

-- RF-76: el articulo se reconoce por su serie y acumula historial (RN-27)
CREATE UNIQUE INDEX ux_articulo_serie ON articulo (numero_serie) WHERE numero_serie IS NOT NULL;
CREATE INDEX ix_articulo_cliente ON articulo (id_cliente) WHERE activo;

-- RF-86: reglas versionadas. Cada orden conserva la version vigente al abrirse
CREATE TABLE regla_cobertura (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_marca          uuid REFERENCES marca(id),
  id_categoria      uuid REFERENCES categoria_articulo(id),
  meses_cobertura   smallint NOT NULL,
  exige_tienda_grupo boolean NOT NULL DEFAULT true,
  fallas_excluidas  text[],
  version           smallint NOT NULL DEFAULT 1,
  vigente_desde     date NOT NULL DEFAULT current_date,
  vigente_hasta     date,
  activa            boolean NOT NULL DEFAULT true,
  creado_por        uuid REFERENCES usuario(id),
  creado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_regla_cobertura_vigente ON regla_cobertura (id_marca, id_categoria) WHERE activa;

CREATE TABLE cobertura (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_articulo       uuid NOT NULL REFERENCES articulo(id),
  tipo              tipo_garantia NOT NULL,
  vigente_desde     date NOT NULL,
  vigente_hasta     date NOT NULL,
  documento_respaldo text,
  -- RN-28: la poliza acompana al contratante; la de proveedor, al articulo
  id_cliente_contratante uuid REFERENCES cliente(id),
  activa            boolean NOT NULL DEFAULT true,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid REFERENCES usuario(id)
);
CREATE INDEX ix_cobertura_articulo ON cobertura (id_articulo) WHERE activa;
