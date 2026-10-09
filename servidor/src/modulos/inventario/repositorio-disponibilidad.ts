/**
 * Disponibilidad de repuestos: existente, reservado, comprometido y
 * disponible. Sale de la vista `v_disponibilidad_repuesto` (migracion
 * 0023), que es la misma que consulta la aprobacion de una solicitud: lo
 * que la pantalla dice disponible es lo que bodega puede aprobar.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaDisponibilidad {
  readonly id_repuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly stock_minimo: number;
  readonly existencia_bodegas: number;
  readonly en_tecnicos: number;
  readonly reservado: number;
  readonly comprometido: number;
  readonly disponible: number;
}

export interface FiltroDisponibilidad {
  readonly texto?: string | undefined;
  readonly idRepuesto?: string | undefined;
  /** Solo lo que tiene algo pedido o reservado. */
  readonly soloConMovimiento?: boolean;
  /** Solo lo que no alcanza el minimo con lo disponible. */
  readonly soloBajoMinimo?: boolean;
}

function donde(filtro: FiltroDisponibilidad): { sql: string; valores: unknown[] } {
  const condiciones = ['r.activo'];
  const valores: unknown[] = [];
  if (filtro.texto !== undefined) {
    valores.push(`%${filtro.texto}%`);
    condiciones.push(`(r.codigo ILIKE $${valores.length} OR r.descripcion ILIKE $${valores.length})`);
  }
  if (filtro.idRepuesto !== undefined) {
    valores.push(filtro.idRepuesto);
    condiciones.push(`r.id = $${valores.length}`);
  }
  if (filtro.soloConMovimiento === true) {
    condiciones.push('(d.reservado > 0 OR d.comprometido > 0)');
  }
  if (filtro.soloBajoMinimo === true) {
    condiciones.push('d.disponible <= r.stock_minimo');
  }
  return { sql: condiciones.join(' AND '), valores };
}

export async function contar(
  filtro: FiltroDisponibilidad, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { sql, valores } = donde(filtro);
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total
       FROM v_disponibilidad_repuesto d JOIN repuesto r ON r.id = d.id_repuesto
      WHERE ${sql}`,
    valores,
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listar(
  filtro: FiltroDisponibilidad, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaDisponibilidad[]> {
  const { sql, valores } = donde(filtro);
  const { rows } = await ejecutor.query<FilaDisponibilidad>(
    `SELECT d.id_repuesto, r.codigo, r.descripcion, r.stock_minimo,
            d.existencia_bodegas, d.en_tecnicos, d.reservado, d.comprometido, d.disponible
       FROM v_disponibilidad_repuesto d JOIN repuesto r ON r.id = d.id_repuesto
      WHERE ${sql}
      ORDER BY (d.reservado + d.comprometido) DESC, r.codigo
      LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, limite, desplazamiento],
  );
  return rows;
}

/**
 * Lo disponible de UN repuesto, con el repuesto bloqueado.
 *
 * El bloqueo es lo que hace segura la aprobacion: dos bodegueros que
 * aprueban a la vez solicitudes del mismo repuesto se ponen en fila, y el
 * segundo ve la reserva del primero. Sin el, los dos verian «hay 1» y
 * reservarian la misma pieza.
 */
export async function disponibleBloqueando(
  ejecutor: Ejecutor, idRepuesto: string,
): Promise<number> {
  await ejecutor.query('SELECT id FROM repuesto WHERE id = $1 FOR UPDATE', [idRepuesto]);
  const { rows } = await ejecutor.query<{ disponible: number }>(
    'SELECT disponible FROM v_disponibilidad_repuesto WHERE id_repuesto = $1', [idRepuesto],
  );
  return rows[0]?.disponible ?? 0;
}

/**
 * La bodega personal del tecnico de la orden; si no la tiene, se le crea.
 *
 * Los tecnicos que existian al aplicar la migracion 0023 ya tienen la suya.
 * Esto cubre a los que se den de alta despues, sin pedirle a nadie que
 * recuerde crearla: la primera pieza que se le entrega la abre.
 */
export async function asegurarBodegaDelTecnico(
  ejecutor: Ejecutor, idOrden: string,
): Promise<string | null> {
  const { rows: tecnico } = await ejecutor.query<{
    id: string; id_centro: string; tipo: string; nombres: string;
  }>(
    `SELECT t.id, t.id_centro, t.tipo, trim(u.nombres) AS nombres
       FROM orden_servicio o
       JOIN tecnico t ON t.id = o.id_tecnico
       JOIN usuario u ON u.id = t.id_usuario
      WHERE o.id = $1`,
    [idOrden],
  );
  const fila = tecnico[0];
  if (fila === undefined) return null;

  const existente = await ejecutor.query<{ id: string }>(
    `SELECT id FROM bodega WHERE id_tecnico = $1 AND tipo = 'movil' AND activa`, [fila.id],
  );
  if (existente.rows[0] !== undefined) return existente.rows[0].id;

  const nombre = fila.tipo === 'ruta' ? `Bodega movil · ${fila.nombres}` : `Banco de taller · ${fila.nombres}`;
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO bodega (id_centro, tipo, nombre, id_tecnico, activa, surte_repuestos)
     VALUES ($1, 'movil', $2, $3, true, true)
     ON CONFLICT (id_tecnico) WHERE tipo = 'movil' AND activa DO NOTHING
     RETURNING id`,
    [fila.id_centro, nombre, fila.id],
  );
  if (rows[0] !== undefined) return rows[0].id;
  // Otro proceso la creo en el mismo instante: se usa esa.
  const otra = await ejecutor.query<{ id: string }>(
    `SELECT id FROM bodega WHERE id_tecnico = $1 AND tipo = 'movil' AND activa`, [fila.id],
  );
  return otra.rows[0]?.id ?? null;
}
