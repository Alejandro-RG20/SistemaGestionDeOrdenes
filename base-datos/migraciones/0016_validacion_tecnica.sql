-- =====================================================================
-- 0016 · Validacion tecnica (RF-30, RF-41, RF-42)
-- =====================================================================
--
-- El jefe de tecnicos revisa el trabajo antes de que la orden se declare
-- terminada: diagnostico, reparacion, evidencias y repuestos usados.
--
-- DOS REGLAS QUE VIVEN AQUI, EN LA BASE, Y NO SOLO EN EL CODIGO
--
--  1. NADIE VALIDA SU PROPIO TRABAJO. El pliego lo pide (§47) y es la
--     razon de ser del control: una validacion que el mismo tecnico se
--     firma no es una revision, es un tramite. La restriccion compara el
--     validador contra el tecnico de la orden.
--
--  2. UNA CORRECCION NO BORRA EL RECHAZO ANTERIOR. Cada revision es una
--     fila nueva. Saber que una reparacion se rechazo dos veces antes de
--     aprobarse es justo lo que sirve para detectar reincidencia; pisar la
--     fila anterior lo perderia.

CREATE TYPE resultado_validacion AS ENUM (
  'aprobada',
  'rechazada',
  'requiere_correccion'
);

CREATE TABLE validacion_tecnica (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden          uuid NOT NULL REFERENCES orden_servicio(id),
  id_diagnostico    uuid REFERENCES diagnostico(id),
  resultado         resultado_validacion NOT NULL,
  observacion       text NOT NULL,            -- rechazar sin decir por que no ayuda a nadie
  -- Lo que el jefe declara haber revisado. Se guarda para que el expediente
  -- de cobro pueda decir «un jefe reviso estas evidencias», no solo «alguien
  -- aprobo».
  reviso_diagnostico boolean NOT NULL DEFAULT false,
  reviso_reparacion  boolean NOT NULL DEFAULT false,
  reviso_evidencias  boolean NOT NULL DEFAULT false,
  reviso_repuestos   boolean NOT NULL DEFAULT false,
  id_validador      uuid NOT NULL REFERENCES usuario(id),
  momento           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_validacion_orden ON validacion_tecnica (id_orden, momento DESC);

-- El tecnico de la orden no puede ser el validador. Se comprueba con un
-- disparador porque la comparacion cruza dos tablas y un CHECK no puede.
CREATE OR REPLACE FUNCTION fn_validacion_no_propia() RETURNS trigger AS $$
DECLARE
  usuario_del_tecnico uuid;
BEGIN
  SELECT t.id_usuario INTO usuario_del_tecnico
    FROM orden_servicio o JOIN tecnico t ON t.id = o.id_tecnico
   WHERE o.id = NEW.id_orden;

  IF usuario_del_tecnico IS NOT NULL AND usuario_del_tecnico = NEW.id_validador THEN
    RAISE EXCEPTION 'Un tecnico no puede validar su propio trabajo.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_validacion_no_propia
  BEFORE INSERT ON validacion_tecnica
  FOR EACH ROW EXECUTE FUNCTION fn_validacion_no_propia();

COMMENT ON TABLE validacion_tecnica IS
  'Revision del jefe de tecnicos. Cada revision es una fila: el historial de rechazos no se pisa.';
