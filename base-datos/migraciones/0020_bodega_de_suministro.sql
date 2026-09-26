-- =====================================================================
-- 0020 · Distinguir la bodega que SURTE de la que RECIBE piezas dañadas
-- =====================================================================
--
-- EL FALLO QUE ARREGLA ESTO
--
-- «Bodega de piezas sustituidas» es de tipo `central` —no pertenece a
-- ningun tecnico— pero no surte nada: ahi van las piezas que se RETIRAN de
-- los aparatos (H7), guardadas como respaldo del reclamo al proveedor.
--
-- El aviso de «repuesto bajo el minimo» miraba todas las bodegas centrales
-- y por eso alertaba de que faltaban piezas dañadas. Dos consecuencias, las
-- dos malas:
--
--   1. Avisos sin sentido: nadie repone un compresor quemado.
--   2. El mismo repuesto aparecia DOS VECES en el panel, una por bodega,
--      sin decir de cual hablaba.
--
-- Un panel de avisos con ruido se deja de leer, y entonces tampoco se ven
-- los avisos que si importan. Por eso se corrige en el modelo y no
-- filtrando por el nombre de la bodega, que se rompe el dia que alguien la
-- renombra.

ALTER TABLE bodega
  ADD COLUMN surte_repuestos boolean NOT NULL DEFAULT true;

-- La de piezas sustituidas no surte. Se identifica por lo que es —el
-- destino de los movimientos de pieza retirada— y no por su nombre.
UPDATE bodega SET surte_repuestos = false
 WHERE tipo = 'central'
   AND EXISTS (
     SELECT 1 FROM movimiento_repuesto m
      WHERE m.id_bodega_destino = bodega.id
        AND m.tipo = 'devolucion_pieza_sustituida'
   );

COMMENT ON COLUMN bodega.surte_repuestos IS
  'Si de esta bodega se toman piezas para reparar. La de piezas sustituidas no: ahi van las retiradas.';

-- La vista queda con el mismo umbral que tenia (`<=`: llegar al minimo ya
-- es motivo de aviso) y solo se le agrega el filtro de bodegas que surten.
-- Cambiar el umbral de paso seria colar una decision de negocio dentro de
-- una correccion.
DROP VIEW IF EXISTS v_repuesto_bajo_minimo;
CREATE VIEW v_repuesto_bajo_minimo AS
  SELECT r.id, r.codigo, r.descripcion, e.id_bodega, e.cantidad, r.stock_minimo
    FROM existencia e
    JOIN repuesto r ON r.id = e.id_repuesto
    JOIN bodega b ON b.id = e.id_bodega
   WHERE r.activo AND b.activa AND b.surte_repuestos
     AND e.cantidad <= r.stock_minimo;
