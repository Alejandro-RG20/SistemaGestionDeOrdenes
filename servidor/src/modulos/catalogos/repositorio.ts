/** Consultas de los catalogos de apoyo. */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaOpcion { readonly id: string; readonly nombre: string }
export interface FilaCategoria extends FilaOpcion { readonly linea: string }
export interface FilaTienda extends FilaOpcion { readonly pertenece_al_grupo: boolean }
export interface FilaZona extends FilaOpcion { readonly cargo_visita: string }
export interface FilaTecnico extends FilaOpcion {
  readonly tipo: string;
  readonly especialidad: string;
  readonly disponible: boolean;
  readonly carga_actual: string;
}

export async function marcas(ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<FilaOpcion[]> {
  const { rows } = await ejecutor.query<FilaOpcion>(
    'SELECT id, nombre FROM marca WHERE activa ORDER BY nombre',
  );
  return rows;
}

export async function categorias(ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<FilaCategoria[]> {
  const { rows } = await ejecutor.query<FilaCategoria>(
    'SELECT id, nombre, linea::text AS linea FROM categoria_articulo WHERE activa ORDER BY nombre',
  );
  return rows;
}

export async function tiendas(ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<FilaTienda[]> {
  const { rows } = await ejecutor.query<FilaTienda>(
    // Las del grupo primero: son la mayoria de los casos.
    `SELECT id, nombre, pertenece_al_grupo FROM tienda_origen WHERE activa
      ORDER BY pertenece_al_grupo DESC, nombre`,
  );
  return rows;
}

export async function zonas(
  idCentro: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaZona[]> {
  const { rows } = await ejecutor.query<FilaZona>(
    'SELECT id, nombre, cargo_visita FROM zona WHERE activa AND id_centro = $1 ORDER BY nombre',
    [idCentro],
  );
  return rows;
}

/**
 * Tecnicos activos con la carga que ya tienen encima.
 *
 * La carga no es un adorno: quien asigna necesita ver a quien puede darle
 * mas trabajo. Sin ese numero, la asignacion se hace por costumbre y
 * siempre recae en el mismo.
 */
export async function tecnicos(
  idCentro: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaTecnico[]> {
  const { rows } = await ejecutor.query<FilaTecnico>(
    `SELECT t.id, trim(u.nombres) AS nombre, t.tipo, t.especialidad, t.disponible,
            count(o.id) FILTER (
              WHERE o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
            )::text AS carga_actual
       FROM tecnico t
       JOIN usuario u ON u.id = t.id_usuario
       LEFT JOIN orden_servicio o ON o.id_tecnico = t.id
      WHERE t.activo AND t.id_centro = $1 AND u.activo
      GROUP BY t.id, u.nombres, t.tipo, t.especialidad, t.disponible
      ORDER BY t.tipo, u.nombres`,
    [idCentro],
  );
  return rows;
}
