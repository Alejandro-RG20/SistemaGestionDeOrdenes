-- =====================================================================
-- 0014 · Vistas de apoyo
-- =====================================================================

-- RF-60: panel de ordenes con plazo vencido
CREATE VIEW v_orden_plazo AS
SELECT o.id, o.numero, o.estado, o.tipo_garantia, o.id_tecnico,
       o.plazo_vence_en,
       (o.plazo_vence_en < now()) AS vencida,
       EXTRACT(EPOCH FROM (now() - o.plazo_vence_en))/3600 AS horas_de_atraso
FROM orden_servicio o
WHERE o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada');

-- RF-54: repuestos en o por debajo del punto de reorden
CREATE VIEW v_repuesto_bajo_minimo AS
SELECT r.id, r.codigo, r.descripcion, e.id_bodega, e.cantidad, r.stock_minimo
FROM repuesto r
JOIN existencia e ON e.id_repuesto = r.id
WHERE r.activo AND e.cantidad <= r.stock_minimo;

-- RF-56: verificacion de evidencia obligatoria por orden
CREATE VIEW v_evidencia_faltante AS
SELECT o.id AS id_orden, o.numero, re.clave, re.etiqueta, re.momento
FROM orden_servicio o
JOIN articulo a ON a.id = o.id_articulo
JOIN regla_evidencia re
  ON re.tipo = o.tipo_garantia
 AND re.activa
 AND (re.id_categoria IS NULL OR re.id_categoria = a.id_categoria)
 AND (re.id_marca IS NULL OR re.id_marca = a.id_marca)
WHERE re.obligatoria
  AND NOT EXISTS (
    SELECT 1 FROM evidencia ev
    WHERE ev.id_orden = o.id AND ev.clave = re.clave
  );
