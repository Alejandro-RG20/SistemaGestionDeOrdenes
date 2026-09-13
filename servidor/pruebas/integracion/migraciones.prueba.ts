import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepararBaseDePruebas } from '../apoyo/base-de-pruebas.js';

const DIRECTORIO_MIGRACIONES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../../base-datos/migraciones',
);

let aplicarMigraciones: typeof import('../../src/infraestructura/migraciones/ejecutor.js')['aplicarMigraciones'];
let consultarEstado: typeof import('../../src/infraestructura/migraciones/ejecutor.js')['consultarEstado'];
let cerrarPiscina: typeof import('../../src/infraestructura/conexion.js')['cerrarPiscina'];
let obtenerPiscina: typeof import('../../src/infraestructura/conexion.js')['obtenerPiscina'];

beforeAll(async () => {
  await prepararBaseDePruebas();
  ({ aplicarMigraciones, consultarEstado } = await import('../../src/infraestructura/migraciones/ejecutor.js'));
  ({ cerrarPiscina, obtenerPiscina } = await import('../../src/infraestructura/conexion.js'));
});

afterAll(async () => { await cerrarPiscina(); });

describe('ejecutor de migraciones', () => {
  it('aplica todos los archivos del directorio en el primer paso', async () => {
    const archivos = (await readdir(DIRECTORIO_MIGRACIONES)).filter((n) => n.endsWith('.sql'));
    const resultado = await aplicarMigraciones();
    expect(resultado.aplicadas).toHaveLength(archivos.length);
    expect(resultado.omitidas).toHaveLength(0);
  });

  it('deja el esquema del pliego completo, con sus 13 estados', async () => {
    const { rows: tablas } = await obtenerPiscina().query<{ total: string }>(
      `SELECT count(*)::text AS total FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    // 41 tablas del esquema mas la tabla de control de migraciones.
    expect(Number(tablas[0]!.total)).toBe(42);

    const { rows: estados } = await obtenerPiscina().query<{ etiqueta: string }>(
      `SELECT e.enumlabel AS etiqueta FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'estado_orden'
       ORDER BY e.enumsortorder`,
    );
    expect(estados.map((fila) => fila.etiqueta)).toEqual([
      'registrada', 'asignada', 'en_ruta', 'en_cola_taller', 'en_diagnostico', 'cotizada',
      'esperando_autorizacion', 'esperando_repuesto', 'en_reparacion', 'finalizada',
      'entregada', 'cerrada_sin_reparar', 'anulada',
    ]);
  });

  it('es idempotente: volver a ejecutarla no aplica nada', async () => {
    const resultado = await aplicarMigraciones();
    expect(resultado.aplicadas).toHaveLength(0);
    expect(resultado.omitidas.length).toBeGreaterThan(0);
  });

  it('crea la columna generada de busqueda sin acentos ni mayusculas', async () => {
    const piscina = obtenerPiscina();
    await piscina.query(
      `INSERT INTO centro (id, nombre) VALUES ('11111111-1111-4111-8111-111111111111', 'Centro de prueba')`,
    );
    await piscina.query(
      `INSERT INTO cliente (id_centro, nombres, apellidos)
       VALUES ('11111111-1111-4111-8111-111111111111', 'José', 'Martínez Ñurinda')`,
    );
    const { rows } = await piscina.query<{ nombre_busqueda: string }>(
      'SELECT nombre_busqueda FROM cliente LIMIT 1',
    );
    expect(rows[0]!.nombre_busqueda).toBe('jose martinez nurinda');
    await piscina.query('DELETE FROM cliente');
    await piscina.query('DELETE FROM centro');
  });

  it('se niega a continuar si una migracion ya aplicada cambio de contenido', async () => {
    const copia = await mkdtemp(path.join(tmpdir(), 'servitotal-migraciones-'));
    for (const nombre of (await readdir(DIRECTORIO_MIGRACIONES)).filter((n) => n.endsWith('.sql'))) {
      await writeFile(
        path.join(copia, nombre),
        await readFile(path.join(DIRECTORIO_MIGRACIONES, nombre), 'utf8'),
      );
    }
    await writeFile(path.join(copia, '0002_tipos_enumerados.sql'), '-- contenido alterado\n');

    await expect(aplicarMigraciones(copia)).rejects.toThrow(/su contenido cambio/);

    const estado = await consultarEstado(copia);
    expect(estado.find((fila) => fila.nombre === '0002_tipos_enumerados.sql')?.alterada).toBe(true);
  });
});
