/** Lectura y validacion de la configuracion de entorno. Falla temprano y claro. */
import { ErrorConfiguracion } from './errores.js';

export interface ConfiguracionBaseDatos {
  readonly host: string;
  readonly puerto: number;
  readonly nombre: string;
  readonly usuario: string;
  readonly contrasena: string;
  readonly maxConexiones: number;
}

function texto(clave: string, porDefecto?: string): string {
  const valor = process.env[clave] ?? porDefecto;
  if (valor === undefined || valor === '') {
    throw new ErrorConfiguracion(
      `Falta la variable de entorno ${clave}. Copie .env.ejemplo a .env y complete el valor.`,
    );
  }
  return valor;
}

function entero(clave: string, porDefecto: number): number {
  const bruto = process.env[clave];
  if (bruto === undefined || bruto === '') return porDefecto;
  const valor = Number.parseInt(bruto, 10);
  if (!Number.isInteger(valor)) {
    throw new ErrorConfiguracion(`La variable ${clave} debe ser un numero entero; se recibio "${bruto}".`);
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
