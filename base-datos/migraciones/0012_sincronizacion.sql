-- =====================================================================
-- 0012 · Sincronizacion (H9)
-- =====================================================================

-- AD-03: la clave de idempotencia evita duplicar al reintentar
CREATE TABLE operacion_sincronizada (
  id_operacion      uuid PRIMARY KEY,              -- generado en el dispositivo
  id_dispositivo    uuid NOT NULL REFERENCES dispositivo(id),
  tipo_operacion    text NOT NULL,
  id_entidad        uuid,
  resultado         jsonb NOT NULL,
  aceptada          boolean NOT NULL,
  momento_dispositivo timestamptz NOT NULL,
  procesada_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_operacion_dispositivo ON operacion_sincronizada (id_dispositivo, procesada_en);

-- RF-64 · RN-19: nada de lo registrado en campo se descarta
CREATE TABLE excepcion_sincronizacion (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_operacion      uuid REFERENCES operacion_sincronizada(id_operacion),
  id_orden          uuid REFERENCES orden_servicio(id),
  id_tecnico        uuid REFERENCES tecnico(id),
  motivo            text NOT NULL,
  carga_original    jsonb NOT NULL,                -- se conserva integra
  estado            estado_excepcion NOT NULL DEFAULT 'pendiente',
  resuelta_por      uuid REFERENCES usuario(id),
  resuelta_en       timestamptz,
  resolucion        text,
  creado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_excepcion_pendiente ON excepcion_sincronizacion (creado_en) WHERE estado = 'pendiente';
