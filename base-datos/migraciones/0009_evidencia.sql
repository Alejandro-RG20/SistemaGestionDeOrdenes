-- =====================================================================
-- 0009 · Evidencia
-- =====================================================================

CREATE TABLE evidencia (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden            uuid NOT NULL REFERENCES orden_servicio(id),
  tipo                tipo_evidencia NOT NULL,
  clave               text NOT NULL,          -- casa con regla_evidencia.clave
  ruta_archivo        text,                   -- almacenamiento de objetos, nunca binario aqui (AD-09)
  huella_digital      text,                   -- AD-07: integridad verificable
  id_autor            uuid REFERENCES usuario(id),
  momento_dispositivo timestamptz NOT NULL,
  momento_servidor    timestamptz NOT NULL DEFAULT now(),
  latitud             numeric(10,7),
  longitud            numeric(10,7),
  bytes               integer,
  sincronizada        boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_evidencia_orden ON evidencia (id_orden, clave);
CREATE INDEX ix_evidencia_pendiente ON evidencia (id_orden) WHERE NOT sincronizada;

ALTER TABLE cotizacion
  ADD CONSTRAINT fk_cotizacion_firma FOREIGN KEY (id_evidencia_firma) REFERENCES evidencia(id);
