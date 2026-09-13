/** Acceso a datos de roles, permisos y bitacora. Uso interno del modulo. */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { FilaAsientoBitacora, FilaPermiso, FilaRol } from './dto.js';

export async function buscarRolPorCodigo(
  codigo: string,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ id: string; codigo: string } | null> {
  const { rows } = await ejecutor.query<{ id: string; codigo: string }>(
    'SELECT id, codigo FROM rol WHERE codigo = $1 AND activo',
    [codigo],
  );
  return rows[0] ?? null;
}

export async function buscarRolPorId(
  id: string,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ id: string; codigo: string } | null> {
  const { rows } = await ejecutor.query<{ id: string; codigo: string }>(
    'SELECT id, codigo FROM rol WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function contarRoles(ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>('SELECT count(*)::text AS total FROM rol');
  return Number(rows[0]?.total ?? 0);
}

export async function listarRoles(
  limite: number,
  desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaRol[]> {
  const { rows } = await ejecutor.query<FilaRol>(
    `SELECT r.id, r.codigo, r.nombre, r.descripcion, r.activo,
            count(rp.id_permiso)::text AS cantidad_permisos
       FROM rol r
       LEFT JOIN rol_permiso rp ON rp.id_rol = r.id
      GROUP BY r.id
      ORDER BY r.codigo
      LIMIT $1 OFFSET $2`,
    [limite, desplazamiento],
  );
  return rows;
}

export async function contarPermisos(ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>('SELECT count(*)::text AS total FROM permiso');
  return Number(rows[0]?.total ?? 0);
}

export async function listarPermisos(
  limite: number,
  desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaPermiso[]> {
  const { rows } = await ejecutor.query<FilaPermiso>(
    'SELECT id, codigo, modulo, descripcion FROM permiso ORDER BY modulo, codigo LIMIT $1 OFFSET $2',
    [limite, desplazamiento],
  );
  return rows;
}

export async function listarPermisosDeRol(
  idRol: string,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaPermiso[]> {
  const { rows } = await ejecutor.query<FilaPermiso>(
    `SELECT p.id, p.codigo, p.modulo, p.descripcion
       FROM rol_permiso rp JOIN permiso p ON p.id = rp.id_permiso
      WHERE rp.id_rol = $1
      ORDER BY p.modulo, p.codigo`,
    [idRol],
  );
  return rows;
}

/** Resuelve varios codigos de permiso en un solo viaje, nunca uno por uno. */
export async function buscarPermisosPorCodigo(
  codigos: readonly string[],
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaPermiso[]> {
  if (codigos.length === 0) return [];
  const { rows } = await ejecutor.query<FilaPermiso>(
    'SELECT id, codigo, modulo, descripcion FROM permiso WHERE codigo = ANY($1::text[])',
    [codigos],
  );
  return rows;
}

export async function reemplazarPermisosDeRol(
  ejecutor: Ejecutor,
  idRol: string,
  idsPermiso: readonly string[],
): Promise<void> {
  await ejecutor.query('DELETE FROM rol_permiso WHERE id_rol = $1', [idRol]);
  if (idsPermiso.length === 0) return;
  await ejecutor.query(
    'INSERT INTO rol_permiso (id_rol, id_permiso) SELECT $1, unnest($2::uuid[])',
    [idRol, idsPermiso],
  );
}

export interface FiltroBitacora {
  readonly tabla?: string | undefined;
  readonly idRegistro?: string | undefined;
}

const DONDE_BITACORA = `
  WHERE ($1::text IS NULL OR b.tabla = $1)
    AND ($2::uuid IS NULL OR b.id_registro = $2)`;

export async function contarAsientos(
  filtro: FiltroBitacora,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM bitacora b ${DONDE_BITACORA}`,
    [filtro.tabla ?? null, filtro.idRegistro ?? null],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listarAsientos(
  filtro: FiltroBitacora,
  limite: number,
  desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaAsientoBitacora[]> {
  const { rows } = await ejecutor.query<FilaAsientoBitacora>(
    `SELECT b.id, b.tabla, b.id_registro, b.accion, b.campo, b.valor_anterior,
            b.valor_nuevo, b.motivo, u.nombre_usuario, b.momento
       FROM bitacora b JOIN usuario u ON u.id = b.id_usuario
       ${DONDE_BITACORA}
      ORDER BY b.momento DESC, b.id
      LIMIT $3 OFFSET $4`,
    [filtro.tabla ?? null, filtro.idRegistro ?? null, limite, desplazamiento],
  );
  return rows;
}
