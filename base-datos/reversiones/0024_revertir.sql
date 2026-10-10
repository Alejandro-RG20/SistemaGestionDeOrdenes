-- =====================================================================
-- Reversion manual de la migracion 0024 (estado «autorizada»)
-- =====================================================================
--
-- PostgreSQL no admite `ALTER TYPE ... DROP VALUE`. Revertir de verdad
-- exige recrear el enumerado, y eso solo es seguro si ninguna fila usa el
-- valor. Por eso esta reversion NO toca el tipo: comprueba y documenta.
--
-- 1. Respaldo:
--      pg_dump -Fc servitotal > respaldo_antes_de_revertir_0024.dump
-- 2. Con el codigo anterior desplegado, ninguna orden puede llegar a
--    «autorizada». Si ya hay alguna, hay que moverla con una transicion
--    valida ANTES de volver al codigo anterior, porque ese codigo no sabe
--    que hacer con ella. Esta consulta las lista:

SELECT o.codigo, o.estado, o.modificado_en
  FROM orden_servicio o
 WHERE o.estado::text = 'autorizada';

-- 3. El valor puede quedarse en el enumerado sin efecto alguno: ningun
--    codigo anterior lo usa y no ocupa nada. Quitarlo exigiria crear un
--    tipo nuevo y convertir las columnas orden_servicio.estado,
--    evento_orden.estado_anterior/estado_nuevo y regla_plazo.estado; no se
--    recomienda hacerlo sobre datos reales.
