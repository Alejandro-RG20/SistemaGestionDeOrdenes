/**
 * Acceso a datos de cobros.
 *
 * Nada de reglas aqui: a quien se le reclama, cuanto y si puede salir lo
 * decide `dominio/cobros`. Esto solo lee y escribe.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type {
  FilaDesgloseOrden, FilaEvidenciaFaltante, FilaExpediente, FilaPago,
  FilaRecuperacionMarca, FilaRenglon,
} from './dto.js';

const COLUMNAS_EXPEDIENTE = `
  e.id, e.id_orden, o.numero AS numero_orden, e.destinatario, e.id_marca,
  m.nombre AS marca,
  trim(c.nombres || ' ' || coalesce(c.apellidos, '')) AS cliente,
  trim(ma.nombre || ' ' || coalesce(a.modelo, '')) AS articulo,
  o.tipo_garantia::text AS tipo_garantia,
  e.monto_reclamado, e.monto_cobrado, e.estado::text AS estado, e.evidencia_completa,
  e.fecha_envio, e.fecha_resultado, e.motivo_rechazo, e.creado_en`;

const DESDE_EXPEDIENTE = `
  FROM expediente_cobro e
  JOIN orden_servicio o ON o.id = e.id_orden
  JOIN cliente c  ON c.id = o.id_cliente
  JOIN articulo a ON a.id = o.id_articulo
  JOIN marca ma   ON ma.id = a.id_marca
  LEFT JOIN marca m ON m.id = e.id_marca`;

export interface FiltroExpedientes {
  readonly estado?: string | undefined;
  readonly destinatario?: string | undefined;
  readonly idMarca?: string | undefined;
  /** Solo los que llevan mas de N dias enviados sin respuesta. */
  readonly sinRespuestaDesdeDias?: number | undefined;
}

function condiciones(filtro: FiltroExpedientes): { donde: string; valores: unknown[] } {
  const partes: string[] = [];
  const valores: unknown[] = [];

  if (filtro.estado !== undefined) {
    valores.push(filtro.estado);
    partes.push(`e.estado = $${valores.length}::estado_expediente`);
  }
  if (filtro.destinatario !== undefined) {
    valores.push(filtro.destinatario);
    partes.push(`e.destinatario = $${valores.length}`);
  }
  if (filtro.idMarca !== undefined) {
    valores.push(filtro.idMarca);
    partes.push(`e.id_marca = $${valores.length}`);
  }
  if (filtro.sinRespuestaDesdeDias !== undefined) {
    valores.push(filtro.sinRespuestaDesdeDias);
    partes.push(
      `e.estado = 'enviado' AND e.fecha_envio IS NOT NULL
       AND e.fecha_envio <= current_date - ($${valores.length})::int`,
    );
  }

  return { donde: partes.length === 0 ? '' : `WHERE ${partes.join(' AND ')}`, valores };
}

export async function contar(
  filtro: FiltroExpedientes, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { donde, valores } = condiciones(filtro);
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total ${DESDE_EXPEDIENTE} ${donde}`, valores,
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listar(
  filtro: FiltroExpedientes, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaExpediente[]> {
  const { donde, valores } = condiciones(filtro);
  const { rows } = await ejecutor.query<FilaExpediente>(
    `SELECT ${COLUMNAS_EXPEDIENTE} ${DESDE_EXPEDIENTE} ${donde}
      ORDER BY e.fecha_envio NULLS FIRST, e.creado_en DESC
      LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, limite, desplazamiento],
  );
  return rows;
}

export async function buscar(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaExpediente | null> {
  const { rows } = await ejecutor.query<FilaExpediente>(
    `SELECT ${COLUMNAS_EXPEDIENTE} ${DESDE_EXPEDIENTE} WHERE e.id = $1`, [id],
  );
  return rows[0] ?? null;
}

export async function buscarPorOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaExpediente | null> {
  const { rows } = await ejecutor.query<FilaExpediente>(
    `SELECT ${COLUMNAS_EXPEDIENTE} ${DESDE_EXPEDIENTE} WHERE e.id_orden = $1`, [idOrden],
  );
  return rows[0] ?? null;
}

/** Lo que hace falta para armar el reclamo: modalidad, cargo y mano de obra. */
export async function desgloseDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaDesgloseOrden | null> {
  const { rows } = await ejecutor.query<FilaDesgloseOrden>(
    `SELECT o.id, o.numero, o.estado::text AS estado, o.modalidad::text AS modalidad,
            o.tipo_garantia::text AS tipo_garantia, o.cargo_visita,
            o.falla_reportada, o.fecha_recepcion, o.fecha_entrega,
            a.id_marca,
            coalesce((SELECT max(ct.mano_obra) FROM cotizacion ct WHERE ct.id_orden = o.id), 0)
              AS mano_obra
       FROM orden_servicio o
       JOIN articulo a ON a.id = o.id_articulo
      WHERE o.id = $1`,
    [idOrden],
  );
  return rows[0] ?? null;
}

/**
 * Los repuestos que se le pusieron a la orden, al precio CONGELADO del
 * movimiento. No al de hoy: se reclama lo que costo entonces, que es lo
 * que la factura respalda (RN-22).
 */
export async function renglonesDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaRenglon[]> {
  const { rows } = await ejecutor.query<FilaRenglon>(
    `SELECT mv.id_repuesto, r.codigo, r.descripcion,
            sum(mv.cantidad)::int AS cantidad,
            max(mv.precio_unitario) AS precio_unitario,
            sum(mv.cantidad * mv.precio_unitario) AS importe
       FROM movimiento_repuesto mv
       JOIN repuesto r ON r.id = mv.id_repuesto
      WHERE mv.id_orden = $1 AND mv.tipo = 'consumo'
      GROUP BY mv.id_repuesto, r.codigo, r.descripcion
      ORDER BY r.codigo`,
    [idOrden],
  );
  return rows;
}

/** RF-56: lo que falta se consulta en la vista, no se recalcula aparte. */
export async function evidenciaFaltante(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaEvidenciaFaltante[]> {
  const { rows } = await ejecutor.query<FilaEvidenciaFaltante>(
    'SELECT clave, etiqueta, momento FROM v_evidencia_faltante WHERE id_orden = $1 ORDER BY momento, clave',
    [idOrden],
  );
  return rows;
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; destinatario: string; idMarca: string | null;
    montoReclamado: number; estado: string; evidenciaCompleta: boolean; idUsuario: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO expediente_cobro
       (id_orden, destinatario, id_marca, monto_reclamado, estado, evidencia_completa,
        modificado_en, modificado_por)
     VALUES ($1, $2, $3, $4, $5::estado_expediente, $6, now(), $7)
     RETURNING id`,
    [datos.idOrden, datos.destinatario, datos.idMarca, datos.montoReclamado,
      datos.estado, datos.evidenciaCompleta, datos.idUsuario],
  );
  return rows[0]!.id;
}

export async function actualizarMonto(
  ejecutor: Ejecutor,
  datos: { id: string; montoReclamado: number; evidenciaCompleta: boolean; estado: string; idUsuario: string },
): Promise<void> {
  await ejecutor.query(
    `UPDATE expediente_cobro
        SET monto_reclamado = $2, evidencia_completa = $3, estado = $4::estado_expediente,
            modificado_en = now(), modificado_por = $5
      WHERE id = $1`,
    [datos.id, datos.montoReclamado, datos.evidenciaCompleta, datos.estado, datos.idUsuario],
  );
}

export async function actualizarEstado(
  ejecutor: Ejecutor,
  datos: {
    id: string; estado: string; fechaEnvio: Date | null; fechaResultado: Date | null;
    motivoRechazo: string | null; montoCobrado: number | null; idUsuario: string;
  },
): Promise<void> {
  await ejecutor.query(
    `UPDATE expediente_cobro
        SET estado = $2::estado_expediente,
            fecha_envio    = coalesce($3, fecha_envio),
            fecha_resultado = coalesce($4, fecha_resultado),
            motivo_rechazo = $5,
            monto_cobrado  = coalesce($6, monto_cobrado),
            modificado_en = now(), modificado_por = $7
      WHERE id = $1`,
    [datos.id, datos.estado, datos.fechaEnvio, datos.fechaResultado,
      datos.motivoRechazo, datos.montoCobrado, datos.idUsuario],
  );
}

// ── pagos del cliente ───────────────────────────────────────────────────

export async function contarPagos(
  idOrden: string | undefined, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM pago p
      ${idOrden === undefined ? '' : 'WHERE p.id_orden = $1'}`,
    idOrden === undefined ? [] : [idOrden],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listarPagos(
  idOrden: string | undefined, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaPago[]> {
  const valores: unknown[] = idOrden === undefined ? [] : [idOrden];
  const donde = idOrden === undefined ? '' : 'WHERE p.id_orden = $1';
  const { rows } = await ejecutor.query<FilaPago>(
    `SELECT p.id, p.id_orden, o.numero AS numero_orden,
            trim(c.nombres || ' ' || coalesce(c.apellidos, '')) AS cliente,
            p.monto, p.forma_pago, p.referencia, u.nombres AS registrado_por, p.creado_en
       FROM pago p
       JOIN orden_servicio o ON o.id = p.id_orden
       JOIN cliente c ON c.id = o.id_cliente
       LEFT JOIN usuario u ON u.id = p.creado_por
       ${donde}
      ORDER BY p.creado_en DESC
      LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, limite, desplazamiento],
  );
  return rows;
}

export async function insertarPago(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; monto: number; formaPago: string; referencia: string | null;
    idEvidencia: string | null; idUsuario: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO pago (id_orden, monto, forma_pago, referencia, id_evidencia, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [datos.idOrden, datos.monto, datos.formaPago, datos.referencia,
      datos.idEvidencia, datos.idUsuario],
  );
  return rows[0]!.id;
}

// ── indicadores ─────────────────────────────────────────────────────────

export interface FilaTotales {
  readonly expedientes: string;
  readonly bloqueados: string;
  readonly enviados_sin_respuesta: string;
  readonly total_reclamado: string;
  readonly total_cobrado: string;
  readonly expuesto: string;
}

export async function totales(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaTotales> {
  const { rows } = await ejecutor.query<FilaTotales>(
    `SELECT count(*)::text AS expedientes,
            count(*) FILTER (WHERE estado = 'bloqueado_por_evidencia')::text AS bloqueados,
            count(*) FILTER (WHERE estado = 'enviado')::text AS enviados_sin_respuesta,
            coalesce(sum(monto_reclamado), 0)::text AS total_reclamado,
            coalesce(sum(monto_cobrado), 0)::text AS total_cobrado,
            -- Lo reclamado que todavia no entro y tampoco fue rechazado.
            coalesce(sum(monto_reclamado) FILTER (
              WHERE estado NOT IN ('pagado', 'rechazado')), 0)::text AS expuesto
       FROM expediente_cobro`,
  );
  return rows[0]!;
}

export async function recuperacionPorMarca(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaRecuperacionMarca[]> {
  const { rows } = await ejecutor.query<FilaRecuperacionMarca>(
    `SELECT e.id_marca,
            coalesce(m.nombre, 'Poliza de garantia extendida') AS marca,
            count(*)::text AS expedientes,
            coalesce(sum(e.monto_reclamado), 0)::text AS reclamado,
            coalesce(sum(e.monto_cobrado), 0)::text AS cobrado,
            count(*) FILTER (WHERE e.estado = 'rechazado')::text AS rechazados,
            avg(e.fecha_resultado - e.fecha_envio) FILTER (
              WHERE e.fecha_resultado IS NOT NULL AND e.fecha_envio IS NOT NULL
            )::float8 AS dias_promedio_respuesta
       FROM expediente_cobro e
       LEFT JOIN marca m ON m.id = e.id_marca
      GROUP BY e.id_marca, m.nombre
      ORDER BY sum(e.monto_reclamado) DESC NULLS LAST`,
  );
  return rows;
}
