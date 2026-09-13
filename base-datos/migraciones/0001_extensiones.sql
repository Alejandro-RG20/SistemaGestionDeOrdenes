-- =====================================================================
-- 0001 · Extensiones y funciones de apoyo
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- busqueda por coincidencia parcial
CREATE EXTENSION IF NOT EXISTS unaccent;     -- busqueda sin acentos

-- ---------------------------------------------------------------------
-- DESVIACION RESPECTO DEL ESQUEMA ENTREGADO (unica, y obligatoria)
--
-- El esquema original usa unaccent() dentro de dos expresiones que
-- PostgreSQL exige que sean IMMUTABLE:
--   · la columna generada cliente.nombre_busqueda
--   · el indice ix_repuesto_desc_trgm
-- unaccent(text) es STABLE, no IMMUTABLE, porque resuelve el diccionario
-- de texto a traves del search_path en tiempo de ejecucion. Por eso el
-- esquema tal cual falla con: "generation expression is not immutable".
--
-- Solucion estandar documentada por PostgreSQL: envolver la llamada
-- fijando el diccionario, lo que la vuelve deterministica y por tanto
-- declarable IMMUTABLE.
--
-- CONSECUENCIA A TENER PRESENTE: si alguna vez se altera el diccionario
-- public.unaccent, hay que reconstruir el indice trigram de repuesto y
-- la columna generada de cliente (REINDEX / actualizacion masiva).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inmutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

COMMENT ON FUNCTION inmutable_unaccent(text) IS
  'Envoltura IMMUTABLE de unaccent(); requerida por la columna generada cliente.nombre_busqueda y por el indice trigram de repuesto.';
