/**
 * Lo que pasa cuando el cuerpo de la peticion no sirve.
 *
 * Esto salio de una sonda mal escrita: al mandar basura por accidente a
 * `POST /ordenes`, el servidor respondio **500** con
 * `correlationId: "sin-correlacion"`.
 *
 * Dos cosas mal, y las dos importan a quien integra con la API:
 *
 *  - Un 500 dice «el problema es nuestro». Un cuerpo que no es JSON es del
 *    cliente, y mandarlo a buscar un fallo del servidor que no existe le
 *    cuesta una tarde.
 *  - Sin identificador de correlacion no puede reportar el error, porque no
 *    tiene con que buscarlo en la bitacora. `express.json()` rechazaba el
 *    cuerpo ANTES de que corriera el middleware que asigna el identificador.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;
let cabecera: { Authorization: string };

beforeAll(async () => {
  entorno = await montarApi();
  const nombreUsuario = await usuarioConRol(entorno.piscina, CODIGO_ROL.AGENTE_TELEFONIA);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  cabecera = { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
});
afterAll(async () => { await entorno.cerrar(); });

describe('un cuerpo que no es JSON', () => {
  it('responde 400, no 500: el problema es del cuerpo que llego', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes`).set(cabecera)
      .set('Content-Type', 'application/json')
      .send('esto-no-es-json');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.success).toBe(false);
    expect(respuesta.body.error.code).toBe('CUERPO_INVALIDO');
  });

  it('trae identificador de correlacion, que es lo que lo hace reportable', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes`).set(cabecera)
      .set('Content-Type', 'application/json')
      .send('{roto');

    expect(respuesta.body.error.correlationId).toBeTruthy();
    expect(respuesta.body.error.correlationId).not.toBe('sin-correlacion');
  });

  it('no filtra la pila ni el mensaje del parseador', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes`).set(cabecera)
      .set('Content-Type', 'application/json')
      .send('{"a":');

    const mensaje = respuesta.body.error.message as string;
    expect(mensaje).toBe('El cuerpo de la peticion no es JSON valido.');
    // Nada de «Unexpected token», ni rutas de node_modules.
    expect(mensaje).not.toMatch(/unexpected|node_modules|at /i);
  });
});

describe('un cuerpo demasiado grande', () => {
  it('responde 413 y dice por donde se suben los archivos', async () => {
    // El limite es 256kb; esto lo pasa de sobra.
    const enorme = { nota: 'a'.repeat(400_000) };

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes`).set(cabecera).send(enorme);

    expect(respuesta.status).toBe(413);
    expect(respuesta.body.error.code).toBe('CUERPO_INVALIDO');
    // El mensaje no deja a nadie adivinando: dice cual es la via correcta.
    expect(respuesta.body.error.message).toMatch(/evidencias/i);
  });
});

describe('un cuerpo vacio sigue validandose como siempre', () => {
  it('un POST sin los campos obligatorios responde 400 de validacion', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes`).set(cabecera).send({});

    expect(respuesta.status).toBe(400);
    // Este NO es CUERPO_INVALIDO: el JSON estaba bien, faltaban los datos.
    expect(respuesta.body.error.code).toBe('DATOS_INVALIDOS');
  });
});
