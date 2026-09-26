-- =====================================================================
-- 0017 · Proveedores y compras (RF-36, RF-37)
-- =====================================================================
--
-- El jefe de compras pide al proveedor lo que bodega no tiene; bodega
-- registra la recepcion fisica y ESA recepcion es la que mueve el
-- inventario, no la compra.
--
-- Esa separacion es deliberada y es el corazon de la tabla. Una compra
-- registrada no es mercaderia: es una promesa. Si la compra sumara
-- existencia al crearse, el sistema diria que hay compresores en bodega
-- mientras siguen en un camion, y un tecnico saldria a una casa confiando
-- en una pieza que no existe. La existencia la mueve
-- `movimiento_repuesto` cuando el bodeguero cuenta lo que llego.

CREATE TYPE estado_compra AS ENUM (
  'borrador',
  'enviada',
  'confirmada',
  'recibida_parcial',
  'recibida',
  'cancelada'
);

CREATE TABLE proveedor (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo            text NOT NULL UNIQUE,
  nombre            text NOT NULL,
  contacto          text,
  telefono          text,
  correo            text,
  direccion         text,
  -- Un proveedor puede ser ademas a quien se le reclama la garantia. Se
  -- marca para que el expediente de cobro pueda ofrecer solo esos.
  atiende_garantias boolean NOT NULL DEFAULT false,
  activo            boolean NOT NULL DEFAULT true,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid REFERENCES usuario(id),
  modificado_en     timestamptz,
  modificado_por    uuid REFERENCES usuario(id)
);
CREATE INDEX ix_proveedor_activo ON proveedor (nombre) WHERE activo;

CREATE TABLE compra (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero            bigint NOT NULL UNIQUE,
  id_proveedor      uuid NOT NULL REFERENCES proveedor(id),
  estado            estado_compra NOT NULL DEFAULT 'borrador',
  fecha_pedido      date NOT NULL DEFAULT current_date,
  fecha_estimada    date,
  total             numeric(12,2) NOT NULL DEFAULT 0,
  observacion       text,
  motivo_cancelacion text,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid REFERENCES usuario(id),
  modificado_en     timestamptz,
  modificado_por    uuid REFERENCES usuario(id),

  CONSTRAINT ck_compra_cancelada
    CHECK (estado <> 'cancelada' OR motivo_cancelacion IS NOT NULL)
);
CREATE SEQUENCE compra_numero_seq START 1000 OWNED BY compra.numero;
ALTER TABLE compra ALTER COLUMN numero SET DEFAULT nextval('compra_numero_seq');
CREATE INDEX ix_compra_estado ON compra (estado, fecha_pedido DESC);

CREATE TABLE compra_detalle (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_compra         uuid NOT NULL REFERENCES compra(id) ON DELETE CASCADE,
  id_repuesto       uuid NOT NULL REFERENCES repuesto(id),
  cantidad          integer NOT NULL CHECK (cantidad > 0),
  -- Lo ya contado por bodega. Nunca puede pasar de lo pedido: recibir de
  -- mas es una discrepancia que se resuelve con un ajuste explicito, no
  -- inflando la linea en silencio.
  cantidad_recibida integer NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
  precio_unitario   numeric(12,2) NOT NULL CHECK (precio_unitario >= 0),
  -- Si la compra nace de una solicitud concreta, se guarda el vinculo: es
  -- lo que permite contestarle al tecnico «su compresor viene en la compra
  -- 1043, llega el jueves».
  id_solicitud      uuid REFERENCES solicitud_repuesto(id),

  CONSTRAINT ck_detalle_recibido CHECK (cantidad_recibida <= cantidad),
  CONSTRAINT ux_compra_repuesto UNIQUE (id_compra, id_repuesto)
);
CREATE INDEX ix_compra_detalle_repuesto ON compra_detalle (id_repuesto);

COMMENT ON TABLE compra IS
  'Pedido al proveedor. NO mueve inventario: eso lo hace la recepcion fisica en movimiento_repuesto.';
