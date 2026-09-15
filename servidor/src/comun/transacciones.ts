/**
 * Transacciones. Toda operacion que toca varias tablas pasa por aqui: se
 * confirma entera o se revierte entera (regla de arquitectura 8).
 */
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

export async function enTransaccion<T>(trabajo: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await obtenerPiscina().connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await trabajo(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

/** Lectura suelta, fuera de transaccion. */
export function ejecutorPorDefecto(): Ejecutor {
  return obtenerPiscina();
}
