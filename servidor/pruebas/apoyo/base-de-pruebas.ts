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

/*
 * UNA SIEMBRA POR VERSION DEL CODIGO, NO UNA POR ARCHIVO DE PRUEBAS.
 *
 * Cada archivo de integracion necesita la base completa: 23 migraciones y
 * 30 000 ordenes sembradas. Sembrarla en cada archivo costaba unos cinco
 * minutos por archivo y mas de hora y media la suite. Ahora se siembra UNA
 * vez en una base plantilla y cada archivo arranca de una copia exacta
 * (`CREATE DATABASE ... TEMPLATE`), que PostgreSQL hace en segundos.
 *
 * La plantilla se marca con la huella de todo lo que decide su contenido:
 * las migraciones, la siembra y el dominio compartido. Si cualquiera cambia,
 * la huella cambia y la plantilla se vuelve a sembrar. Asi nunca se prueba
 * contra una base vieja.
 */
const NOMBRE_PLANTILLA = `${NOMBRE_BASE_DE_PRUEBAS}_plantilla`;

async function huellaDeLaSiembra(): Promise<string> {
  const { createHash } = await import('node:crypto');
  const { readdir, readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const carpetas = [
    'base-datos/migraciones', 'servidor/src/infraestructura/semillas', 'compartido/src',
  ];
  const resumen = createHash('sha256');
  for (const carpeta of carpetas) {
    const entradas = await readdir(path.join(raiz, carpeta), { recursive: true, withFileTypes: true });
    const archivos = entradas
      .filter((entrada) => entrada.isFile())
      .map((entrada) => path.join(entrada.parentPath, entrada.name))
      .sort();
    for (const archivo of archivos) {
      resumen.update(path.relative(raiz, archivo));
      resumen.update(await readFile(archivo));
    }
  }
  return resumen.digest('hex').slice(0, 32);
}

/**
 * Deja lista la base de pruebas, migrada y sembrada, copiada de la plantilla.
 * Siembra la plantilla solo si no existe o si su huella no es la del codigo.
 */
export async function prepararBaseSembrada(semilla: number): Promise<string> {
  const configuracion = leerConfiguracionBaseDatos();
  const conectar = async (): Promise<pg.Client> => {
    const cliente = new pg.Client({
      host: configuracion.host, port: configuracion.puerto,
      user: configuracion.usuario, password: configuracion.contrasena, database: 'postgres',
    });
    try {
      await cliente.connect();
    } catch (error) {
      throw new Error(
        `Las pruebas de integracion necesitan un PostgreSQL accesible en `
        + `${configuracion.host}:${configuracion.puerto}. Detalle: ${String(error)}`,
      );
    }
    return cliente;
  };

  const huella = `siembra:${semilla}:${await huellaDeLaSiembra()}`;
  const mantenimiento = await conectar();
  let vigente = false;
  try {
    const { rows } = await mantenimiento.query<{ comentario: string | null }>(
      `SELECT shobj_description(d.oid, 'pg_database') AS comentario
         FROM pg_database d WHERE d.datname = $1`,
      [NOMBRE_PLANTILLA],
    );
    vigente = rows[0]?.comentario === huella;
    if (!vigente) {
      await mantenimiento.query(`DROP DATABASE IF EXISTS ${NOMBRE_PLANTILLA} WITH (FORCE)`);
      await mantenimiento.query(`CREATE DATABASE ${NOMBRE_PLANTILLA}`);
    }
  } finally {
    await mantenimiento.end();
  }

  if (!vigente) {
    process.env['BD_NOMBRE'] = NOMBRE_PLANTILLA;
    if (leerConfiguracionBaseDatos().nombre !== NOMBRE_PLANTILLA) {
      throw new Error('No se pudo apuntar la siembra a la base plantilla; se detiene sin tocar nada.');
    }
    const { aplicarMigraciones } = await import('../../src/infraestructura/migraciones/ejecutor.js');
    const { sembrar } = await import('../../src/infraestructura/semillas/sembrador.js');
    const conexion = await import('../../src/infraestructura/conexion.js');
    await aplicarMigraciones();
    await sembrar({ semilla });
    // La plantilla no puede tener conexiones abiertas para copiarse.
    await conexion.cerrarPiscina();
    const marcar = await conectar();
    try {
      await marcar.query(`COMMENT ON DATABASE ${NOMBRE_PLANTILLA} IS '${huella}'`);
    } finally {
      await marcar.end();
    }
  }

  const copia = await conectar();
  try {
    await copia.query(`DROP DATABASE IF EXISTS ${NOMBRE_BASE_DE_PRUEBAS} WITH (FORCE)`);
    await copia.query(`CREATE DATABASE ${NOMBRE_BASE_DE_PRUEBAS} TEMPLATE ${NOMBRE_PLANTILLA}`);
  } finally {
    await copia.end();
  }

  process.env['BD_NOMBRE'] = NOMBRE_BASE_DE_PRUEBAS;
  const efectiva = leerConfiguracionBaseDatos().nombre;
  if (efectiva !== NOMBRE_BASE_DE_PRUEBAS) {
    throw new Error(
      `Las pruebas iban a correr contra «${efectiva}» y no contra «${NOMBRE_BASE_DE_PRUEBAS}». `
      + 'Se detienen antes de tocar nada.',
    );
  }
  return NOMBRE_BASE_DE_PRUEBAS;
}
