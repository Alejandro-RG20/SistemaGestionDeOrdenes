/**
 * Autorizacion verificada en el servidor, contra rol_permiso, en cada
 * peticion. Todas estas pruebas llaman a la API directamente por HTTP, sin
 * pasar por ninguna interfaz: ocultar un boton no es control de acceso.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;

async function tokenDe(codigoRol: string): Promise<string> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const respuesta = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return respuesta.body.datos.tokenAcceso;
}

beforeAll(async () => { entorno = await montarApi(); });
afterAll(async () => { await entorno.cerrar(); });

describe('rutas de administracion', () => {
  it('un tecnico de ruta recibe negacion al pedir el listado de usuarios', async () => {
    const token = await tokenDe(CODIGO_ROL.TECNICO_RUTA);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/usuarios`).set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('SIN_PERMISO');
    expect(respuesta.body.datos).toBeUndefined();
  });

  it('un tecnico de ruta tampoco puede crear usuarios ni tocar permisos', async () => {
    const token = await tokenDe(CODIGO_ROL.TECNICO_RUTA);
    const cabecera = { Authorization: `Bearer ${token}` };

    await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios`).set(cabecera)
      .send({ nombreUsuario: 'intruso', nombres: 'Intento de alta', contrasena: 'contrasena-larga', codigoRol: CODIGO_ROL.JEFE_TECNICOS })
      .expect(403);
    await peticion(entorno.aplicacion).get(`${RAIZ}/roles`).set(cabecera).expect(403);
    await peticion(entorno.aplicacion).get(`${RAIZ}/permisos`).set(cabecera).expect(403);
    await peticion(entorno.aplicacion).get(`${RAIZ}/bitacora`).set(cabecera).expect(403);
    await peticion(entorno.aplicacion).get(`${RAIZ}/dispositivos`).set(cabecera).expect(403);
  });

  it('la jefatura de atencion al cliente si administra el sistema', async () => {
    const token = await tokenDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    const cabecera = { Authorization: `Bearer ${token}` };

    await peticion(entorno.aplicacion).get(`${RAIZ}/usuarios`).set(cabecera).expect(200);
    await peticion(entorno.aplicacion).get(`${RAIZ}/roles`).set(cabecera).expect(200);
    await peticion(entorno.aplicacion).get(`${RAIZ}/dispositivos`).set(cabecera).expect(200);
    await peticion(entorno.aplicacion).get(`${RAIZ}/bitacora`).set(cabecera).expect(200);
  });

  it('el bodeguero no administra usuarios pero si entra al sistema', async () => {
    const token = await tokenDe(CODIGO_ROL.BODEGUERO);
    const cabecera = { Authorization: `Bearer ${token}` };
    await peticion(entorno.aplicacion).get(`${RAIZ}/autenticacion/yo`).set(cabecera).expect(200);
    await peticion(entorno.aplicacion).get(`${RAIZ}/usuarios`).set(cabecera).expect(403);
  });
});

describe('los permisos se leen de rol_permiso, no del token', () => {
  it('retirar un permiso surte efecto en la peticion siguiente, sin reabrir sesion', async () => {
    const token = await tokenDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    const cabecera = { Authorization: `Bearer ${token}` };

    await peticion(entorno.aplicacion).get(`${RAIZ}/usuarios`).set(cabecera).expect(200);

    const { rows } = await entorno.piscina.query<{ id_rol: string; id_permiso: string }>(
      `SELECT rp.id_rol, rp.id_permiso
         FROM rol_permiso rp
         JOIN rol r ON r.id = rp.id_rol
         JOIN permiso p ON p.id = rp.id_permiso
        WHERE r.codigo = $1 AND p.codigo = 'seguridad.usuario.gestionar'`,
      [CODIGO_ROL.JEFE_ATENCION_CLIENTE],
    );
    const asignacion = rows[0]!;

    await entorno.piscina.query(
      'DELETE FROM rol_permiso WHERE id_rol = $1 AND id_permiso = $2',
      [asignacion.id_rol, asignacion.id_permiso],
    );
    try {
      // El mismo token, que no cambio, ya no abre la puerta.
      await peticion(entorno.aplicacion).get(`${RAIZ}/usuarios`).set(cabecera).expect(403);
    } finally {
      await entorno.piscina.query(
        'INSERT INTO rol_permiso (id_rol, id_permiso) VALUES ($1, $2)',
        [asignacion.id_rol, asignacion.id_permiso],
      );
    }

    await peticion(entorno.aplicacion).get(`${RAIZ}/usuarios`).set(cabecera).expect(200);
  });
});

describe('forma uniforme de la respuesta', () => {
  it('todo listado llega paginado, y pedir de mas es un error explicito', async () => {
    const token = await tokenDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    const cabecera = { Authorization: `Bearer ${token}` };

    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/usuarios?tamano=10`).set(cabecera).expect(200);
    expect(respuesta.body.datos).toHaveLength(10);
    expect(respuesta.body.paginacion).toMatchObject({ pagina: 1, tamano: 10, total: 37 });
    expect(respuesta.body.paginacion.totalPaginas).toBe(4);

    const excesiva = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/usuarios?tamano=5000`).set(cabecera);
    expect(excesiva.status).toBe(400);
    expect(excesiva.body.error.campos.tamano).toMatch(/maximo/i);
  });

  it('la segunda pagina no repite la primera', async () => {
    const token = await tokenDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    const cabecera = { Authorization: `Bearer ${token}` };

    const primera = await peticion(entorno.aplicacion).get(`${RAIZ}/usuarios?tamano=5&pagina=1`).set(cabecera).expect(200);
    const segunda = await peticion(entorno.aplicacion).get(`${RAIZ}/usuarios?tamano=5&pagina=2`).set(cabecera).expect(200);

    const identificadores = new Set([
      ...primera.body.datos.map((u: { id: string }) => u.id),
      ...segunda.body.datos.map((u: { id: string }) => u.id),
    ]);
    expect(identificadores.size).toBe(10);
  });

  it('una ruta inexistente no revela su inexistencia a quien no tiene sesion', async () => {
    // Sin sesion se responde 401 antes de mirar si la ruta existe: de otro
    // modo, un desconocido podria mapear la API a base de 404 contra 401.
    const anonima = await peticion(entorno.aplicacion).get(`${RAIZ}/inventado`);
    expect(anonima.status).toBe(401);
    expect(anonima.body.error.idCorrelacion).toBeTypeOf('string');

    const token = await tokenDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    const conSesion = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/inventado`).set('Authorization', `Bearer ${token}`);
    expect(conSesion.status).toBe(404);
    expect(conSesion.body.error.codigo).toBe('RUTA_DESCONOCIDA');
  });

  it('un identificador que no es UUID se rechaza sin tocar la base', async () => {
    const token = await tokenDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/usuarios/no-es-un-uuid`).set('Authorization', `Bearer ${token}`);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
  });
});
