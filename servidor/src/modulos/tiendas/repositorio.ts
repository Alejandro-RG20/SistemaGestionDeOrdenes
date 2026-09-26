/** Consultas de tiendas (sucursales). */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaTienda {
  readonly id: string;
  readonly codigo: string | null;
  readonly nombre: string;
  readonly direccion: string | null;
  readonly telefono: string | null;
  readonly pertenece_al_grupo: boolean;
  readonly activa: boolean;
}

const SELECCION = `
  SELECT id, codigo, nombre, direccion, telefono, pertenece_al_grupo, activa
    FROM tienda_origen`;

export async function listar(
  soloActivas: boolean, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaTienda[]> {
  const { rows } = await ejecutor.query<FilaTienda>(
    `${SELECCION} WHERE ($1::boolean IS NOT TRUE OR activa) ORDER BY nombre`,
    [soloActivas],
  );
  return rows;
}

export async function buscar(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaTienda | null> {
  const { rows } = await ejecutor.query<FilaTienda>(`${SELECCION} WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: {
    codigo: string; nombre: string; direccion: string | null; telefono: string | null;
    perteneceAlGrupo: boolean; idUsuario: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO tienda_origen
       (codigo, nombre, direccion, telefono, pertenece_al_grupo, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [datos.codigo, datos.nombre, datos.direccion, datos.telefono,
      datos.perteneceAlGrupo, datos.idUsuario],
  );
  return rows[0]!.id;
}

export async function actualizar(
  ejecutor: Ejecutor,
  id: string,
  datos: {
    codigo: string; nombre: string; direccion: string | null; telefono: string | null;
    perteneceAlGrupo: boolean; idUsuario: string;
  },
): Promise<void> {
  await ejecutor.query(
    `UPDATE tienda_origen
        SET codigo = $2, nombre = $3, direccion = $4, telefono = $5,
            pertenece_al_grupo = $6, modificado_en = now(), modificado_por = $7
      WHERE id = $1`,
    [id, datos.codigo, datos.nombre, datos.direccion, datos.telefono,
      datos.perteneceAlGrupo, datos.idUsuario],
  );
}

export async function cambiarActiva(
  ejecutor: Ejecutor, id: string, activa: boolean, idUsuario: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE tienda_origen
        SET activa = $2, modificado_en = now(), modificado_por = $3 WHERE id = $1`,
    [id, activa, idUsuario],
  );
}

/** Cuanto cuelga de la tienda. Se consulta antes de desactivarla. */
export async function usoDeTienda(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ ordenes: number; usuarios: number; articulos: number }> {
  const { rows } = await ejecutor.query<{ ordenes: string; usuarios: string; articulos: string }>(
    `SELECT (SELECT count(*) FROM orden_servicio WHERE id_tienda = $1)::text AS ordenes,
            (SELECT count(*) FROM usuario WHERE id_tienda = $1)::text AS usuarios,
            (SELECT count(*) FROM articulo WHERE id_tienda_origen = $1)::text AS articulos`,
    [id],
  );
  return {
    ordenes: Number(rows[0]!.ordenes),
    usuarios: Number(rows[0]!.usuarios),
    articulos: Number(rows[0]!.articulos),
  };
}
