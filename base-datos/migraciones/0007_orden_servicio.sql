-- =====================================================================
-- 0007 · Orden de servicio
-- =====================================================================

CREATE SEQUENCE orden_numero_seq START 10000;

CREATE TABLE orden_servicio (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),  -- generado en el dispositivo (AD-03)
  id_centro             uuid NOT NULL REFERENCES centro(id),
  numero                bigint NOT NULL UNIQUE DEFAULT nextval('orden_numero_seq'), -- lo asigna el servidor
  id_cliente            uuid NOT NULL REFERENCES cliente(id),
  id_articulo           uuid NOT NULL REFERENCES articulo(id),
  id_tecnico            uuid REFERENCES tecnico(id),
  modalidad             modalidad_servicio NOT NULL,
  estado                estado_orden NOT NULL DEFAULT 'registrada',
  tipo_garantia         tipo_garantia NOT NULL DEFAULT 'por_validar',
  id_responsable_actual uuid REFERENCES usuario(id),                  -- H1 · RN-10

  -- ── datos congelados al crearse la orden (RN-22) ──
  telefono_contacto     text NOT NULL,
  direccion_servicio    text,
  referencia_ubicacion  text,
  id_zona               uuid REFERENCES zona(id),
  cargo_visita          numeric(12,2) NOT NULL DEFAULT 0,
  id_regla_cobertura    uuid REFERENCES regla_cobertura(id),          -- version aplicada

  falla_reportada       text NOT NULL,
  fecha_recepcion       timestamptz NOT NULL DEFAULT now(),
  fecha_estado_desde    timestamptz NOT NULL DEFAULT now(),           -- base del calculo de plazo
  plazo_vence_en        timestamptz,
  fecha_entrega         timestamptz,
  total                 numeric(12,2) NOT NULL DEFAULT 0,
  levantada_en_campo    boolean NOT NULL DEFAULT false,               -- H4
  motivo_anulacion      text,

  creado_en             timestamptz NOT NULL DEFAULT now(),
  creado_por            uuid REFERENCES usuario(id),
  modificado_en         timestamptz,
  modificado_por        uuid REFERENCES usuario(id),

  CONSTRAINT ck_orden_anulada CHECK (estado <> 'anulada' OR motivo_anulacion IS NOT NULL)
);

-- RNF-02: la bandeja consulta ordenes activas, que son una fraccion de la tabla
CREATE INDEX ix_orden_activas ON orden_servicio (estado, plazo_vence_en)
  WHERE estado NOT IN ('entregada','cerrada_sin_reparar','anulada');
CREATE INDEX ix_orden_tecnico ON orden_servicio (id_tecnico, estado)
  WHERE estado NOT IN ('entregada','cerrada_sin_reparar','anulada');
CREATE INDEX ix_orden_cliente ON orden_servicio (id_cliente);
CREATE INDEX ix_orden_articulo ON orden_servicio (id_articulo);
CREATE INDEX ix_orden_numero ON orden_servicio (numero);
-- RN-16: ordenes con plazo vencido, para el panel de jefaturas
CREATE INDEX ix_orden_vencidas ON orden_servicio (plazo_vence_en)
  WHERE estado NOT IN ('entregada','cerrada_sin_reparar','anulada');

-- Bitacora inmutable. No se modifica ni se elimina (RN-18)
CREATE TABLE evento_orden (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden          uuid NOT NULL REFERENCES orden_servicio(id),
  estado_anterior   estado_orden,
  estado_nuevo      estado_orden NOT NULL,
  id_responsable    uuid REFERENCES usuario(id),
  momento           timestamptz NOT NULL DEFAULT now(),
  momento_dispositivo timestamptz,          -- cuando ocurrio realmente en campo
  registrado_sin_conexion boolean NOT NULL DEFAULT false,
  observacion       text
);
CREATE INDEX ix_evento_orden ON evento_orden (id_orden, momento);

-- RF-83 · RN-29: una orden cerrada no se edita, se le adjunta una nota
CREATE TABLE nota_correccion (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden      uuid NOT NULL REFERENCES orden_servicio(id),
  motivo        text NOT NULL,
  detalle       text NOT NULL,
  creado_por    uuid NOT NULL REFERENCES usuario(id),
  creado_en     timestamptz NOT NULL DEFAULT now()
);
