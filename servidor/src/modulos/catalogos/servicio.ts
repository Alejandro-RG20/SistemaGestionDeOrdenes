/**
 * Catalogos de apoyo para los formularios del panel.
 *
 * Son datos de referencia: cambian poco y los necesita casi cualquier
 * pantalla que cree algo. Se sirven juntos porque el formulario de una
 * orden nueva los necesita todos a la vez.
 */
import type { CatalogosDeApoyo } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import * as repositorio from './repositorio.js';

export async function obtener(actor: Actor): Promise<CatalogosDeApoyo> {
  // En serie: van sobre la misma conexion del pool.
  const marcas = await repositorio.marcas();
  const categorias = await repositorio.categorias();
  const tiendas = await repositorio.tiendas();
  const zonas = await repositorio.zonas(actor.idCentro);
  const tecnicos = await repositorio.tecnicos(actor.idCentro);

  return {
    marcas: marcas.map((fila) => ({ id: fila.id, nombre: fila.nombre })),
    categorias: categorias.map((fila) => ({
      id: fila.id, nombre: fila.nombre, linea: fila.linea,
    })),
    tiendas: tiendas.map((fila) => ({
      id: fila.id, nombre: fila.nombre, perteneceAlGrupo: fila.pertenece_al_grupo,
    })),
    zonas: zonas.map((fila) => ({
      id: fila.id, nombre: fila.nombre, cargoVisita: Number(fila.cargo_visita),
    })),
    tecnicos: tecnicos.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      tipo: fila.tipo as 'ruta' | 'planta',
      especialidad: fila.especialidad,
      disponible: fila.disponible,
      cargaActual: Number(fila.carga_actual),
    })),
  };
}
