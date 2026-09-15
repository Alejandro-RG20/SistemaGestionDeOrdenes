/**
 * Acceso a datos de inventario. Uso interno del modulo.
 *
 * `existencia` es una proyeccion de `movimiento_repuesto`: se actualiza en
 * la MISMA transaccion que el movimiento y tiene que poder reconstruirse
 * desde cero. La funcion `reconstruirProyeccion` de abajo es exactamente
 * esa reconstruccion, y las pruebas la usan para auditar la proyeccion.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type {
  FilaBodega, FilaExistencia, FilaMovimiento, FilaRepuesto, FilaSolicitud,
} from './dto.js';

// ── bodegas ──────────────────────────────────────────────────────────────

const CAMPOS_BODEGA = `
  b.id, b.tipo, b.nombre, b.id_tecnico, u.nombres AS tecnico, b.activa,
  coalesce(e.renglones, 0)::text AS renglones, coalesce(e.unidades, 0)::text AS unidades`;

const DESDE_BODEGA = `
  FROM bodega b
  LEFT JOIN tecnico t ON t.id = b.id_tecnico
  LEFT JOIN usuario u ON u.id = t.id_usuario
  LEFT JOIN LATERAL (
    SELECT count(*) AS renglones, sum(cantidad) AS unidades
      FROM existencia WHERE id_bodega = b.id AND cantidad > 0
  ) e ON true`;

export async function listarBodegas(
  idCentro: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaBodega[]> {
  const { rows } = await ejecutor.query<FilaBodega>(
    `SELECT ${CAMPOS_BODEGA} ${DESDE_BODEGA} WHERE b.id_centro = $1 ORDER BY b.tipo, b.nombre`,
    [idCentro],
  );
  return rows;
}

export async function buscarBodega(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ id: string; tipo: string; nombre: string; activa: boolean } | null> {
  const { rows } = await ejecutor.query<{ id: string; tipo: string; nombre: string; activa: boolean }>(
    'SELECT id, tipo::text AS tipo, nombre, activa FROM bodega WHERE id = $1', [id],
  );
  return rows[0] ?? null;
}

// ── catalogo de repuestos ────────────────────────────────────────────────

const CAMPOS_REPUESTO = `
  r.id, r.codigo, r.descripcion, r.id_marca, m.nombre AS marca, r.unidad_medida,
  r.precio, r.stock_minimo, r.via_abastecimiento, r.activo`;

export interface FiltroRepuestos {
  readonly texto?: string | undefined;
  readonly soloActivos: boolean;
}

const DONDE_REPUESTO = `
  WHERE ($1::text IS NULL OR
         lower(inmutable_unaccent(r.descripcion || ' ' || r.codigo))
           LIKE '%' || lower(inmutable_unaccent($1)) || '%')
    AND ($2::boolean IS FALSE OR r.activo)`;

export async function contarRepuestos(
  filtro: FiltroRepuestos, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM repuesto r ${DONDE_REPUESTO}`,
    [filtro.texto ?? null, filtro.soloActivos],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listarRepuestos(
  filtro: FiltroRepuestos, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaRepuesto[]> {
  const { rows } = await ejecutor.query<FilaRepuesto>(
    `SELECT ${CAMPOS_REPUESTO} FROM repuesto r LEFT JOIN marca m ON m.id = r.id_marca
     ${DONDE_REPUESTO} ORDER BY r.codigo LIMIT $3 OFFSET $4`,
    [filtro.texto ?? null, filtro.soloActivos, limite, desplazamiento],
  );
  return rows;
}

export async function buscarRepuesto(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaRepuesto | null> {
  const { rows } = await ejecutor.query<FilaRepuesto>(
    `SELECT ${CAMPOS_REPUESTO} FROM repuesto r LEFT JOIN marca m ON m.id = r.id_marca WHERE r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// ── existencias ──────────────────────────────────────────────────────────

const CAMPOS_EXISTENCIA = `
  e.id_bodega, b.nombre AS bodega, e.id_repuesto, r.codigo, r.descripcion,
  e.cantidad, r.stock_minimo, e.actualizado_en`;

export interface FiltroExistencias {
  readonly idBodega?: string | undefined;
  readonly idRepuesto?: string | undefined;
  readonly soloBajoMinimo: boolean;
}

const DONDE_EXISTENCIA = `
  WHERE ($1::uuid IS NULL OR e.id_bodega = $1)
    AND ($2::uuid IS NULL OR e.id_repuesto = $2)
    AND ($3::boolean IS FALSE OR e.cantidad <= r.stock_minimo)`;

function parametrosExistencia(filtro: FiltroExistencias): unknown[] {
  return [filtro.idBodega ?? null, filtro.idRepuesto ?? null, filtro.soloBajoMinimo];
}

export async function contarExistencias(
  filtro: FiltroExistencias, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM existencia e JOIN repuesto r ON r.id = e.id_repuesto
     ${DONDE_EXISTENCIA}`,
    parametrosExistencia(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listarExistencias(
  filtro: FiltroExistencias, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaExistencia[]> {
  const { rows } = await ejecutor.query<FilaExistencia>(
    `SELECT ${CAMPOS_EXISTENCIA}
       FROM existencia e
       JOIN repuesto r ON r.id = e.id_repuesto
       JOIN bodega b ON b.id = e.id_bodega
      ${DONDE_EXISTENCIA}
      ORDER BY (e.cantidad <= r.stock_minimo) DESC, r.codigo LIMIT $4 OFFSET $5`,
    [...parametrosExistencia(filtro), limite, desplazamiento],
  );
  return rows;
}

/**
 * Existencia de un repuesto en una bodega, BLOQUEANDO la fila.
 *
 * La bodega central es concurrente: dos bodegueros descontando el mismo
 * repuesto a la vez leerian la misma cantidad y ambos creerian que alcanza.
 * El FOR UPDATE serializa a los dos. En la movil no hace falta —pertenece a
 * un solo tecnico— pero tampoco estorba, y tener un solo camino evita que
 * alguien olvide el bloqueo donde si importa.
 */
export async function bloquearExistencia(
  ejecutor: Ejecutor, idBodega: string, idRepuesto: string,
): Promise<number> {
  const { rows } = await ejecutor.query<{ cantidad: number }>(
    'SELECT cantidad FROM existencia WHERE id_bodega = $1 AND id_repuesto = $2 FOR UPDATE',
    [idBodega, idRepuesto],
  );
  return rows[0]?.cantidad ?? 0;
}

/**
 * Aplica el delta a la proyeccion. El CHECK de la tabla impide dejarla
 * negativa, y esa es la ultima linea de defensa.
 *
 * OJO con la forma de escribirlo. Un upsert directo
 *   INSERT ... VALUES (bodega, repuesto, -4) ON CONFLICT DO UPDATE SET ...
 * NO sirve: PostgreSQL evalua el CHECK sobre la fila PROPUESTA del INSERT
 * antes de resolver el conflicto, asi que falla siempre que el delta sea
 * negativo, aunque la existencia final fuera perfectamente valida. Por eso
 * primero se intenta el UPDATE y solo se inserta cuando no habia fila.
 */
export async function aplicarDelta(
  ejecutor: Ejecutor, idBodega: string, idRepuesto: string, delta: number,
): Promise<number> {
  const actualizado = await ejecutor.query<{ cantidad: number }>(
    `UPDATE existencia SET cantidad = cantidad + $3, actualizado_en = now()
      WHERE id_bodega = $1 AND id_repuesto = $2
      RETURNING cantidad`,
    [idBodega, idRepuesto, delta],
  );
  if (actualizado.rows[0] !== undefined) return actualizado.rows[0].cantidad;

  // No habia renglon para esa bodega y ese repuesto. Restar de la nada no
  // existe: de eso avisa el servicio antes de llegar aqui, y el CHECK lo
  // remata si alguna vez se le escapa.
  const { rows } = await ejecutor.query<{ cantidad: number }>(
    `INSERT INTO existencia AS e (id_bodega, id_repuesto, cantidad)
     VALUES ($1, $2, $3)
     ON CONFLICT (id_bodega, id_repuesto) DO UPDATE
       SET cantidad = e.cantidad + $3, actualizado_en = now()
     RETURNING cantidad`,
    [idBodega, idRepuesto, delta],
  );
  return rows[0]!.cantidad;
}

/**
 * Reconstruye `existencia` desde los movimientos. Es la prueba viva de que
 * la proyeccion no tiene vida propia (H8).
 */
export async function reconstruirProyeccion(ejecutor: Ejecutor): Promise<void> {
  await ejecutor.query('DELETE FROM existencia');
  await ejecutor.query(`
    INSERT INTO existencia (id_bodega, id_repuesto, cantidad, actualizado_en)
    SELECT id_bodega, id_repuesto, SUM(delta)::integer, now()
    FROM (
      SELECT id_bodega_destino AS id_bodega, id_repuesto,  cantidad AS delta
        FROM movimiento_repuesto WHERE id_bodega_destino IS NOT NULL
      UNION ALL
      SELECT id_bodega_origen  AS id_bodega, id_repuesto, -cantidad AS delta
        FROM movimiento_repuesto WHERE id_bodega_origen IS NOT NULL
    ) AS saldo
    GROUP BY id_bodega, id_repuesto`);
}
