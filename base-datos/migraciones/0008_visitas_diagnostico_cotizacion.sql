-- =====================================================================
-- 0008 · Visitas, diagnostico y cotizacion
-- =====================================================================

CREATE TABLE visita (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden          uuid NOT NULL REFERENCES orden_servicio(id),
  id_tecnico        uuid NOT NULL REFERENCES tecnico(id),
  fecha_programada  date NOT NULL,
  franja_horaria    text NOT NULL,          -- '08:00-10:00'
  orden_recorrido   smallint,
  hora_llegada      timestamptz,
  hora_salida       timestamptz,
  resultado         resultado_visita NOT NULL DEFAULT 'programada',
  vigente           boolean NOT NULL DEFAULT true,  -- false al reprogramar o cancelar
  motivo            text,                   -- reprogramacion o visita fallida
  creado_en         timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid REFERENCES usuario(id)
);

-- RN-14: la doble programacion se vuelve imposible, no improbable
-- Una visita reprogramada deja de ser vigente y libera su franja
CREATE UNIQUE INDEX ux_visita_tecnico_franja
  ON visita (id_tecnico, fecha_programada, franja_horaria)
  WHERE vigente;
CREATE INDEX ix_visita_agenda ON visita (fecha_programada, id_tecnico);

CREATE TABLE diagnostico (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden          uuid NOT NULL REFERENCES orden_servicio(id),
  id_tecnico        uuid NOT NULL REFERENCES tecnico(id),
  id_plantilla      uuid REFERENCES checklist_plantilla(id),
  falla_real        text NOT NULL,
  componente        text,
  momento_dispositivo timestamptz NOT NULL,
  registrado_sin_conexion boolean NOT NULL DEFAULT false,
  creado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_diagnostico_orden ON diagnostico (id_orden);

-- Las mediciones son datos tipificados, no fotografias
CREATE TABLE diagnostico_item (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_diagnostico    uuid NOT NULL REFERENCES diagnostico(id),
  id_item_plantilla uuid REFERENCES checklist_item_plantilla(id),
  etiqueta          text NOT NULL,
  tipo_campo        tipo_campo_checklist NOT NULL,
  valor_numerico    numeric(12,3),
  valor_texto       text,
  valor_booleano    boolean,
  unidad            text,
  rango_min         numeric(12,3),
  rango_max         numeric(12,3),
  fuera_de_rango    boolean NOT NULL DEFAULT false   -- RF-23
);
CREATE INDEX ix_diag_item_fuera ON diagnostico_item (id_diagnostico) WHERE fuera_de_rango;

CREATE TABLE cotizacion (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden          uuid NOT NULL REFERENCES orden_servicio(id),
  mano_obra         numeric(12,2) NOT NULL DEFAULT 0,
  total_repuestos   numeric(12,2) NOT NULL DEFAULT 0,
  cargo_visita      numeric(12,2) NOT NULL DEFAULT 0,
  total             numeric(12,2) NOT NULL DEFAULT 0,
  aceptada          boolean,
  forma_aceptacion  forma_aceptacion,                 -- H6: firma o autorizacion remota
  momento_aceptacion timestamptz,
  id_evidencia_firma uuid,
  registrado_por    uuid REFERENCES usuario(id),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_cotizacion_aceptada CHECK (aceptada IS NOT TRUE OR forma_aceptacion IS NOT NULL)
);
