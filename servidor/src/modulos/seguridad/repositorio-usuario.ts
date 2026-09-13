/**
 * Acceso a datos de usuario. Solo lo invoca el modulo de seguridad.
 * Ninguna consulta de listado sale de aqui sin LIMIT y OFFSET.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { FilaUsuario, FilaUsuarioAutenticado, FilaUsuarioConCredencial } from './dto.js';

/**
 * Usuario vigente con sus permisos actuales, en una sola consulta.
 * El agregado evita el problema N+1: un viaje, no uno por permiso.
 */
const SQL_AUTENTICADO = `
  SELECT u.id, u.nombre_usuario, u.nombres, u.correo, u.id_centro, r.codigo AS rol,
         coalesce(array_agg(p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permisos
    FROM usuario u
    JOIN rol r ON r.id = u.id_rol
    LEFT JOIN rol_permiso rp ON rp.id_rol = r.id
    LEFT JOIN permiso p ON p.id = rp.id_permiso
   WHERE u.id = $1 AND u.activo AND NOT u.bloqueado AND r.activo
   GROUP BY u.id, r.codigo`;

const SQL_CREDENCIAL = `
  SELECT u.id, u.nombre_usuario, u.contrasena_hash, u.intentos_fallidos,
         u.bloqueado, u.activo, r.codigo AS rol
    FROM usuario u
    JOIN rol r ON r.id = u.id_rol
   WHERE u.nombre_usuario = $1`;

const CAMPOS_RESUMEN = `
  u.id, u.nombre_usuario, u.nombres, u.correo, r.codigo AS rol,
  u.bloqueado, u.activo, u.intentos_fallidos, u.creado_en`;

export async function buscarAutenticado(
  idUsuario: string,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaUsuarioAutenticado | null> {
  const { rows } = await ejecutor.query<FilaUsuarioAutenticado>(SQL_AUTENTICADO, [idUsuario]);
  return rows[0] ?? null;
}

export async function buscarCredencial(
  nombreUsuario: string,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaUsuarioConCredencial | null> {
  const { rows } = await ejecutor.query<FilaUsuarioConCredencial>(SQL_CREDENCIAL, [nombreUsuario]);
  return rows[0] ?? null;
}

export async function buscarPorId(
  idUsuario: string,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaUsuario | null> {
  const { rows } = await ejecutor.query<FilaUsuario>(
    `SELECT ${CAMPOS_RESUMEN} FROM usuario u JOIN rol r ON r.id = u.id_rol WHERE u.id = $1`,
    [idUsuario],
  );
  return rows[0] ?? null;
}

export interface FiltroUsuarios {
  readonly texto?: string | undefined;
  readonly codigoRol?: string | undefined;
  readonly soloActivos: boolean;
}

export async function contar(filtro: FiltroUsuarios, ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM usuario u JOIN rol r ON r.id = u.id_rol ${DONDE}`,
    parametrosFiltro(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listar(
  filtro: FiltroUsuarios,
  limite: number,
  desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaUsuario[]> {
  const { rows } = await ejecutor.query<FilaUsuario>(
    `SELECT ${CAMPOS_RESUMEN}
       FROM usuario u JOIN rol r ON r.id = u.id_rol ${DONDE}
      ORDER BY u.nombre_usuario
      LIMIT $4 OFFSET $5`,
    [...parametrosFiltro(filtro), limite, desplazamiento],
  );
  return rows;
}

const DONDE = `
  WHERE ($1::text IS NULL OR u.nombre_usuario ILIKE '%' || $1 || '%' OR u.nombres ILIKE '%' || $1 || '%')
    AND ($2::text IS NULL OR r.codigo = $2)
    AND ($3::boolean IS FALSE OR u.activo)`;

function parametrosFiltro(filtro: FiltroUsuarios): unknown[] {
  return [filtro.texto ?? null, filtro.codigoRol ?? null, filtro.soloActivos];
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: {
    idCentro: string; idRol: string; nombreUsuario: string; nombres: string;
    contrasenaHash: string; correo: string | null; creadoPor: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO usuario (id_centro, id_rol, nombre_usuario, nombres, contrasena_hash, correo, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [datos.idCentro, datos.idRol, datos.nombreUsuario, datos.nombres,
      datos.contrasenaHash, datos.correo, datos.creadoPor],
  );
  return rows[0]!.id;
}

/** Actualizacion parcial: solo toca los campos que llegan distintos de undefined. */
export async function actualizar(
  ejecutor: Ejecutor,
  idUsuario: string,
  cambios: { nombres?: string; correo?: string | null; idRol?: string },
  modificadoPor: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE usuario
        SET nombres = coalesce($2, nombres),
            correo = CASE WHEN $3::boolean THEN $4 ELSE correo END,
            id_rol = coalesce($5, id_rol),
            modificado_en = now(), modificado_por = $6
      WHERE id = $1`,
    [idUsuario, cambios.nombres ?? null, cambios.correo !== undefined,
      cambios.correo ?? null, cambios.idRol ?? null, modificadoPor],
  );
}

export async function guardarContrasena(
  ejecutor: Ejecutor,
  idUsuario: string,
  contrasenaHash: string,
  modificadoPor: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE usuario
        SET contrasena_hash = $2, intentos_fallidos = 0, bloqueado = false,
            modificado_en = now(), modificado_por = $3
      WHERE id = $1`,
    [idUsuario, contrasenaHash, modificadoPor],
  );
}

/** Suma un intento fallido y bloquea al alcanzar el limite, en una sola sentencia. */
export async function anotarIntentoFallido(
  ejecutor: Ejecutor,
  idUsuario: string,
  intentosParaBloqueo: number,
): Promise<{ intentos_fallidos: number; bloqueado: boolean }> {
  const { rows } = await ejecutor.query<{ intentos_fallidos: number; bloqueado: boolean }>(
    `UPDATE usuario
        SET intentos_fallidos = intentos_fallidos + 1,
            bloqueado = (intentos_fallidos + 1) >= $2
      WHERE id = $1
      RETURNING intentos_fallidos, bloqueado`,
    [idUsuario, intentosParaBloqueo],
  );
  return rows[0]!;
}

export async function reiniciarIntentos(ejecutor: Ejecutor, idUsuario: string): Promise<void> {
  await ejecutor.query(
    'UPDATE usuario SET intentos_fallidos = 0 WHERE id = $1 AND intentos_fallidos > 0',
    [idUsuario],
  );
}

export async function cambiarBloqueo(
  ejecutor: Ejecutor, idUsuario: string, bloqueado: boolean, modificadoPor: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE usuario
        SET bloqueado = $2, intentos_fallidos = CASE WHEN $2 THEN intentos_fallidos ELSE 0 END,
            modificado_en = now(), modificado_por = $3
      WHERE id = $1`,
    [idUsuario, bloqueado, modificadoPor],
  );
}

/** Nada se elimina: se desactiva (RN de datos). */
export async function cambiarActivo(
  ejecutor: Ejecutor, idUsuario: string, activo: boolean, modificadoPor: string,
): Promise<void> {
  await ejecutor.query(
    'UPDATE usuario SET activo = $2, modificado_en = now(), modificado_por = $3 WHERE id = $1',
    [idUsuario, activo, modificadoPor],
  );
}
