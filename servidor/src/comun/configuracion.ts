/** Lectura y validacion de la configuracion de entorno. Falla temprano y claro. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorConfiguracion } from './errores.js';

/**
 * Carga el `.env` de la raiz del repositorio, si existe.
 *
 * El README manda copiar `.env.ejemplo` a `.env`, asi que alguien tiene que
 * leerlo. Se usa `process.loadEnvFile`, que trae Node desde la 20.12, en vez
 * de sumar una dependencia para parsear cuatro lineas.
 *
 * Lo que YA esta en el entorno gana sobre el archivo —esa es la semantica de
 * `loadEnvFile`— y por eso un `BD_NOMBRE=otra npm run migrar` sigue mandando
 * sobre lo que diga el `.env`.
 */
function cargarArchivoDeEntorno(): void {
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  // comun/ -> src/ -> servidor/ -> raiz del repositorio
  const raiz = path.resolve(aqui, '..', '..', '..');
  const archivo = path.join(raiz, '.env');
  if (!existsSync(archivo)) return;
  try {
    process.loadEnvFile(archivo);
  } catch {
    // Un .env ilegible no puede impedir arrancar con variables de entorno
    // puestas a mano, que es como corre en produccion.
  }
}

cargarArchivoDeEntorno();

export interface ConfiguracionBaseDatos {
  readonly host: string;
  readonly puerto: number;
  readonly nombre: string;
  readonly usuario: string;
  readonly contrasena: string;
  readonly maxConexiones: number;
}

/**
 * Nombres alternativos de cada variable.
 *
 * El pliego (§67) nombra las variables en ingles —`DATABASE_HOST`,
 * `JWT_SECRET`, `PORT`— y el sistema las tenia en español. Se aceptan LAS
 * DOS: un despliegue que ya tiene su `.env` escrito no deberia dejar de
 * arrancar porque alguien renombro una variable.
 */
const NOMBRE_DEL_PLIEGO: Readonly<Record<string, string>> = {
  BD_HOST: 'DATABASE_HOST',
  BD_PUERTO: 'DATABASE_PORT',
  BD_NOMBRE: 'DATABASE_NAME',
  BD_USUARIO: 'DATABASE_USER',
  BD_CONTRASENA: 'DATABASE_PASSWORD',
  JWT_SECRETO: 'JWT_SECRET',
  PUERTO: 'PORT',
};

/**
 * Traduce los nombres del pliego a los propios UNA SOLA VEZ, al arrancar.
 *
 * ESTO NO ES UN DETALLE DE ESTILO; LA VERSION ANTERIOR BORRABA DATOS.
 *
 * Al principio la traduccion se hacia en cada lectura, dando prioridad al
 * nombre del pliego. El efecto secundario era que un valor puesto EN
 * TIEMPO DE EJECUCION bajo el nombre propio quedaba silenciosamente
 * ignorado si el `.env` traia el del pliego.
 *
 * Las pruebas de integracion hacen exactamente eso: crean una base
 * desechable y apuntan el proceso hacia ella con
 * `process.env['BD_NOMBRE'] = 'servitotal_pruebas'`. Con la prioridad
 * invertida, ese apunte no servia de nada y las pruebas corrian **contra la
 * base de desarrollo**, escribiendo en ella.
 *
 * Copiando una vez al arrancar, despues hay UN SOLO nombre que leer y
 * asignarlo en caliente vuelve a funcionar como siempre.
 */
function normalizarNombresDelPliego(): void {
  for (const [propio, delPliego] of Object.entries(NOMBRE_DEL_PLIEGO)) {
    const valor = process.env[delPliego];
    if (valor !== undefined && valor !== '') process.env[propio] = valor;
  }
}

// Se llama AQUI y no arriba: `NOMBRE_DEL_PLIEGO` es un `const` y no se
// hoistea, asi que invocarla antes de su declaracion revienta en tiempo de
// ejecucion con «Cannot access before initialization» —un fallo que el
// compilador no ve porque el uso esta dentro de una funcion—.
normalizarNombresDelPliego();

/** Como nombrar la variable en un mensaje de error, sin confundir a nadie. */
function comoSeLlama(clave: string): string {
  const alterno = NOMBRE_DEL_PLIEGO[clave];
  return alterno === undefined ? clave : `${alterno} (o ${clave})`;
}

function texto(clave: string, porDefecto?: string): string {
  const valor = process.env[clave] ?? porDefecto;
  if (valor === undefined || valor === '') {
    throw new ErrorConfiguracion(
      `Falta la variable de entorno ${comoSeLlama(clave)}. `
      + 'Copie .env.ejemplo a .env y complete el valor.',
    );
  }
  return valor;
}

function entero(clave: string, porDefecto: number): number {
  const bruto = process.env[clave];
  if (bruto === undefined || bruto === '') return porDefecto;
  const valor = Number.parseInt(bruto, 10);
  if (!Number.isInteger(valor)) {
    throw new ErrorConfiguracion(
      `La variable ${comoSeLlama(clave)} debe ser un numero entero; se recibio "${bruto}".`,
    );
  }
  return valor;
}

export function leerConfiguracionBaseDatos(): ConfiguracionBaseDatos {
  return {
    host: texto('BD_HOST', '127.0.0.1'),
    puerto: entero('BD_PUERTO', 5432),
    nombre: texto('BD_NOMBRE', 'servitotal'),
    usuario: texto('BD_USUARIO', 'postgres'),
    contrasena: process.env['BD_CONTRASENA'] ?? '',
    maxConexiones: entero('BD_MAX_CONEXIONES', 10),
  };
}

export interface ConfiguracionTokens {
  /** Clave de firma HS256. Debe tener al menos 32 caracteres. */
  readonly secreto: string;
  readonly emisor: string;
  readonly audiencia: string;
  readonly minutosAcceso: number;
  readonly horasRefrescoPanel: number;
  readonly diasRefrescoDispositivo: number;
}

const LARGO_MINIMO_SECRETO = 32;

export function leerConfiguracionTokens(): ConfiguracionTokens {
  const secreto = texto('JWT_SECRETO');
  if (secreto.length < LARGO_MINIMO_SECRETO) {
    throw new ErrorConfiguracion(
      `JWT_SECRETO debe tener al menos ${LARGO_MINIMO_SECRETO} caracteres. ` +
        'Genere uno con: openssl rand -base64 48',
    );
  }
  return {
    secreto,
    emisor: texto('JWT_EMISOR', 'servitotal'),
    audiencia: texto('JWT_AUDIENCIA', 'servitotal-api'),
    minutosAcceso: entero('JWT_MINUTOS_ACCESO', 15),
    horasRefrescoPanel: entero('JWT_HORAS_REFRESCO_PANEL', 12),
    diasRefrescoDispositivo: entero('JWT_DIAS_REFRESCO_DISPOSITIVO', 30),
  };
}

/** Intentos fallidos consecutivos tras los cuales la cuenta queda bloqueada. */
export function leerIntentosParaBloqueo(): number {
  return entero('SEGURIDAD_INTENTOS_PARA_BLOQUEO', 5);
}

export function leerPuerto(): number {
  return entero('PUERTO', 3000);
}

/** Semilla del generador pseudoaleatorio: fijarla hace la siembra reproducible. */
export function leerSemillaDatos(): number {
  return entero('SEMILLA_DATOS', 20260913);
}
