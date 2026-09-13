/** Emision y verificacion de JWT, sin tocar la base de datos. */
import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { ErrorAutenticacion } from '../../src/comun/errores.js';
import { TIPO_TOKEN, emitirPar, verificar } from '../../src/comun/tokens.js';

const SECRETO = 'clave-de-pruebas-suficientemente-larga-para-hs256';
const ID_USUARIO = '11111111-1111-4111-8111-111111111111';

beforeAll(() => {
  process.env['JWT_SECRETO'] = SECRETO;
  process.env['JWT_EMISOR'] = 'servitotal';
  process.env['JWT_AUDIENCIA'] = 'servitotal-api';
});

describe('emision', () => {
  it('emite tokens distintos para acceso y refresco', async () => {
    const par = await emitirPar(ID_USUARIO);
    expect(par.tokenAcceso).not.toBe(par.tokenRefresco);
    expect(par.expiraEn).toBeGreaterThan(0);

    expect((await verificar(par.tokenAcceso, TIPO_TOKEN.ACCESO)).idUsuario).toBe(ID_USUARIO);
    expect((await verificar(par.tokenRefresco, TIPO_TOKEN.REFRESCO)).idUsuario).toBe(ID_USUARIO);
  });

  it('conserva el dispositivo cuando la sesion nace en la aplicacion movil', async () => {
    const idDispositivo = '22222222-2222-4222-8222-222222222222';
    const par = await emitirPar(ID_USUARIO, idDispositivo);
    const contenido = await verificar(par.tokenAcceso, TIPO_TOKEN.ACCESO);
    expect(contenido.idDispositivo).toBe(idDispositivo);
  });

  it('no incluye el dispositivo cuando la sesion nace en el panel', async () => {
    const par = await emitirPar(ID_USUARIO);
    expect((await verificar(par.tokenAcceso, TIPO_TOKEN.ACCESO)).idDispositivo).toBeUndefined();
  });
});

describe('verificacion', () => {
  it('no acepta un token de refresco donde se espera uno de acceso', async () => {
    const par = await emitirPar(ID_USUARIO);
    await expect(verificar(par.tokenRefresco, TIPO_TOKEN.ACCESO)).rejects.toBeInstanceOf(ErrorAutenticacion);
    await expect(verificar(par.tokenAcceso, TIPO_TOKEN.REFRESCO)).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('rechaza un token firmado con otra clave', async () => {
    const ajeno = await new SignJWT({ tipo: TIPO_TOKEN.ACCESO })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(ID_USUARIO)
      .setIssuer('servitotal').setAudience('servitotal-api')
      .setIssuedAt().setExpirationTime('15m')
      .sign(new TextEncoder().encode('otra-clave-distinta-igual-de-larga-que-la-real'));

    await expect(verificar(ajeno, TIPO_TOKEN.ACCESO)).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('rechaza un token de otro emisor o para otra audiencia', async () => {
    const clave = new TextEncoder().encode(SECRETO);
    const firmar = (emisor: string, audiencia: string): Promise<string> =>
      new SignJWT({ tipo: TIPO_TOKEN.ACCESO })
        .setProtectedHeader({ alg: 'HS256' }).setSubject(ID_USUARIO)
        .setIssuer(emisor).setAudience(audiencia)
        .setIssuedAt().setExpirationTime('15m').sign(clave);

    await expect(verificar(await firmar('otro-sistema', 'servitotal-api'), TIPO_TOKEN.ACCESO))
      .rejects.toBeInstanceOf(ErrorAutenticacion);
    await expect(verificar(await firmar('servitotal', 'otra-api'), TIPO_TOKEN.ACCESO))
      .rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('rechaza un token vencido con un mensaje que invita a volver a entrar', async () => {
    const vencido = await new SignJWT({ tipo: TIPO_TOKEN.ACCESO })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(ID_USUARIO)
      .setIssuer('servitotal').setAudience('servitotal-api')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7_200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3_600)
      .sign(new TextEncoder().encode(SECRETO));

    await expect(verificar(vencido, TIPO_TOKEN.ACCESO)).rejects.toMatchObject({
      codigo: 'SESION_EXPIRADA',
    });
  });

  it('rechaza basura que no es un token', async () => {
    for (const basura of ['', 'no-es-un-token', 'a.b.c']) {
      await expect(verificar(basura, TIPO_TOKEN.ACCESO)).rejects.toBeInstanceOf(ErrorAutenticacion);
    }
  });
});
