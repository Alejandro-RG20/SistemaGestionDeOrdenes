/**
 * Transacciones. Toda operacion que toca varias tablas pasa por aqui: se
 * confirma entera o se revierte entera (regla de arquitectura 8).
 */
import type { PoolClient } from 'pg';
import { obtenerPiscina } from '../infraestructura/conexion.js';

/** Ejecutor de consultas: la piscina o un cliente dentro de una transaccion. */
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
