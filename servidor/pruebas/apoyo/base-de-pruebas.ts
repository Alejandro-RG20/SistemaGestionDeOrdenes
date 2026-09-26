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

  /*
   * RED DE SEGURIDAD, Y NO ES PARANOIA: ESTO YA FALLO UNA VEZ.
   *
   * Apuntar el proceso a la base de pruebas es un efecto secundario sobre
   * `process.env`, y basta un cambio en como se lee la configuracion para
   * que deje de surtir efecto **en silencio**. Cuando eso paso, las
   * pruebas de integracion —que crean ordenes, mueven inventario y borran
   * tablas— corrieron contra la base de DESARROLLO sin que nada avisara.
   *
   * Se relee la configuracion y se comprueba. Si no apunta a donde debe,
   * las pruebas no arrancan: perder una corrida es barato, perder la base
   * de alguien no.
   */
  const efectiva = leerConfiguracionBaseDatos().nombre;
  if (efectiva !== NOMBRE_BASE_DE_PRUEBAS) {
    throw new Error(
      `Las pruebas iban a correr contra «${efectiva}» y no contra `
      + `«${NOMBRE_BASE_DE_PRUEBAS}». Se detienen antes de tocar nada. `
      + 'Causa probable: la configuracion esta leyendo otro nombre de variable '
      + '(DATABASE_NAME frente a BD_NOMBRE) y el apunte de las pruebas se ignora.',
    );
  }

  return NOMBRE_BASE_DE_PRUEBAS;
}
