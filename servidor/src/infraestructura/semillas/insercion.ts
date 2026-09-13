/**
 * Insercion masiva con COPY. Sembrar 30 000 ordenes con sus eventos,
 * evidencias y movimientos son cientos de miles de filas: con INSERT fila a
 * fila la siembra tarda minutos; con COPY, segundos.
 */
import type { PoolClient } from 'pg';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import copia from 'pg-copy-streams';

export type ValorCopiable = string | number | boolean | Date | readonly string[] | null | undefined;

const ESCAPES: readonly (readonly [RegExp, string])[] = [
  [/\\/g, '\\\\'],
  [/\t/g, '\\t'],
  [/\n/g, '\\n'],
  [/\r/g, '\\r'],
];

function comoTextoArreglo(valores: readonly string[]): string {
  const elementos = valores.map((valor) => `"${valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${elementos.join(',')}}`;
}

function formatear(valor: ValorCopiable): string {
  if (valor === null || valor === undefined) return '\\N';
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return formatear(comoTextoArreglo(valor as readonly string[]));
  if (typeof valor === 'boolean') return valor ? 't' : 'f';
  if (typeof valor === 'number') return String(valor);
  let texto = valor as string;
  for (const [patron, reemplazo] of ESCAPES) texto = texto.replace(patron, reemplazo);
  return texto;
}

/**
 * Copia las filas a la tabla. `filas` puede ser un generador: asi las filas
 * se producen y se envian sin materializar cientos de miles de objetos.
 */
export async function copiarFilas(
  cliente: PoolClient,
  tabla: string,
  columnas: readonly string[],
  filas: Iterable<readonly ValorCopiable[]>,
): Promise<number> {
  let contador = 0;
  const lineas = (function* generar(): Generator<string> {
    for (const fila of filas) {
      contador += 1;
      yield `${fila.map(formatear).join('\t')}\n`;
    }
  })();

  const destino = cliente.query(
    copia.from(`COPY ${tabla} (${columnas.join(', ')}) FROM STDIN WITH (FORMAT text)`),
  );
  await pipeline(Readable.from(lineas, { objectMode: false }), destino);
  return contador;
}
