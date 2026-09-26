/**
 * Los reportes del pliego (RF-51), cada uno con su consulta.
 *
 * UN SOLO ENDPOINT PARA LOS DIECISIETE. Todos devuelven lo mismo —columnas
 * tipadas y filas— asi que el panel tiene UNA pantalla que los dibuja
 * todos, y agregar un reporte es agregar una entrada a esta lista, no una
 * pantalla nueva. Diecisiete endpoints y diecisiete pantallas para
 * diecisiete `SELECT` es trabajo que nadie mantiene.
 *
 * TRES DECISIONES QUE VALE LA PENA CONOCER
 *
 *  1. Las columnas viajan CON SU TIPO. El panel no puede adivinar si 4850
 *     son cordobas, dias u ordenes, y un reporte que formatea mal un
 *     numero no se puede defender ante nadie.
 *
 *  2. Los rangos se aplican en SQL, con parametros. Nada se concatena.
 *
 *  3. Varios llevan `advertencia`: dicen como leer el resultado. Un
 *     promedio de reparacion calculado sobre 4 ordenes no significa lo
 *     mismo que sobre 400, y callarlo produce decisiones equivocadas con
 *     cara de dato duro.
 */
import { TIPO_COLUMNA, type ColumnaDeReporte, type DefinicionDeReporte } from '@servitotal/compartido';

export interface Reporte extends DefinicionDeReporte {
  readonly columnas: readonly ColumnaDeReporte[];
  /** `$1` = desde, `$2` = hasta. Ambos pueden venir nulos. */
  readonly consulta: string;
  /** Columnas que se suman en la fila de totales. */
  readonly sumar?: readonly string[];
  readonly advertencia?: string;
}

const { TEXTO, NUMERO, DINERO, PORCENTAJE, HORAS } = TIPO_COLUMNA;

const col = (clave: string, etiqueta: string, tipo: ColumnaDeReporte['tipo']): ColumnaDeReporte =>
  ({ clave, etiqueta, tipo });

/** Filtro de rango comun. Con rango nulo, el reporte cubre todo. */
const EN_RANGO = `($1::timestamptz IS NULL OR o.fecha_recepcion >= $1)
                  AND ($2::timestamptz IS NULL OR o.fecha_recepcion < $2)`;

export const REPORTES: readonly Reporte[] = [
  {
    clave: 'ordenes_por_estado',
    titulo: 'Ordenes por estado',
    proposito: 'Donde esta parado el trabajo ahora mismo.',
    grupo: 'operacion',
    admiteRango: true,
    columnas: [col('estado', 'Estado', TEXTO), col('ordenes', 'Ordenes', NUMERO)],
    sumar: ['ordenes'],
    consulta: `SELECT replace(o.estado::text, '_', ' ') AS estado, count(*)::int AS ordenes
                 FROM orden_servicio o WHERE ${EN_RANGO}
                GROUP BY o.estado ORDER BY count(*) DESC`,
  },
  {
    clave: 'ordenes_por_tienda',
    titulo: 'Ordenes por tienda',
    proposito: 'De que sucursal entra el trabajo.',
    grupo: 'operacion',
    admiteRango: true,
    columnas: [
      col('tienda', 'Tienda', TEXTO), col('ordenes', 'Ordenes', NUMERO),
      col('abiertas', 'Abiertas', NUMERO),
    ],
    sumar: ['ordenes', 'abiertas'],
    consulta: `SELECT coalesce(t.nombre, 'Sin tienda registrada') AS tienda,
                      count(*)::int AS ordenes,
                      count(*) FILTER (
                        WHERE o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
                      )::int AS abiertas
                 FROM orden_servicio o
                 LEFT JOIN tienda_origen t ON t.id = o.id_tienda
                WHERE ${EN_RANGO}
                GROUP BY t.nombre ORDER BY count(*) DESC`,
  },
  {
    clave: 'ordenes_por_marca',
    titulo: 'Ordenes por marca',
    proposito: 'Que marcas generan mas servicio. Sirve para negociar con el proveedor.',
    grupo: 'operacion',
    admiteRango: true,
    columnas: [
      col('marca', 'Marca', TEXTO), col('ordenes', 'Ordenes', NUMERO),
      col('garantia_proveedor', 'Por garantia', NUMERO),
    ],
    sumar: ['ordenes', 'garantia_proveedor'],
    consulta: `SELECT m.nombre AS marca, count(*)::int AS ordenes,
                      count(*) FILTER (WHERE o.tipo_garantia = 'proveedor')::int
                        AS garantia_proveedor
                 FROM orden_servicio o
                 JOIN articulo a ON a.id = o.id_articulo
                 JOIN marca m ON m.id = a.id_marca
                WHERE ${EN_RANGO}
                GROUP BY m.nombre ORDER BY count(*) DESC`,
  },
  {
    clave: 'ordenes_por_garantia',
    titulo: 'Ordenes por tipo de garantia',
    proposito: 'Quien paga el trabajo del centro.',
    grupo: 'dinero',
    admiteRango: true,
    columnas: [
      col('garantia', 'Garantia', TEXTO), col('ordenes', 'Ordenes', NUMERO),
      col('monto', 'Monto facturado', DINERO),
    ],
    sumar: ['ordenes', 'monto'],
    consulta: `SELECT replace(o.tipo_garantia::text, '_', ' ') AS garantia,
                      count(*)::int AS ordenes, coalesce(sum(o.total), 0) AS monto
                 FROM orden_servicio o WHERE ${EN_RANGO}
                GROUP BY o.tipo_garantia ORDER BY count(*) DESC`,
  },
  {
    clave: 'productividad_tecnicos',
    titulo: 'Productividad por tecnico',
    proposito: 'Cuanto cierra cada tecnico y cuanto le queda abierto.',
    grupo: 'tecnico',
    admiteRango: true,
    columnas: [
      col('tecnico', 'Tecnico', TEXTO), col('tipo', 'Tipo', TEXTO),
      col('asignadas', 'Asignadas', NUMERO), col('cerradas', 'Cerradas', NUMERO),
      col('abiertas', 'Abiertas', NUMERO),
    ],
    sumar: ['asignadas', 'cerradas', 'abiertas'],
    advertencia: 'Un tecnico con pocas ordenes puede estar en capacitacion o recien ingresado. '
      + 'El numero solo no dice si trabaja bien.',
    consulta: `SELECT u.nombres AS tecnico, t.tipo::text AS tipo,
                      count(*)::int AS asignadas,
                      count(*) FILTER (
                        WHERE o.estado IN ('entregada','cerrada_sin_reparar')
                      )::int AS cerradas,
                      count(*) FILTER (
                        WHERE o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
                      )::int AS abiertas
                 FROM orden_servicio o
                 JOIN tecnico t ON t.id = o.id_tecnico
                 JOIN usuario u ON u.id = t.id_usuario
                WHERE ${EN_RANGO}
                GROUP BY u.nombres, t.tipo ORDER BY count(*) DESC`,
  },
  {
    clave: 'tiempos_de_reparacion',
    titulo: 'Tiempo hasta la entrega',
    proposito: 'Cuanto tarda el centro, de la recepcion a la entrega.',
    grupo: 'tecnico',
    admiteRango: true,
    columnas: [
      col('modalidad', 'Modalidad', TEXTO), col('ordenes', 'Ordenes cerradas', NUMERO),
      col('promedio_horas', 'Promedio', HORAS), col('maximo_horas', 'La peor', HORAS),
    ],
    advertencia: 'Son horas corridas, no laborables: incluyen noches y domingos. El plazo '
      + 'comprometido se mide aparte, en horas de taller.',
    consulta: `SELECT replace(o.modalidad::text, '_', ' ') AS modalidad,
                      count(*)::int AS ordenes,
                      round(avg(extract(epoch FROM (o.fecha_entrega - o.fecha_recepcion)) / 3600)::numeric, 1)
                        AS promedio_horas,
                      round(max(extract(epoch FROM (o.fecha_entrega - o.fecha_recepcion)) / 3600)::numeric, 1)
                        AS maximo_horas
                 FROM orden_servicio o
                WHERE o.fecha_entrega IS NOT NULL AND ${EN_RANGO}
                GROUP BY o.modalidad`,
  },
  {
    clave: 'tiempos_de_diagnostico',
    titulo: 'Tiempo hasta el diagnostico',
    proposito: 'Cuanto tarda en saberse que tiene el equipo.',
    grupo: 'tecnico',
    admiteRango: true,
    columnas: [
      col('categoria', 'Categoria', TEXTO), col('diagnosticos', 'Diagnosticos', NUMERO),
      col('promedio_horas', 'Promedio', HORAS),
    ],
    consulta: `SELECT c.nombre AS categoria, count(*)::int AS diagnosticos,
                      round(avg(extract(epoch FROM (d.creado_en - o.fecha_recepcion)) / 3600)::numeric, 1)
                        AS promedio_horas
                 FROM diagnostico d
                 JOIN orden_servicio o ON o.id = d.id_orden
                 JOIN articulo a ON a.id = o.id_articulo
                 JOIN categoria_articulo c ON c.id = a.id_categoria
                WHERE ${EN_RANGO}
                GROUP BY c.nombre ORDER BY avg(extract(epoch FROM (d.creado_en - o.fecha_recepcion))) DESC`,
  },
  {
    clave: 'cumplimiento_de_plazo',
    titulo: 'Cumplimiento del plazo',
    proposito: 'Que proporcion del trabajo cerrado salio a tiempo.',
    grupo: 'operacion',
    admiteRango: true,
    columnas: [
      col('modalidad', 'Modalidad', TEXTO), col('cerradas', 'Cerradas', NUMERO),
      col('a_tiempo', 'A tiempo', NUMERO), col('cumplimiento', 'Cumplimiento', PORCENTAJE),
    ],
    advertencia: 'Solo cuenta lo cerrado que tenia plazo. Lo que sigue abierto y vencido no '
      + 'aparece aqui: para eso esta el panel de alertas.',
    consulta: `SELECT replace(o.modalidad::text, '_', ' ') AS modalidad,
                      count(*)::int AS cerradas,
                      count(*) FILTER (WHERE o.fecha_entrega <= o.plazo_vence_en)::int AS a_tiempo,
                      round(100.0 * count(*) FILTER (WHERE o.fecha_entrega <= o.plazo_vence_en)
                            / nullif(count(*), 0), 1) AS cumplimiento
                 FROM orden_servicio o
                WHERE o.fecha_entrega IS NOT NULL AND o.plazo_vence_en IS NOT NULL AND ${EN_RANGO}
                GROUP BY o.modalidad`,
  },
  {
    clave: 'ordenes_anuladas',
    titulo: 'Ordenes anuladas',
    proposito: 'Por que se cae el trabajo. Cada motivo repetido es un proceso que falla.',
    grupo: 'operacion',
    admiteRango: true,
    columnas: [col('motivo', 'Motivo', TEXTO), col('ordenes', 'Ordenes', NUMERO)],
    sumar: ['ordenes'],
    consulta: `SELECT coalesce(o.motivo_anulacion, 'Sin motivo registrado') AS motivo,
                      count(*)::int AS ordenes
                 FROM orden_servicio o
                WHERE o.estado = 'anulada' AND ${EN_RANGO}
                GROUP BY o.motivo_anulacion ORDER BY count(*) DESC`,
  },
  {
    clave: 'visitas',
    titulo: 'Resultado de las visitas',
    proposito: 'Cuantas visitas terminan en nada, y por que.',
    grupo: 'tecnico',
    admiteRango: true,
    columnas: [
      col('resultado', 'Resultado', TEXTO), col('visitas', 'Visitas', NUMERO),
      col('proporcion', 'Proporcion', PORCENTAJE),
    ],
    sumar: ['visitas'],
    advertencia: 'Una visita con cliente ausente cuesta un traslado y no repara nada. '
      + 'Si sube, el problema esta en la confirmacion previa, no en el tecnico.',
    consulta: `SELECT replace(v.resultado::text, '_', ' ') AS resultado,
                      count(*)::int AS visitas,
                      round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS proporcion
                 FROM visita v
                 JOIN orden_servicio o ON o.id = v.id_orden
                WHERE ${EN_RANGO}
                GROUP BY v.resultado ORDER BY count(*) DESC`,
  },
  {
    clave: 'repuestos_mas_usados',
    titulo: 'Repuestos mas consumidos',
    proposito: 'Que hay que tener siempre en bodega.',
    grupo: 'inventario',
    admiteRango: true,
    columnas: [
      col('codigo', 'Codigo', TEXTO), col('descripcion', 'Repuesto', TEXTO),
      col('piezas', 'Piezas', NUMERO), col('monto', 'Costo', DINERO),
    ],
    sumar: ['piezas', 'monto'],
    consulta: `SELECT r.codigo, r.descripcion, sum(m.cantidad)::int AS piezas,
                      sum(m.cantidad * m.precio_unitario) AS monto
                 FROM movimiento_repuesto m
                 JOIN repuesto r ON r.id = m.id_repuesto
                 JOIN orden_servicio o ON o.id = m.id_orden
                WHERE m.tipo = 'consumo' AND ${EN_RANGO}
                GROUP BY r.codigo, r.descripcion ORDER BY sum(m.cantidad) DESC LIMIT 50`,
  },
  {
    clave: 'inventario_critico',
    titulo: 'Inventario bajo el minimo',
    proposito: 'Que hay que pedir ya. Es una foto de hoy, no de un rango.',
    grupo: 'inventario',
    admiteRango: false,
    columnas: [
      col('codigo', 'Codigo', TEXTO), col('descripcion', 'Repuesto', TEXTO),
      col('bodega', 'Bodega', TEXTO), col('existencia', 'Hay', NUMERO),
      col('minimo', 'Minimo', NUMERO),
    ],
    // Sale de la MISMA vista que el aviso del panel. Si el reporte usara
    // su propio criterio, el panel diria «93 repuestos bajo minimo» y el
    // reporte otra cosa, y nadie sabria a cual creerle.
    consulta: `SELECT v.codigo, v.descripcion, b.nombre AS bodega,
                      v.cantidad::int AS existencia, v.stock_minimo::int AS minimo
                 FROM v_repuesto_bajo_minimo v
                 JOIN bodega b ON b.id = v.id_bodega
                ORDER BY (v.stock_minimo - v.cantidad) DESC, v.codigo LIMIT 100`,
  },
  {
    clave: 'movimientos_inventario',
    titulo: 'Movimientos de inventario',
    proposito: 'Que entro, que salio y por que via.',
    grupo: 'inventario',
    admiteRango: true,
    columnas: [
      col('tipo', 'Tipo', TEXTO), col('movimientos', 'Movimientos', NUMERO),
      col('piezas', 'Piezas', NUMERO),
    ],
    sumar: ['movimientos', 'piezas'],
    consulta: `SELECT replace(m.tipo::text, '_', ' ') AS tipo, count(*)::int AS movimientos,
                      sum(m.cantidad)::int AS piezas
                 FROM movimiento_repuesto m
                WHERE ($1::timestamptz IS NULL OR m.creado_en >= $1)
                  AND ($2::timestamptz IS NULL OR m.creado_en < $2)
                GROUP BY m.tipo ORDER BY count(*) DESC`,
  },
  {
    clave: 'compras_por_proveedor',
    titulo: 'Compras por proveedor',
    proposito: 'A quien se le compra y cuanto queda sin llegar.',
    grupo: 'inventario',
    admiteRango: true,
    columnas: [
      col('proveedor', 'Proveedor', TEXTO), col('compras', 'Compras', NUMERO),
      col('monto', 'Monto', DINERO), col('pendientes', 'Sin recibir', NUMERO),
    ],
    sumar: ['compras', 'monto', 'pendientes'],
    consulta: `SELECT p.nombre AS proveedor, count(*)::int AS compras,
                      coalesce(sum(c.total), 0) AS monto,
                      count(*) FILTER (
                        WHERE c.estado IN ('enviada','confirmada','recibida_parcial')
                      )::int AS pendientes
                 FROM compra c JOIN proveedor p ON p.id = c.id_proveedor
                WHERE ($1::timestamptz IS NULL OR c.fecha_pedido >= $1::date)
                  AND ($2::timestamptz IS NULL OR c.fecha_pedido < $2::date)
                GROUP BY p.nombre ORDER BY sum(c.total) DESC NULLS LAST`,
  },
  {
    clave: 'cobros_a_proveedores',
    titulo: 'Expedientes de cobro',
    proposito: 'Cuanto se reclamo, cuanto se recupero y cuanto sigue trabado.',
    grupo: 'dinero',
    admiteRango: true,
    columnas: [
      col('estado', 'Estado', TEXTO), col('expedientes', 'Expedientes', NUMERO),
      col('reclamado', 'Reclamado', DINERO), col('cobrado', 'Cobrado', DINERO),
    ],
    sumar: ['expedientes', 'reclamado', 'cobrado'],
    advertencia: 'Lo bloqueado por evidencia es plata que el centro ya gasto y todavia no '
      + 'puede reclamar. Es la fila que hay que mirar primero.',
    consulta: `SELECT replace(e.estado::text, '_', ' ') AS estado, count(*)::int AS expedientes,
                      coalesce(sum(e.monto_reclamado), 0) AS reclamado,
                      coalesce(sum(e.monto_cobrado), 0) AS cobrado
                 FROM expediente_cobro e
                 JOIN orden_servicio o ON o.id = e.id_orden
                WHERE ${EN_RANGO}
                GROUP BY e.estado ORDER BY count(*) DESC`,
  },
  {
    clave: 'pagos_de_clientes',
    titulo: 'Pagos de clientes',
    proposito: 'Que entro por caja y por que via.',
    grupo: 'dinero',
    admiteRango: true,
    columnas: [
      col('forma_pago', 'Forma de pago', TEXTO), col('estado', 'Estado', TEXTO),
      col('pagos', 'Pagos', NUMERO), col('monto', 'Monto', DINERO),
    ],
    sumar: ['pagos', 'monto'],
    consulta: `SELECT p.forma_pago, p.estado::text AS estado, count(*)::int AS pagos,
                      coalesce(sum(p.monto), 0) AS monto
                 FROM pago p
                WHERE ($1::timestamptz IS NULL OR p.creado_en >= $1)
                  AND ($2::timestamptz IS NULL OR p.creado_en < $2)
                GROUP BY p.forma_pago, p.estado ORDER BY sum(p.monto) DESC`,
  },
  {
    clave: 'validaciones_tecnicas',
    titulo: 'Revisiones de la jefatura',
    proposito: 'Cuanto trabajo se devuelve antes de darlo por bueno.',
    grupo: 'tecnico',
    admiteRango: true,
    columnas: [
      col('resultado', 'Resultado', TEXTO), col('revisiones', 'Revisiones', NUMERO),
      col('proporcion', 'Proporcion', PORCENTAJE),
    ],
    sumar: ['revisiones'],
    advertencia: 'Un cero por ciento de rechazos no es una buena noticia: casi siempre '
      + 'significa que nadie esta revisando de verdad.',
    consulta: `SELECT replace(v.resultado::text, '_', ' ') AS resultado, count(*)::int AS revisiones,
                      round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS proporcion
                 FROM validacion_tecnica v
                 JOIN orden_servicio o ON o.id = v.id_orden
                WHERE ${EN_RANGO}
                GROUP BY v.resultado ORDER BY count(*) DESC`,
  },
];

export function reportePorClave(clave: string): Reporte | undefined {
  return REPORTES.find((reporte) => reporte.clave === clave);
}
