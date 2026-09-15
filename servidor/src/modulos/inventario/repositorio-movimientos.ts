/** Acceso a datos de movimientos y solicitudes. Uso interno del modulo. */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { FilaMovimiento, FilaSolicitud } from './dto.js';

const CAMPOS_MOVIMIENTO = `
  mov.id, mov.id_repuesto, r.codigo, r.descripcion, mov.tipo,
  mov.id_bodega_origen, bo.nombre AS bodega_origen,
  mov.id_bodega_destino, bd.nombre AS bodega_destino,
  mov.cantidad, mov.precio_unitario, mov.id_orden, o.numero AS numero_orden,
  u.nombres AS responsable, mov.justificacion, mov.momento_dispositivo,
  mov.registrado_sin_conexion, mov.creado_en`;

const DESDE_MOVIMIENTO = `
  FROM movimiento_repuesto mov
  JOIN repuesto r ON r.id = mov.id_repuesto
  JOIN usuario u ON u.id = mov.id_responsable
  LEFT JOIN bodega bo ON bo.id = mov.id_bodega_origen
  LEFT JOIN bodega bd ON bd.id = mov.id_bodega_destino
  LEFT JOIN orden_servicio o ON o.id = mov.id_orden`;

export interface FiltroMovimientos {
  readonly idRepuesto?: string | undefined;
  readonly idBodega?: string | undefined;
  readonly idOrden?: string | undefined;
  readonly tipo?: string | undefined;
}

const DONDE_MOVIMIENTO = `
  WHERE ($1::uuid IS NULL OR mov.id_repuesto = $1)
    AND ($2::uuid IS NULL OR mov.id_bodega_origen = $2 OR mov.id_bodega_destino = $2)
    AND ($3::uuid IS NULL OR mov.id_orden = $3)
    AND ($4::text IS NULL OR mov.tipo::text = $4)`;

function parametros(filtro: FiltroMovimientos): unknown[] {
  return [filtro.idRepuesto ?? null, filtro.idBodega ?? null, filtro.idOrden ?? null, filtro.tipo ?? null];
}

export async function contar(
  filtro: FiltroMovimientos, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM movimiento_repuesto mov ${DONDE_MOVIMIENTO}`,
    parametros(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listar(
  filtro: FiltroMovimientos, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaMovimiento[]> {
  const { rows } = await ejecutor.query<FilaMovimiento>(
    `SELECT ${CAMPOS_MOVIMIENTO} ${DESDE_MOVIMIENTO} ${DONDE_MOVIMIENTO}
      ORDER BY mov.creado_en DESC, mov.id LIMIT $5 OFFSET $6`,
    [...parametros(filtro), limite, desplazamiento],
  );
  return rows;
}

export async function buscarPorId(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaMovimiento | null> {
  const { rows } = await ejecutor.query<FilaMovimiento>(
    `SELECT ${CAMPOS_MOVIMIENTO} ${DESDE_MOVIMIENTO} WHERE mov.id = $1`, [id],
  );
  return rows[0] ?? null;
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: {
    idRepuesto: string; tipo: string; idBodegaOrigen: string | null;
    idBodegaDestino: string | null; cantidad: number; precioUnitario: number;
    idOrden: string | null; idResponsable: string; justificacion: string | null;
    momentoDispositivo: Date | null; registradoSinConexion: boolean;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO movimiento_repuesto
       (id_repuesto, tipo, id_bodega_origen, id_bodega_destino, cantidad, precio_unitario,
        id_orden, id_responsable, justificacion, momento_dispositivo, registrado_sin_conexion)
     VALUES ($1, $2::tipo_movimiento, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [datos.idRepuesto, datos.tipo, datos.idBodegaOrigen, datos.idBodegaDestino,
      datos.cantidad, datos.precioUnitario, datos.idOrden, datos.idResponsable,
      datos.justificacion, datos.momentoDispositivo, datos.registradoSinConexion],
  );
  return rows[0]!.id;
}

// ── solicitudes de repuesto ──────────────────────────────────────────────

const CAMPOS_SOLICITUD = `
  s.id, s.id_orden, o.numero AS numero_orden, s.id_repuesto, r.codigo, r.descripcion,
  s.cantidad, s.via, s.fecha_solicitud, s.fecha_estimada, s.fecha_ingreso, s.liberada`;

const DESDE_SOLICITUD = `
  FROM solicitud_repuesto s
  JOIN orden_servicio o ON o.id = s.id_orden
  JOIN repuesto r ON r.id = s.id_repuesto`;

export interface FiltroSolicitudes {
  readonly idOrden?: string | undefined;
  readonly idRepuesto?: string | undefined;
  readonly soloPendientes: boolean;
}

const DONDE_SOLICITUD = `
  WHERE ($1::uuid IS NULL OR s.id_orden = $1)
    AND ($2::uuid IS NULL OR s.id_repuesto = $2)
    AND ($3::boolean IS FALSE OR NOT s.liberada)`;

function parametrosSolicitud(filtro: FiltroSolicitudes): unknown[] {
  return [filtro.idOrden ?? null, filtro.idRepuesto ?? null, filtro.soloPendientes];
}

export async function contarSolicitudes(
  filtro: FiltroSolicitudes, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM solicitud_repuesto s ${DONDE_SOLICITUD}`,
    parametrosSolicitud(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listarSolicitudes(
  filtro: FiltroSolicitudes, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaSolicitud[]> {
  const { rows } = await ejecutor.query<FilaSolicitud>(
    `SELECT ${CAMPOS_SOLICITUD} ${DESDE_SOLICITUD} ${DONDE_SOLICITUD}
      ORDER BY s.liberada, s.fecha_solicitud LIMIT $4 OFFSET $5`,
    [...parametrosSolicitud(filtro), limite, desplazamiento],
  );
  return rows;
}

export async function insertarSolicitud(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; idRepuesto: string; cantidad: number; via: string;
    fechaEstimada: string | null; creadoPor: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO solicitud_repuesto (id_orden, id_repuesto, cantidad, via, fecha_estimada, creado_por)
     VALUES ($1, $2, $3, $4::via_abastecimiento, $5::date, $6) RETURNING id`,
    [datos.idOrden, datos.idRepuesto, datos.cantidad, datos.via, datos.fechaEstimada, datos.creadoPor],
  );
  return rows[0]!.id;
}

export interface SolicitudPendiente {
  readonly id: string;
  readonly id_orden: string;
  readonly numero_orden: number;
  readonly cantidad: number;
  readonly estado: string;
  readonly id_responsable_actual: string | null;
  readonly responsable: string | null;
}

/**
 * Solicitudes sin liberar de un repuesto, en orden de llegada y BLOQUEADAS.
 *
 * Se ordena por fecha de solicitud: si entran tres unidades y hay cinco
 * ordenes esperando, se libera a las tres que llevan mas tiempo esperando.
 * El bloqueo evita que dos ingresos simultaneos liberen la misma solicitud.
 */
export async function solicitudesPendientesDe(
  ejecutor: Ejecutor, idRepuesto: string,
): Promise<SolicitudPendiente[]> {
  const { rows } = await ejecutor.query<SolicitudPendiente>(
    `SELECT s.id, s.id_orden, o.numero AS numero_orden, s.cantidad,
            o.estado::text AS estado, o.id_responsable_actual, u.nombres AS responsable
       FROM solicitud_repuesto s
       JOIN orden_servicio o ON o.id = s.id_orden
       LEFT JOIN usuario u ON u.id = o.id_responsable_actual
      WHERE s.id_repuesto = $1 AND NOT s.liberada
        AND o.estado NOT IN ('entregada', 'cerrada_sin_reparar', 'anulada')
      ORDER BY s.fecha_solicitud, s.id
        FOR UPDATE OF s`,
    [idRepuesto],
  );
  return rows;
}

/** Marca varias solicitudes como liberadas en una sola sentencia. */
export async function liberarSolicitudes(
  ejecutor: Ejecutor, ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await ejecutor.query(
    `UPDATE solicitud_repuesto
        SET liberada = true, fecha_ingreso = current_date
      WHERE id = ANY($1::uuid[])`,
    [ids],
  );
}
