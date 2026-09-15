/**
 * Transacciones. Toda operacion que toca varias tablas pasa por aqui: se
 * confirma entera o se revierte entera (regla de arquitectura 8).
 *
 * Son REENTRANTES. Si ya hay una transaccion en curso en este flujo, el
 * trabajo anidado la reutiliza en lugar de abrir otra. Sin eso, un servicio
 * que llama a otro abriria una segunda conexion que no ve lo que la primera
 * todavia no confirmo, y el conjunto dejaria de ser atomico justo cuando
 * mas hace falta que lo sea: al aplicar una operacion de sincronizacion y
 * anotar su clave de idempotencia.
 *
 * El seguimiento se hace con AsyncLocalStorage, que acompana al flujo
 * asincrono sin tener que ir pasando el cliente de mano en mano.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';
import { obtenerPiscina } from '../infraestructura/conexion.js';

/**
 * Ejecutor de consultas: la piscina o un cliente dentro de una transaccion.
 *
 * REGLA: nunca se lanzan consultas en PARALELO sobre el mismo ejecutor
 * cuando puede ser un cliente de transaccion. Un cliente atiende una
 * consulta a la vez; pg lo deprecó y deja de admitirlo en la version 9. El
 * Promise.all solo es seguro contra la piscina, que reparte un cliente por
 * consulta.
 */
export type Ejecutor = Pick<PoolClient, 'query'>;

const transaccionEnCurso = new AsyncLocalStorage<PoolClient>();

export async function enTransaccion<T>(trabajo: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const abierta = transaccionEnCurso.getStore();
  // Ya hay una transaccion: este trabajo forma parte de ella. Ni BEGIN ni
  // COMMIT aqui; los pone quien la abrio.
  if (abierta !== undefined) return trabajo(abierta);

  const cliente = await obtenerPiscina().connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await transaccionEnCurso.run(cliente, () => trabajo(cliente));
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Lectura suelta. Dentro de una transaccion devuelve su cliente, para que
 * lo leido incluya lo que esa misma transaccion acaba de escribir.
 */
export function ejecutorPorDefecto(): Ejecutor {
  return transaccionEnCurso.getStore() ?? obtenerPiscina();
}

/** True si este flujo ya esta dentro de una transaccion. */
export function hayTransaccionEnCurso(): boolean {
  return transaccionEnCurso.getStore() !== undefined;
}
