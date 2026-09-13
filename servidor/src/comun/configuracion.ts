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

/** Semilla del generador pseudoaleatorio: fijarla hace la siembra reproducible. */
export function leerSemillaDatos(): number {
  return entero('SEMILLA_DATOS', 20260913);
}
