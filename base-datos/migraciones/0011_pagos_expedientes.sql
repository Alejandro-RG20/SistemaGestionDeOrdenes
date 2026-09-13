-- =====================================================================
-- 0011 · Pagos y expedientes de cobro
-- =====================================================================

CREATE TABLE pago (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden      uuid NOT NULL REFERENCES orden_servicio(id),
  monto         numeric(12,2) NOT NULL,
  forma_pago    text NOT NULL,
  referencia    text,
  id_evidencia  uuid REFERENCES evidencia(id),   -- comprobante de pago
  creado_por    uuid REFERENCES usuario(id),
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expediente_cobro (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden          uuid NOT NULL UNIQUE REFERENCES orden_servicio(id),
  destinatario      text NOT NULL CHECK (destinatario IN ('proveedor','poliza')),
  id_marca          uuid REFERENCES marca(id),
  monto_reclamado   numeric(12,2) NOT NULL DEFAULT 0,
  monto_cobrado     numeric(12,2),
  estado            estado_expediente NOT NULL DEFAULT 'en_conformacion',
  evidencia_completa boolean NOT NULL DEFAULT false,  -- RF-57: bloquea el envio
  fecha_envio       date,
  fecha_resultado   date,
  motivo_rechazo    text,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  modificado_en     timestamptz,
  modificado_por    uuid REFERENCES usuario(id)
);
CREATE INDEX ix_expediente_estado ON expediente_cobro (estado, fecha_envio);
CREATE INDEX ix_expediente_bloqueado ON expediente_cobro (id_marca) WHERE NOT evidencia_completa;
