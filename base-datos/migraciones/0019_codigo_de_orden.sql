-- =====================================================================
-- 0019 · El numero de orden que ve la gente: OS-2026-000001
-- =====================================================================
--
-- POR QUE UNA COLUMNA NUEVA Y NO UN CAMBIO DE TIPO
--
-- `numero` es un bigint y lo usa medio sistema: indices, el portal del
-- cliente, los filtros de la bandeja y treinta mil filas ya sembradas.
-- Convertirlo a texto obligaria a reescribir todo eso de golpe y, sobre
-- todo, a decidir que pasa con las ordenes viejas.
--
-- `codigo` se agrega al lado: es EL numero de orden para las personas —el
-- que va en el comprobante y el que el cliente dicta por telefono— y
-- `numero` queda como la secuencia interna. El codigo lleva el año porque
-- es lo que pide el pliego y porque, en un centro que hace 150 ordenes al
-- dia, saber el año sin buscar la fecha sirve.
--
-- Se calcula en la base, no en el codigo de la aplicacion, para que sea
-- imposible insertar una orden sin el.

ALTER TABLE orden_servicio ADD COLUMN codigo text;

-- Relleno de lo ya existente: el año de recepcion y el correlativo dentro
-- de ese año, por orden de numero. Es determinista, asi que dos ejecuciones
-- darian lo mismo.
WITH numerada AS (
  SELECT id,
         extract(year FROM fecha_recepcion)::int AS anio,
         row_number() OVER (
           PARTITION BY extract(year FROM fecha_recepcion)
           ORDER BY numero
         ) AS correlativo
    FROM orden_servicio
)
UPDATE orden_servicio o
   SET codigo = 'OS-' || n.anio || '-' || lpad(n.correlativo::text, 6, '0')
  FROM numerada n
 WHERE n.id = o.id;

ALTER TABLE orden_servicio
  ALTER COLUMN codigo SET NOT NULL,
  ADD CONSTRAINT ux_orden_codigo UNIQUE (codigo),
  ADD CONSTRAINT ck_orden_codigo_forma CHECK (codigo ~ '^OS-[0-9]{4}-[0-9]{6}$');

-- Un correlativo por año. `pg_advisory_xact_lock` serializa las altas
-- simultaneas del mismo año: sin el, dos recepciones en el mismo segundo
-- calcularian el mismo correlativo y una de las dos fallaria por el UNIQUE
-- —con el cliente delante del mostrador—.
CREATE OR REPLACE FUNCTION fn_codigo_de_orden() RETURNS trigger AS $$
DECLARE
  anio int;
  siguiente int;
BEGIN
  IF NEW.codigo IS NOT NULL THEN RETURN NEW; END IF;

  anio := extract(year FROM coalesce(NEW.fecha_recepcion, now()))::int;
  PERFORM pg_advisory_xact_lock(hashtext('orden_codigo_' || anio));

  SELECT coalesce(max(substring(codigo from 9 for 6)::int), 0) + 1
    INTO siguiente
    FROM orden_servicio
   WHERE codigo LIKE 'OS-' || anio || '-%';

  NEW.codigo := 'OS-' || anio || '-' || lpad(siguiente::text, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_codigo_de_orden
  BEFORE INSERT ON orden_servicio
  FOR EACH ROW EXECUTE FUNCTION fn_codigo_de_orden();

COMMENT ON COLUMN orden_servicio.codigo IS
  'El numero de orden para las personas (OS-2026-000001). Se asigna en la base y no cambia.';
