/**
 * El cliente de la API es lo que puede romper el trabajo del centro de
 * verdad: pedirle algo mal al servidor, perder una sesion que todavia valia,
 * o tragarse el mensaje que explica por que algo no se puede hacer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClienteApi, ErrorDeApi, consultaDe } from '../src/api/cliente.js';
import { TokensEnMemoria } from '../src/sesion/almacen.js';
import { RedSimulada, sesionDePrueba, usuarioDePrueba } from './apoyo.js';

describe('armado de la consulta', () => {
  it('omite lo que no se indico en vez de mandar vacios', () => {
    // Mandar `estado=` hace que el servidor filtre por cadena vacia.
    expect(consultaDe({ estado: undefined, pagina: 2, texto: '' })).toBe('?pagina=2');
  });

  it('sin parametros no deja una interrogacion suelta', () => {
    expect(consultaDe({})).toBe('');
  });

  it('escapa lo que el usuario escribe', () => {
    expect(consultaDe({ texto: 'Maria & Jose' })).toContain('Maria+%26+Jose');
  });
});

describe('cliente de la API', () => {
  let red: RedSimulada;
  let tokens: TokensEnMemoria;

  beforeEach(() => {
    red = new RedSimulada();
    red.instalar();
    tokens = new TokensEnMemoria();
  });

  it('manda el token de acceso en cada peticion', async () => {
    tokens.guardar(sesionDePrueba(usuarioDePrueba([])));
    const api = new ClienteApi(tokens, () => undefined);
    red.responder(200, { datos: { total: 0 } });

    await api.pedir('/avisos');

    expect(red.llamadas[0]?.autorizacion).toBe('Bearer acceso-1');
  });

  it('muestra el mensaje del servidor tal cual, no un codigo', async () => {
    // El servidor ya escribio para que lo lea una persona; traducirlo a
    // "Error 422" seria deshacer ese trabajo.
    const api = new ClienteApi(tokens, () => undefined);
    red.responder(422, {
      error: {
        codigo: 'EXPEDIENTE_EVIDENCIA_INCOMPLETA',
        mensaje: 'A la orden le falta evidencia obligatoria. Falta: Foto del articulo.',
      },
    });

    await expect(api.pedir('/expedientes/1/estado', { metodo: 'POST' }))
      .rejects.toThrow(/Falta: Foto del articulo/);
  });

  it('renueva la sesion y reintenta sin que el usuario se entere', async () => {
    tokens.guardar(sesionDePrueba(usuarioDePrueba([])));
    const perdida = vi.fn();
    const api = new ClienteApi(tokens, perdida);

    red
      .responder(401, { error: { mensaje: 'Sesion vencida' } })
      .responder(200, { datos: { tokenAcceso: 'acceso-2', tokenRefresco: 'refresco-2', usuario: {} } })
      .responder(200, { datos: { total: 3 } });

    const resultado = await api.pedir<{ total: number }>('/avisos');

    expect(resultado.total).toBe(3);
    expect(perdida).not.toHaveBeenCalled();
    // El reintento va con el token nuevo.
    expect(red.llamadas[2]?.autorizacion).toBe('Bearer acceso-2');
  });

  it('solo cierra sesion cuando el refresco tampoco vale', async () => {
    tokens.guardar(sesionDePrueba(usuarioDePrueba([])));
    const perdida = vi.fn();
    const api = new ClienteApi(tokens, perdida);

    red
      .responder(401, { error: { mensaje: 'Sesion vencida' } })
      .responder(401, { error: { mensaje: 'Refresco vencido' } })
      .responder(401, { error: { mensaje: 'Sesion vencida' } });

    await expect(api.pedir('/avisos')).rejects.toThrow();
    expect(perdida).toHaveBeenCalled();
  });

  it('no entra en bucle de renovacion', async () => {
    tokens.guardar(sesionDePrueba(usuarioDePrueba([])));
    const api = new ClienteApi(tokens, () => undefined);

    red
      .responder(401, { error: { mensaje: 'vencida' } })
      .responder(200, { datos: { tokenAcceso: 'a2', tokenRefresco: 'r2', usuario: {} } })
      .responder(401, { error: { mensaje: 'vencida otra vez' } });

    await expect(api.pedir('/avisos')).rejects.toThrow();
    // Peticion, refresco, reintento. Y se detiene.
    expect(red.llamadas).toHaveLength(3);
  });

  it('un fallo de red se cuenta como fallo de red, no como rechazo del servidor', async () => {
    red.sinRed = true;
    const api = new ClienteApi(tokens, () => undefined);

    await expect(api.pedir('/avisos')).rejects.toMatchObject({
      codigo: 'SIN_CONEXION', estadoHttp: 0,
    });
  });

  it('un listado sin paginacion no revienta la pantalla', async () => {
    const api = new ClienteApi(tokens, () => undefined);
    red.responder(200, { datos: [] });

    const pagina = await api.pedirPagina('/ordenes');

    expect(pagina.datos).toEqual([]);
    expect(pagina.paginacion.totalPaginas).toBe(0);
  });

  it('distingue un 403 de un 401', async () => {
    const api = new ClienteApi(tokens, () => undefined);
    red.responder(403, { error: { codigo: 'SIN_PERMISO', mensaje: 'No autorizado.' } });

    try {
      await api.pedir('/expedientes');
      expect.unreachable('debio fallar');
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorDeApi);
      expect((error as ErrorDeApi).esDePermiso).toBe(true);
      expect((error as ErrorDeApi).esDeSesion).toBe(false);
    }
  });

  it('iniciar sesion guarda los tokens', async () => {
    const api = new ClienteApi(tokens, () => undefined);
    red.responder(201, {
      datos: { tokenAcceso: 'a', tokenRefresco: 'r', usuario: usuarioDePrueba([]) },
    });

    await api.iniciarSesion('jperez', 'clave');

    expect(tokens.acceso()).toBe('a');
    expect(tokens.refresco()).toBe('r');
  });

  it('un ingreso fallido no deja tokens a medias', async () => {
    const api = new ClienteApi(tokens, () => undefined);
    red.responder(401, { error: { mensaje: 'Usuario o contrasena incorrectos.' } });

    await expect(api.iniciarSesion('jperez', 'mala')).rejects.toThrow(/incorrectos/);
    expect(tokens.acceso()).toBeNull();
  });
});
