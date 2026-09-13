-- =====================================================================
-- 0004 · Clientes y ubicacion
-- =====================================================================

CREATE TABLE zona (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_centro     uuid NOT NULL REFERENCES centro(id),
  nombre        text NOT NULL,
  cargo_visita  numeric(12,2) NOT NULL DEFAULT 0,
  activa        boolean NOT NULL DEFAULT true
);

CREATE TABLE cliente (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_centro         uuid NOT NULL REFERENCES centro(id),
  nombres           text NOT NULL,
  apellidos         text,
  identificacion    text,
  correo            text,
  -- columna calculada para busqueda sin acentos ni mayusculas
  -- (inmutable_unaccent: ver nota en la migracion 0001)
  nombre_busqueda   text GENERATED ALWAYS AS (
                      lower(inmutable_unaccent(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')))
                    ) STORED,
  -- RF-75: fusion de duplicados
  id_cliente_principal uuid REFERENCES cliente(id),
  activo            boolean NOT NULL DEFAULT true,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid REFERENCES usuario(id),
  modificado_en     timestamptz,
  modificado_por    uuid REFERENCES usuario(id)
);

-- RF-07, RNF-01: busqueda incremental en menos de 300 ms sobre 110 000 ordenes
CREATE INDEX ix_cliente_busqueda_trgm ON cliente USING gin (nombre_busqueda gin_trgm_ops);
CREATE INDEX ix_cliente_identificacion ON cliente (identificacion) WHERE identificacion IS NOT NULL;

-- RF-71: historico de telefonos. El anterior se conserva (RN-22)
CREATE TABLE cliente_telefono (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_cliente    uuid NOT NULL REFERENCES cliente(id),
  numero        text NOT NULL,
  tipo          text,
  vigente       boolean NOT NULL DEFAULT true,
  desde         date NOT NULL DEFAULT current_date,
  hasta         date
);
CREATE INDEX ix_telefono_numero ON cliente_telefono (numero);
-- RF-66: el portal acepta el telefono vigente o el registrado en la orden
CREATE UNIQUE INDEX ux_telefono_vigente ON cliente_telefono (id_cliente, numero) WHERE vigente;

-- RF-72: historico de direcciones
CREATE TABLE cliente_direccion (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_cliente    uuid NOT NULL REFERENCES cliente(id),
  id_zona       uuid REFERENCES zona(id),
  detalle       text NOT NULL,
  referencia    text,
  principal     boolean NOT NULL DEFAULT false,
  vigente       boolean NOT NULL DEFAULT true,
  desde         date NOT NULL DEFAULT current_date,
  hasta         date
);
