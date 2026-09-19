/**
 * Apoyo para las pruebas de los adaptadores del navegador.
 *
 * `fake-indexeddb` es la MISMA especificacion de IndexedDB corriendo en
 * memoria, no un doble escrito por nosotros. Eso importa: lo que se quiere
 * comprobar aqui son las rarezas del API real —que una transaccion se
 * cierra sola, que un indice devuelve en su orden, que borrar dentro de un
 * cursor no invalida el recorrido—, y un doble amable las esconderia todas.
 */
import 'fake-indexeddb/auto';
import { abrirBaseLocal } from '../src/campo/almacen-indexeddb.js';

const NOMBRE_BASE = 'servitotal-campo';

/** La conexion de la prueba anterior, para poder cerrarla antes de borrar. */
let abierta: IDBDatabase | null = null;

/**
 * Base local limpia.
 *
 * Se CIERRA la conexion anterior y se ESPERA el borrado. Las dos cosas
 * hacen falta: `deleteDatabase` se queda bloqueado mientras alguien tenga
 * la base abierta, y es asincrono, asi que seguir sin esperarlo dejaria la
 * base vieja viva y una prueba heredaria el estado de la otra —pasando, o
 * fallando, por la razon equivocada—.
 */
export async function baseLimpia(): Promise<IDBDatabase> {
  abierta?.close();
  abierta = null;

  await new Promise<void>((resolver) => {
    const peticion = indexedDB.deleteDatabase(NOMBRE_BASE);
    peticion.onsuccess = () => resolver();
    peticion.onerror = () => resolver();
    peticion.onblocked = () => resolver();
  });

  abierta = await abrirBaseLocal();
  return abierta;
}
