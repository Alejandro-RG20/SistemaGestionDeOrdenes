/**
 * Registro de migraciones aplicadas. La tabla de control es lo unico que
 * el ejecutor crea fuera de los archivos .sql.
 */
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';

export interface MigracionAplicada {
  readonly nombre: string;
  readonly huella: string;
  readonly aplicadaEn: Date;
}

const SQL_TABLA_CONTROL = `
  CREATE TABLE IF NOT EXISTS migracion_aplicada (
    nombre       text PRIMARY KEY,
    huella       text NOT NULL,
    aplicada_en  timestamptz NOT NULL DEFAULT now(),
    duracion_ms  integer NOT NULL
  )`;

export function calcularHuella(contenido: string): string {
  return createHash('sha256').update(contenido, 'utf8').digest('hex');
}

export async function asegurarTablaControl(cliente: PoolClient): Promise<void> {
  await cliente.query(SQL_TABLA_CONTROL);
}

export async function listarAplicadas(cliente: PoolClient): Promise<Map<string, MigracionAplicada>> {
  const { rows } = await cliente.query<{ nombre: string; huella: string; aplicada_en: Date }>(
    'SELECT nombre, huella, aplicada_en FROM migracion_aplicada ORDER BY nombre',
  );
  return new Map(
    rows.map((fila) => [fila.nombre, { nombre: fila.nombre, huella: fila.huella, aplicadaEn: fila.aplicada_en }]),
  );
}

export async function anotarAplicada(
  cliente: PoolClient,
  nombre: string,
  huella: string,
  duracionMs: number,
): Promise<void> {
  await cliente.query(
    'INSERT INTO migracion_aplicada (nombre, huella, duracion_ms) VALUES ($1, $2, $3)',
    [nombre, huella, duracionMs],
  );
}
