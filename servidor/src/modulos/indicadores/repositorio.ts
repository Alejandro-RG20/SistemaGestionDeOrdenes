/**
 * Consultas de los indicadores de operacion.
 *
 * Todas son agregados sobre la ventana de datos completa. Son consultas
 * caras por naturaleza; el panel las pide una vez al abrir la pantalla, no
 * en cada pulsacion.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaPorEstado {
  readonly estado: string;
  readonly ordenes: string;
  readonly vencidas: string;
}

export async function ordenesPorEstado(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaPorEstado[]> {
  const { rows } = await ejecutor.query<FilaPorEstado>(
    `SELECT estado::text AS estado, count(*)::text AS ordenes,
            count(*) FILTER (WHERE plazo_vence_en < now())::text AS vencidas
       FROM orden_servicio
      WHERE estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
      GROUP BY estado
      ORDER BY count(*) DESC`,
  );
  return rows;
}

export interface FilaCumplimiento {
  readonly cerradas: string;
  readonly a_tiempo: string;
  readonly vencidas_abiertas: string;
}

/**
 * Cumplimiento de plazo.
 *
 * Se mide contra `fecha_entrega` porque es el momento en que el cliente
 * recibe. Las ordenes sin plazo —las que no tienen regla— no cuentan: no se
 * puede incumplir algo que nunca se prometio.
 */
export async function cumplimiento(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaCumplimiento> {
  const { rows } = await ejecutor.query<FilaCumplimiento>(
    `SELECT
       count(*) FILTER (
         WHERE estado = 'entregada' AND fecha_entrega IS NOT NULL AND plazo_vence_en IS NOT NULL
       )::text AS cerradas,
       count(*) FILTER (
         WHERE estado = 'entregada' AND fecha_entrega IS NOT NULL AND plazo_vence_en IS NOT NULL
           AND fecha_entrega <= plazo_vence_en
       )::text AS a_tiempo,
       count(*) FILTER (
         WHERE estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
           AND plazo_vence_en < now()
       )::text AS vencidas_abiertas
     FROM orden_servicio`,
  );
  return rows[0]!;
}

export interface FilaPermanencia {
  readonly estado: string;
  readonly ordenes: string;
  readonly horas_promedio: number | null;
}

/**
 * Donde se atasca el trabajo: cuanto dura una orden en cada estado.
 *
 * Se calcula sobre `evento_orden`, tomando el tiempo hasta el evento
 * siguiente. Es tiempo CORRIDO, no laborable: la version laborable exigiria
 * recorrer el calendario orden por orden y este es un panel, no un informe
 * contable. Sirve para comparar estados entre si, que es para lo que se usa.
 */
export async function permanenciaPorEstado(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaPermanencia[]> {
  const { rows } = await ejecutor.query<FilaPermanencia>(
    `WITH tramos AS (
       SELECT estado_nuevo::text AS estado,
              EXTRACT(EPOCH FROM (
                lead(momento) OVER (PARTITION BY id_orden ORDER BY momento) - momento
              ))/3600 AS horas
         FROM evento_orden
     )
     SELECT estado, count(*)::text AS ordenes, avg(horas)::float8 AS horas_promedio
       FROM tramos
      WHERE horas IS NOT NULL
      GROUP BY estado
      ORDER BY avg(horas) DESC NULLS LAST`,
  );
  return rows;
}

export interface FilaTecnico {
  readonly id: string;
  readonly tecnico: string;
  readonly tipo: string;
  readonly cerradas: string;
  readonly en_curso: string;
  readonly vencidas: string;
  readonly horas_promedio_cierre: number | null;
}

export async function productividadDeTecnicos(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaTecnico[]> {
  const { rows } = await ejecutor.query<FilaTecnico>(
    `SELECT t.id, trim(u.nombres) AS tecnico, t.tipo::text AS tipo,
            count(o.id) FILTER (WHERE o.estado = 'entregada')::text AS cerradas,
            count(o.id) FILTER (
              WHERE o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
            )::text AS en_curso,
            count(o.id) FILTER (
              WHERE o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
                AND o.plazo_vence_en < now()
            )::text AS vencidas,
            avg(EXTRACT(EPOCH FROM (o.fecha_entrega - o.fecha_recepcion))/3600) FILTER (
              WHERE o.estado = 'entregada' AND o.fecha_entrega IS NOT NULL
            )::float8 AS horas_promedio_cierre
       FROM tecnico t
       JOIN usuario u ON u.id = t.id_usuario
       LEFT JOIN orden_servicio o ON o.id_tecnico = t.id
      WHERE t.activo
      GROUP BY t.id, u.nombres, t.tipo
      ORDER BY count(o.id) FILTER (WHERE o.estado = 'entregada') DESC`,
  );
  return rows;
}

export interface FilaReincidencia {
  readonly id_articulo: string;
  readonly articulo: string;
  readonly cliente: string;
  readonly ordenes: string;
  readonly ultima_orden: string;
  readonly dias_entre_ultimas_dos: number | null;
}

/**
 * RF-72: el mismo articulo vuelve al taller.
 *
 * Se cuenta por ARTICULO y no por cliente: es el aparato el que falla otra
 * vez, y un cliente con tres articulos distintos no es un caso de
 * reincidencia sino un buen cliente.
 */
export async function reincidencias(
  limite: number, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaReincidencia[]> {
  const { rows } = await ejecutor.query<FilaReincidencia>(
    `WITH por_articulo AS (
       SELECT o.id_articulo,
              count(*) AS ordenes,
              max(o.numero) AS ultima_orden,
              EXTRACT(EPOCH FROM (
                max(o.fecha_recepcion) - (
                  SELECT max(o2.fecha_recepcion) FROM orden_servicio o2
                   WHERE o2.id_articulo = o.id_articulo
                     AND o2.fecha_recepcion < max(o.fecha_recepcion)
                )
              ))/86400 AS dias_entre_ultimas_dos
         FROM orden_servicio o
        WHERE o.estado <> 'anulada'
        GROUP BY o.id_articulo
       HAVING count(*) > 1
     )
     SELECT p.id_articulo,
            trim(m.nombre || ' ' || coalesce(a.modelo, '')) AS articulo,
            trim(c.nombres || ' ' || coalesce(c.apellidos, '')) AS cliente,
            p.ordenes::text, p.ultima_orden::text,
            p.dias_entre_ultimas_dos::float8
       FROM por_articulo p
       JOIN articulo a ON a.id = p.id_articulo
       JOIN marca m    ON m.id = a.id_marca
       JOIN cliente c  ON c.id = a.id_cliente
      ORDER BY p.ordenes DESC, p.dias_entre_ultimas_dos NULLS LAST
      LIMIT $1`,
    [limite],
  );
  return rows;
}
