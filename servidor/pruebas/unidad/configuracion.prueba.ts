/**
 * Como se lee la configuracion.
 *
 * ESTA PRUEBA EXISTE POR UN FALLO QUE COSTO DATOS.
 *
 * El pliego (§67) nombra las variables en ingles y el sistema las tenia en
 * español, asi que se aceptan las dos. La primera version traducia EN CADA
 * LECTURA, dando prioridad al nombre del pliego. El efecto secundario fue
 * que un valor puesto en tiempo de ejecucion bajo el nombre propio quedaba
 * ignorado en silencio si el `.env` traia el del pliego.
 *
 * Las pruebas de integracion hacen exactamente eso —crean una base
 * desechable y apuntan el proceso hacia ella con
 * `process.env['BD_NOMBRE']`— y con la prioridad invertida corrieron
 * **contra la base de desarrollo**, borrandola y volviendola a sembrar.
 *
 * Ahora la traduccion ocurre UNA VEZ al arrancar y despues hay un solo
 * nombre que leer. Lo que se comprueba aqui es justo eso: que asignar en
 * caliente funciona.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { leerConfiguracionBaseDatos } from '../../src/comun/configuracion.js';

const CLAVES = ['BD_NOMBRE', 'BD_HOST', 'BD_PUERTO', 'DATABASE_NAME', 'DATABASE_HOST'] as const;
let original: Record<string, string | undefined>;

beforeEach(() => {
  original = Object.fromEntries(CLAVES.map((clave) => [clave, process.env[clave]]));
});

afterEach(() => {
  for (const [clave, valor] of Object.entries(original)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

describe('lectura de la configuracion de base de datos', () => {
  it('un valor puesto en caliente manda sobre lo que trajo el .env', () => {
    process.env['BD_NOMBRE'] = 'servitotal_pruebas';
    expect(leerConfiguracionBaseDatos().nombre).toBe('servitotal_pruebas');
  });

  it('y se puede cambiar otra vez, sin que quede pegado el primero', () => {
    process.env['BD_NOMBRE'] = 'una_base';
    expect(leerConfiguracionBaseDatos().nombre).toBe('una_base');
    process.env['BD_NOMBRE'] = 'otra_base';
    expect(leerConfiguracionBaseDatos().nombre).toBe('otra_base');
  });

  it('lee el host y el puerto de donde le digan', () => {
    process.env['BD_HOST'] = '10.0.0.7';
    process.env['BD_PUERTO'] = '6543';
    const configuracion = leerConfiguracionBaseDatos();
    expect(configuracion.host).toBe('10.0.0.7');
    expect(configuracion.puerto).toBe(6543);
  });

  it('un puerto que no es un numero se rechaza con su nombre del pliego', () => {
    process.env['BD_PUERTO'] = 'cinco mil';
    expect(() => leerConfiguracionBaseDatos()).toThrow(/DATABASE_PORT \(o BD_PUERTO\)/);
  });
});
