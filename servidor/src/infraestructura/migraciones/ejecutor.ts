/**
 * Ejecutor de migraciones.
 *
 * Cada archivo .sql se aplica una sola vez, dentro de su propia transaccion
 * (PostgreSQL soporta DDL transaccional: si un archivo falla a la mitad, no
 * deja objetos sueltos). Si el contenido de un archivo ya aplicado cambia,
 * el ejecutor se detiene: reescribir historia migrada es un error humano
 * que no se corrige en silencio.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorMigracion } from '../../comun/errores.js';
import { bitacora } from '../../comun/bitacora.js';
import { enTransaccion } from '../conexion.js';
import { anotarAplicada, asegurarTablaControl, calcularHuella, listarAplicadas } from './registro.js';

const DIRECTORIO_POR_DEFECTO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../base-datos/migraciones',
);

export interface ResultadoMigracion {
  readonly aplicadas: readonly string[];
  readonly omitidas: readonly string[];
}

async function listarArchivos(directorio: string): Promise<string[]> {
  const entradas = await readdir(directorio);
  return entradas.filter((nombre) => nombre.endsWith('.sql')).sort();
}

export async function aplicarMigraciones(directorio = DIRECTORIO_POR_DEFECTO): Promise<ResultadoMigracion> {
  const archivos = await listarArchivos(directorio);
  const aplicadas: string[] = [];
  const omitidas: string[] = [];

  await enTransaccion(async (cliente) => {
    await asegurarTablaControl(cliente);
    const yaAplicadas = await listarAplicadas(cliente);

    for (const nombre of archivos) {
      const contenido = await readFile(path.join(directorio, nombre), 'utf8');
      const huella = calcularHuella(contenido);
      const previa = yaAplicadas.get(nombre);

      if (previa !== undefined) {
        if (previa.huella !== huella) {
          throw new ErrorMigracion(
            `La migracion ${nombre} ya fue aplicada el ${previa.aplicadaEn.toISOString()} pero su contenido cambio. ` +
              'Una migracion aplicada no se edita: cree una migracion nueva con el cambio.',
          );
        }
        omitidas.push(nombre);
        continue;
      }

      const inicio = Date.now();
      await cliente.query(contenido);
      await anotarAplicada(cliente, nombre, huella, Date.now() - inicio);
      aplicadas.push(nombre);
      bitacora.informacion(`Migracion aplicada: ${nombre}`, { duracionMs: Date.now() - inicio });
    }
  });

  return { aplicadas, omitidas };
}

export async function consultarEstado(directorio = DIRECTORIO_POR_DEFECTO): Promise<
  readonly { nombre: string; aplicada: boolean; alterada: boolean }[]
> {
  const archivos = await listarArchivos(directorio);
  return enTransaccion(async (cliente) => {
    await asegurarTablaControl(cliente);
    const yaAplicadas = await listarAplicadas(cliente);
    const estado: { nombre: string; aplicada: boolean; alterada: boolean }[] = [];
    for (const nombre of archivos) {
      const previa = yaAplicadas.get(nombre);
      const huella = calcularHuella(await readFile(path.join(directorio, nombre), 'utf8'));
      estado.push({
        nombre,
        aplicada: previa !== undefined,
        alterada: previa !== undefined && previa.huella !== huella,
      });
    }
    return estado;
  });
}
