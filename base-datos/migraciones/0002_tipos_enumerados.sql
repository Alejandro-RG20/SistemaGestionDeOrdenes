-- =====================================================================
-- 0002 · Tipos enumerados
-- =====================================================================

CREATE TYPE tipo_garantia AS ENUM (
  'proveedor',        -- la cubre el fabricante de la marca
  'adicional',        -- poliza extendida contratada por el cliente
  'particular',       -- la paga el cliente
  'por_validar'       -- orden levantada en campo, pendiente de confirmar (H4)
);

CREATE TYPE modalidad_servicio AS ENUM ('ruta', 'taller');

-- 13 valores (H5: 'en_ruta' y 'en_cola_taller' separados)
CREATE TYPE estado_orden AS ENUM (
  'registrada',
  'asignada',
  'en_ruta',
  'en_cola_taller',
  'en_diagnostico',
  'cotizada',
  'esperando_autorizacion',
  'esperando_repuesto',
  'en_reparacion',
  'finalizada',
  'entregada',
  'cerrada_sin_reparar',
  'anulada'
);

CREATE TYPE resultado_visita AS ENUM (
  'programada',
  'resuelta_en_sitio',
  'requiere_traslado_taller',
  'cliente_ausente',
  'no_autorizada'
);

CREATE TYPE tipo_movimiento AS ENUM (
  'ingreso',                    -- compra local o pedido al proveedor
  'despacho_a_movil',           -- central  -> bodega movil
  'devolucion_a_central',       -- bodega movil -> central
  'consumo',                    -- bodega -> orden
  'devolucion_pieza_sustituida',-- H7: pieza retirada del articulo
  'ajuste'                      -- H8: correccion con justificacion
);

CREATE TYPE tipo_bodega AS ENUM ('central', 'movil');

CREATE TYPE tipo_evidencia AS ENUM ('foto', 'firma', 'documento', 'medicion');

CREATE TYPE tipo_campo_checklist AS ENUM ('numerico', 'seleccion', 'texto', 'foto', 'booleano');

CREATE TYPE momento_evidencia AS ENUM ('recepcion', 'validacion_garantia', 'diagnostico', 'reparacion', 'entrega');

CREATE TYPE estado_expediente AS ENUM (
  'en_conformacion',
  'bloqueado_por_evidencia',
  'listo_para_enviar',
  'enviado',
  'aceptado',
  'rechazado',
  'pagado'
);

CREATE TYPE via_abastecimiento AS ENUM ('compra_local', 'pedido_proveedor');

CREATE TYPE forma_aceptacion AS ENUM ('firma_presencial', 'llamada', 'mensaje', 'correo'); -- H6

CREATE TYPE estado_excepcion AS ENUM ('pendiente', 'resuelta', 'descartada');
