/**
 * Apoyo de las pruebas de integracion: crea una base desechable para que
 * nunca se toque la base de desarrollo.
 */
import pg from 'pg';
import { leerConfiguracionBaseDatos } from '../../src/comun/configuracion.js';

const NOMBRE_BASE_DE_PRUEBAS = process.env['BD_NOMBRE_PRUEBAS'] ?? 'servitotal_pruebas';

/**
 * Recrea la base de pruebas y apunta la configuracion del proceso hacia
 * ella. Debe llamarse antes de cualquier consulta: la piscina lee la
 * configuracion de forma perezosa, en su primer uso.
 */
export async function prepararBaseDePruebas(): Promise<string> {
  const configuracion = leerConfiguracionBaseDatos();
  const mantenimiento = new pg.Client({
    host: configuracion.host,
    port: configuracion.puerto,
    user: configuracion.usuario,
    password: configuracion.contrasena,
    database: 'postgres',
  });

  try {
    await mantenimiento.connect();
  } catch (error) {
    throw new Error(
      `Las pruebas de integracion necesitan un PostgreSQL accesible en ` +
        `${configuracion.host}:${configuracion.puerto}. Levante la base y vuelva a ejecutarlas. ` +
        `Para correr solo las pruebas que no requieren base: npm run prueba:unidad. ` +
        `Detalle: ${String(error)}`,
    );
  }

  try {
    await mantenimiento.query(`DROP DATABASE IF EXISTS ${NOMBRE_BASE_DE_PRUEBAS} WITH (FORCE)`);
    await mantenimiento.query(`CREATE DATABASE ${NOMBRE_BASE_DE_PRUEBAS}`);
  } finally {
    await mantenimiento.end();
  }

  process.env['BD_NOMBRE'] = NOMBRE_BASE_DE_PRUEBAS;
  return NOMBRE_BASE_DE_PRUEBAS;
}
