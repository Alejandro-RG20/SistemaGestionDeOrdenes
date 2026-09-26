/**
 * Tiendas: las sucursales del grupo desde las que entra el trabajo.
 *
 * UNA TIENDA NO SE BORRA NUNCA. Se desactiva, y eso hace dos cosas
 * distintas que conviene no confundir:
 *
 *  - Deja de ofrecerse para ordenes NUEVAS. Es el efecto que se busca.
 *  - NO toca las ordenes viejas. Una orden levantada hace ocho meses en
 *    una sucursal que ya cerro tiene que seguir diciendo que vino de ahi;
 *    si se borrara, el historial mentiria sobre su propio origen.
 *
 * Por eso tampoco hay DELETE en las rutas.
 */
import type { PeticionTienda, Tienda } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import * as repositorio from './repositorio.js';

function aTienda(fila: repositorio.FilaTienda): Tienda {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    direccion: fila.direccion,
    telefono: fila.telefono,
    perteneceAlGrupo: fila.pertenece_al_grupo,
    activa: fila.activa,
  };
}

export async function listar(soloActivas: boolean): Promise<readonly Tienda[]> {
  return (await repositorio.listar(soloActivas)).map(aTienda);
}

export async function obtener(id: string): Promise<Tienda> {
  const fila = await repositorio.buscar(id);
  if (fila === null) throw new ErrorNoEncontrado('No existe una tienda con ese identificador.');
  return aTienda(fila);
}

export async function crear(actor: Actor, peticion: PeticionTienda): Promise<Tienda> {
  const id = await enTransaccion((cliente) => repositorio.insertar(cliente, {
    codigo: peticion.codigo,
    nombre: peticion.nombre,
    direccion: peticion.direccion ?? null,
    telefono: peticion.telefono ?? null,
    perteneceAlGrupo: peticion.perteneceAlGrupo,
    idUsuario: actor.id,
  }));
  return obtener(id);
}

/**
 * Editar una tienda NO cambia el pasado.
 *
 * `pertenece_al_grupo` es lo que usa el motor de garantias, asi que
 * cambiarlo altera como se evaluan las ordenes NUEVAS. Las ya creadas
 * llevan congelada la regla de cobertura que se les aplico (RN-22), de
 * modo que corregir este dato hoy no reescribe una garantia concedida
 * hace medio año. Es deliberado: una orden se juzga con las reglas que
 * habia cuando se recibio.
 */
export async function editar(
  actor: Actor, id: string, peticion: PeticionTienda,
): Promise<Tienda> {
  await obtener(id);
  await enTransaccion((cliente) => repositorio.actualizar(cliente, id, {
    codigo: peticion.codigo,
    nombre: peticion.nombre,
    direccion: peticion.direccion ?? null,
    telefono: peticion.telefono ?? null,
    perteneceAlGrupo: peticion.perteneceAlGrupo,
    idUsuario: actor.id,
  }));
  return obtener(id);
}

export async function desactivar(actor: Actor, id: string): Promise<Tienda> {
  const tienda = await obtener(id);
  const uso = await repositorio.usoDeTienda(id);

  // Desactivar una tienda con personal adentro los deja sin poder levantar
  // ordenes y sin entender por que. Se avisa antes, con nombres y numeros.
  if (uso.usuarios > 0) {
    throw new ErrorValidacion(
      `«${tienda.nombre}» todavia tiene ${uso.usuarios} usuario(s) asignado(s). `
      + 'Reasignelos antes de desactivarla, o se van a quedar sin poder crear ordenes.',
      { usuarios: 'Reasigne al personal primero.' },
    );
  }

  await enTransaccion((cliente) => repositorio.cambiarActiva(cliente, id, false, actor.id));
  return obtener(id);
}

export async function activar(actor: Actor, id: string): Promise<Tienda> {
  await obtener(id);
  await enTransaccion((cliente) => repositorio.cambiarActiva(cliente, id, true, actor.id));
  return obtener(id);
}
