/** Acceso a datos de tecnicos. Uso interno del modulo de seguridad. */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaTecnico {
  readonly id: string; readonly id_usuario: string; readonly id_centro: string;
  readonly nombre_usuario: string; readonly nombres: string; readonly correo: string | null;
  readonly tipo: 'ruta' | 'planta'; readonly especialidad: string;
  readonly disponible: boolean; readonly activo: boolean;
  readonly cuenta_activa: boolean; readonly cuenta_bloqueada: boolean;
  readonly ordenes_abiertas: number;
}

const CAMPOS = `
  t.id, t.id_usuario, t.id_centro, u.nombre_usuario, trim(u.nombres) AS nombres, u.correo,
  t.tipo, t.especialidad, t.disponible, t.activo,
  u.activo AS cuenta_activa, u.bloqueado AS cuenta_bloqueada,
  (SELECT count(*) FROM orden_servicio o
    WHERE o.id_tecnico = t.id
      AND o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada'))::int AS ordenes_abiertas`;

export interface FiltroTecnicos {
  readonly texto?: string | undefined;
  readonly tipo?: string | undefined;
  /** 'activos' | 'inactivos' | 'todos' */
  readonly estado: string;
}

const DONDE = `
  WHERE t.id_centro = $1
    AND ($2::text IS NULL OR lower(u.nombres || ' ' || u.nombre_usuario) LIKE '%' || lower($2) || '%')
    AND ($3::text IS NULL OR t.tipo = $3)
    AND ($4::text = 'todos' OR ($4 = 'activos' AND t.activo) OR ($4 = 'inactivos' AND NOT t.activo))`;

export async function contar(idCentro: string, filtro: FiltroTecnicos, ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<number> {
  const { rows } = await ejecutor.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM tecnico t JOIN usuario u ON u.id = t.id_usuario ${DONDE}`,
    [idCentro, filtro.texto ?? null, filtro.tipo ?? null, filtro.estado],
  );
  return rows[0]?.total ?? 0;
}

export async function listar(
  idCentro: string, filtro: FiltroTecnicos, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaTecnico[]> {
  const { rows } = await ejecutor.query<FilaTecnico>(
    `SELECT ${CAMPOS} FROM tecnico t JOIN usuario u ON u.id = t.id_usuario ${DONDE}
      ORDER BY t.activo DESC, u.nombres LIMIT $5 OFFSET $6`,
    [idCentro, filtro.texto ?? null, filtro.tipo ?? null, filtro.estado, limite, desplazamiento],
  );
  return rows;
}

export async function buscarPorId(id: string, ejecutor: Ejecutor = ejecutorPorDefecto(), bloquear = false): Promise<FilaTecnico | null> {
  const { rows } = await ejecutor.query<FilaTecnico>(
    `SELECT ${CAMPOS} FROM tecnico t JOIN usuario u ON u.id = t.id_usuario WHERE t.id = $1
     ${bloquear ? 'FOR UPDATE OF t' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function ordenesAbiertas(
  idTecnico: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ id: string; codigo: string; estado: string }[]> {
  const { rows } = await ejecutor.query<{ id: string; codigo: string; estado: string }>(
    `SELECT o.id, o.codigo, o.estado::text AS estado FROM orden_servicio o
      WHERE o.id_tecnico = $1 AND o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
      ORDER BY o.numero`,
    [idTecnico],
  );
  return rows;
}

export async function visitasProgramadas(
  idTecnico: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ id_orden: string; fecha_programada: Date; franja_horaria: string }[]> {
  const { rows } = await ejecutor.query<{ id_orden: string; fecha_programada: Date; franja_horaria: string }>(
    `SELECT v.id_orden, v.fecha_programada, v.franja_horaria FROM visita v
      WHERE v.id_tecnico = $1 AND v.vigente AND v.resultado = 'programada'`,
    [idTecnico],
  );
  return rows;
}

export async function bodegaDe(
  idTecnico: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ nombre: string; unidades: number } | null> {
  const { rows } = await ejecutor.query<{ nombre: string; unidades: number }>(
    `SELECT b.nombre, coalesce((SELECT sum(e.cantidad) FROM existencia e WHERE e.id_bodega = b.id), 0)::int AS unidades
       FROM bodega b WHERE b.id_tecnico = $1 AND b.tipo = 'movil' AND b.activa LIMIT 1`,
    [idTecnico],
  );
  return rows[0] ?? null;
}

export async function especialidadValida(especialidad: string, ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<boolean> {
  const { rows } = await ejecutor.query('SELECT 1 FROM categoria_articulo WHERE nombre = $1 AND activa', [especialidad]);
  return rows.length > 0;
}

export async function usuarioParaTecnico(
  idUsuario: string, ejecutor: Ejecutor,
): Promise<{ id: string; rol: string; activo: boolean; tiene_ficha: boolean; id_centro: string } | null> {
  const { rows } = await ejecutor.query<{ id: string; rol: string; activo: boolean; tiene_ficha: boolean; id_centro: string }>(
    `SELECT u.id, r.codigo AS rol, u.activo, u.id_centro,
            EXISTS (SELECT 1 FROM tecnico t WHERE t.id_usuario = u.id) AS tiene_ficha
       FROM usuario u JOIN rol r ON r.id = u.id_rol WHERE u.id = $1`,
    [idUsuario],
  );
  return rows[0] ?? null;
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: { idUsuario: string; idCentro: string; tipo: string; especialidad: string; disponible: boolean },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO tecnico (id_usuario, id_centro, tipo, especialidad, disponible, activo)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [datos.idUsuario, datos.idCentro, datos.tipo, datos.especialidad, datos.disponible],
  );
  return rows[0]!.id;
}

export async function actualizar(
  ejecutor: Ejecutor, idTecnico: string,
  cambios: { especialidad?: string; disponible?: boolean; tipo?: string },
): Promise<void> {
  await ejecutor.query(
    `UPDATE tecnico SET especialidad = coalesce($2, especialidad),
                        disponible = coalesce($3, disponible),
                        tipo = coalesce($4, tipo)
      WHERE id = $1`,
    [idTecnico, cambios.especialidad ?? null, cambios.disponible ?? null, cambios.tipo ?? null],
  );
}

export async function cambiarActivo(ejecutor: Ejecutor, idTecnico: string, activo: boolean): Promise<void> {
  // Un tecnico dado de baja tampoco queda disponible para asignaciones.
  await ejecutor.query(
    'UPDATE tecnico SET activo = $2, disponible = CASE WHEN $2 THEN disponible ELSE false END WHERE id = $1',
    [idTecnico, activo],
  );
}

/**
 * Su bodega personal: vehiculo si es de ruta, banco de taller si es de
 * planta. Es la misma convencion de la migracion 0023 (tipo 'movil').
 */
export async function asegurarBodega(
  ejecutor: Ejecutor, datos: { idTecnico: string; idCentro: string; tipo: string; nombres: string },
): Promise<void> {
  const nombre = datos.tipo === 'ruta' ? `Bodega movil · ${datos.nombres}` : `Banco de taller · ${datos.nombres}`;
  await ejecutor.query(
    `INSERT INTO bodega (id_centro, tipo, nombre, id_tecnico, activa, surte_repuestos)
     VALUES ($1, 'movil', $2, $3, true, true)
     ON CONFLICT (id_tecnico) WHERE tipo = 'movil' AND activa DO NOTHING`,
    [datos.idCentro, nombre, datos.idTecnico],
  );
}
