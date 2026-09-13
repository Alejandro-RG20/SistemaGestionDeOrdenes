/**
 * Pruebas de sesion: inicio, bloqueo por intentos, refresco y revocacion.
 * Todas atacan la API por HTTP, no a los servicios por dentro.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;
let agente: string;

beforeAll(async () => {
  entorno = await montarApi();
  agente = await usuarioConRol(entorno.piscina, CODIGO_ROL.AGENTE_TELEFONIA);
});

afterAll(async () => { await entorno.cerrar(); });

describe('inicio de sesion', () => {
  it('entrega un par de tokens y el perfil con sus permisos', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: agente, contrasena: CONTRASENA_DE_PRUEBA });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.tokenAcceso).toBeTypeOf('string');
    expect(respuesta.body.datos.tokenRefresco).toBeTypeOf('string');
    expect(respuesta.body.datos.tokenAcceso).not.toBe(respuesta.body.datos.tokenRefresco);
    expect(respuesta.body.datos.usuario.rol).toBe(CODIGO_ROL.AGENTE_TELEFONIA);
    expect(respuesta.body.datos.usuario.permisos).toContain('ordenes.crear');
    // La respuesta nunca lleva el hash de la contrasena.
    expect(JSON.stringify(respuesta.body)).not.toContain('scrypt$');
  });

  it('no revela si el usuario existe: mismo mensaje en ambos casos', async () => {
    const conUsuarioReal = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: agente, contrasena: 'contrasena-equivocada' });
    const conUsuarioInventado = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: 'nadie.existe', contrasena: 'contrasena-equivocada' });

    expect(conUsuarioReal.status).toBe(401);
    expect(conUsuarioInventado.status).toBe(401);
    expect(conUsuarioReal.body.error.mensaje).toBe(conUsuarioInventado.body.error.mensaje);
    expect(conUsuarioReal.body.error.codigo).toBe(conUsuarioInventado.body.error.codigo);
  });

  it('bloquea la cuenta tras cinco intentos fallidos y no la abre ni con la contrasena correcta', async () => {
    const victima = await usuarioConRol(entorno.piscina, CODIGO_ROL.GESTOR_COBROS);

    for (let intento = 0; intento < 5; intento += 1) {
      const fallo = await peticion(entorno.aplicacion)
        .post(`${RAIZ}/autenticacion/sesion`)
        .send({ nombreUsuario: victima, contrasena: `equivocada-${intento}` });
      expect(fallo.status).toBe(401);
    }

    const { rows } = await entorno.piscina.query<{ bloqueado: boolean; intentos_fallidos: number }>(
      'SELECT bloqueado, intentos_fallidos FROM usuario WHERE nombre_usuario = $1', [victima],
    );
    expect(rows[0]!.bloqueado).toBe(true);
    expect(rows[0]!.intentos_fallidos).toBe(5);

    const conLaBuena = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: victima, contrasena: CONTRASENA_DE_PRUEBA });
    expect(conLaBuena.status).toBe(401);
    expect(conLaBuena.body.error.codigo).toBe('CUENTA_BLOQUEADA');
    expect(conLaBuena.body.error.mensaje).toMatch(/bloqueada/i);
  });

  it('reinicia el contador de intentos cuando se acierta', async () => {
    const persona = await usuarioConRol(entorno.piscina, CODIGO_ROL.JEFE_COMPRAS);
    await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: persona, contrasena: 'mal' });
    await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: persona, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);

    const { rows } = await entorno.piscina.query<{ intentos_fallidos: number }>(
      'SELECT intentos_fallidos FROM usuario WHERE nombre_usuario = $1', [persona],
    );
    expect(rows[0]!.intentos_fallidos).toBe(0);
  });

  it('rechaza el cuerpo sin los campos obligatorios, indicando cual falta', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`).send({ nombreUsuario: agente });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(respuesta.body.error.campos.contrasena).toBeTypeOf('string');
  });
});

describe('uso del token de acceso', () => {
  async function tokenDe(nombreUsuario: string): Promise<string> {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
    return respuesta.body.datos.tokenAcceso;
  }

  it('sin token, cualquier ruta privada responde 401', async () => {
    const respuesta = await peticion(entorno.aplicacion).get(`${RAIZ}/autenticacion/yo`);
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.idCorrelacion).toBeTypeOf('string');
  });

  it('con un token manipulado responde 401 y no filtra el detalle tecnico', async () => {
    const token = await tokenDe(agente);
    const manipulado = `${token.slice(0, -4)}abcd`;
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/autenticacion/yo`).set('Authorization', `Bearer ${manipulado}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.mensaje).not.toMatch(/signature|jwt|jose/i);
  });

  it('el token de refresco no sirve como token de acceso', async () => {
    const sesion = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: agente, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);

    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/autenticacion/yo`)
      .set('Authorization', `Bearer ${sesion.body.datos.tokenRefresco}`);
    expect(respuesta.status).toBe(401);
  });

  it('devuelve el perfil con los permisos vigentes', async () => {
    const token = await tokenDe(agente);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/autenticacion/yo`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(respuesta.body.datos.nombreUsuario).toBe(agente);
    expect(Array.isArray(respuesta.body.datos.permisos)).toBe(true);
  });

  it('conserva el identificador de correlacion que envia el cliente', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/autenticacion/yo`).set('X-Id-Correlacion', 'traza-de-prueba-1');
    expect(respuesta.body.error.idCorrelacion).toBe('traza-de-prueba-1');
  });
});

describe('refresco de sesion', () => {
  it('cambia el token de refresco por un par nuevo', async () => {
    const sesion = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: agente, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);

    const refrescada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/refresco`)
      .send({ tokenRefresco: sesion.body.datos.tokenRefresco }).expect(200);

    expect(refrescada.body.datos.tokenAcceso).toBeTypeOf('string');
    expect(refrescada.body.datos.usuario.nombreUsuario).toBe(agente);

    await peticion(entorno.aplicacion)
      .get(`${RAIZ}/autenticacion/yo`)
      .set('Authorization', `Bearer ${refrescada.body.datos.tokenAcceso}`).expect(200);
  });

  it('el token de acceso no sirve para refrescar', async () => {
    const sesion = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: agente, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/refresco`)
      .send({ tokenRefresco: sesion.body.datos.tokenAcceso });
    expect(respuesta.status).toBe(401);
  });

  it('un usuario desactivado no puede refrescar aunque su token siga vigente', async () => {
    const persona = await usuarioConRol(entorno.piscina, CODIGO_ROL.GESTOR_TECNICOS);
    const sesion = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: persona, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);

    await entorno.piscina.query('UPDATE usuario SET activo = false WHERE nombre_usuario = $1', [persona]);
    try {
      const respuesta = await peticion(entorno.aplicacion)
        .post(`${RAIZ}/autenticacion/refresco`)
        .send({ tokenRefresco: sesion.body.datos.tokenRefresco });
      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error.codigo).toBe('CUENTA_NO_VIGENTE');

      // Y el token de acceso que ya tenia tampoco vale.
      await peticion(entorno.aplicacion)
        .get(`${RAIZ}/autenticacion/yo`)
        .set('Authorization', `Bearer ${sesion.body.datos.tokenAcceso}`).expect(401);
    } finally {
      await entorno.piscina.query('UPDATE usuario SET activo = true WHERE nombre_usuario = $1', [persona]);
    }
  });
});

describe('sesion atada a un dispositivo movil', () => {
  it('abre sesion con un dispositivo vinculado y la corta al revocarlo', async () => {
    const { rows } = await entorno.piscina.query<{ nombre_usuario: string; identificador: string; id: string }>(
      `SELECT u.nombre_usuario, d.identificador, d.id
         FROM dispositivo d JOIN usuario u ON u.id = d.id_usuario
        WHERE d.revocado_en IS NULL ORDER BY d.identificador LIMIT 1`,
    );
    const dispositivo = rows[0]!;

    const sesion = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({
        nombreUsuario: dispositivo.nombre_usuario,
        contrasena: CONTRASENA_DE_PRUEBA,
        identificadorDispositivo: dispositivo.identificador,
      }).expect(201);

    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/refresco`)
      .send({ tokenRefresco: sesion.body.datos.tokenRefresco }).expect(200);

    await entorno.piscina.query('UPDATE dispositivo SET revocado_en = now() WHERE id = $1', [dispositivo.id]);
    try {
      const respuesta = await peticion(entorno.aplicacion)
        .post(`${RAIZ}/autenticacion/refresco`)
        .send({ tokenRefresco: sesion.body.datos.tokenRefresco });
      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error.codigo).toBe('DISPOSITIVO_REVOCADO');
    } finally {
      await entorno.piscina.query('UPDATE dispositivo SET revocado_en = NULL WHERE id = $1', [dispositivo.id]);
    }
  });

  it('rechaza un dispositivo que no esta vinculado a ese usuario', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({
        nombreUsuario: agente,
        contrasena: CONTRASENA_DE_PRUEBA,
        identificadorDispositivo: 'TABLETA-QUE-NADIE-VINCULO',
      });
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('DISPOSITIVO_NO_VINCULADO');
  });
});
