-- =====================================================================
-- 0013 · Auditoria (RF-85)
-- =====================================================================

CREATE TABLE bitacora (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tabla             text NOT NULL,
  id_registro       uuid NOT NULL,
  accion            text NOT NULL CHECK (accion IN ('crear','modificar','desactivar','anular','fusionar')),
  campo             text,
  valor_anterior    text,
  valor_nuevo       text,
  motivo            text,                     -- RN-24: obligatorio en campos sensibles
  id_usuario        uuid NOT NULL REFERENCES usuario(id),
  momento           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_bitacora_registro ON bitacora (tabla, id_registro, momento);
