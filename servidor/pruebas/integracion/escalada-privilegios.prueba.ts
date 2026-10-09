/**
 * Gestionar usuarios no es ser administrador.
 *
 * La jefatura de atencion al cliente tiene los permisos de gestionar
 * usuarios y roles: da de alta al personal, restablece contrasenas,
 * desbloquea. Estas pruebas fijan lo que NO puede hacer con ellos —volverse
 * administradora, tocar cuentas de administracion, darse permisos— y que
 * el administrador si puede. Todo se comprueba contra la API, no contra
 * botones ocultos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
const MOTIVO = 'Prueba automatizada de escalada de privilegios';
let entorno: EntornoApi;
let jefatura: { Authorization: string };
let administrador: { Authorization: string };
let idJefatura: string;
let idAdministrador: string;

async function iniciar(nombreUsuario: string, contrasena = CONTRASENA_DE_PRUEBA) {
  return peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena });
}

beforeAll(async () => {
  entorno = await montarApi();
  const sesionJefatura = await iniciar(await usuarioConRol(entorno.piscina, CODIGO_ROL.JEFE_ATENCION_CLIENTE));
  jefatura = { Authorization: `Bearer ${sesionJefatura.body.data.tokenAcceso}` };
  idJefatura = sesionJefatura.body.data.usuario.id;
  const sesionAdmin = await iniciar(await usuarioConRol(entorno.piscina, CODIGO_ROL.ADMINISTRADOR));
  administrador = { Authorization: `Bearer ${sesionAdmin.body.data.tokenAcceso}` };
  idAdministrador = sesionAdmin.body.data.usuario.id;
});

afterAll(async () => { await entorno.cerrar(); });

describe('la jefatura no puede volverse administradora', () => {
  it('no crea cuentas de administracion', async () => {
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios`).set(jefatura)
      .send({
        nombreUsuario: 'admin.colado', nombres: 'Administrador Colado',
        contrasena: 'contrasena-larga-1', codigoRol: CODIGO_ROL.ADMINISTRADOR,
      });
    expect(respuesta.status).toBe(403);
    const { rows } = await entorno.piscina.query("SELECT 1 FROM usuario WHERE nombre_usuario = 'admin.colado'");
    expect(rows).toHaveLength(0);
  });

  it('no se cambia su propio rol, ni a administrador ni a otro', async () => {
    const aAdmin = await peticion(entorno.aplicacion).patch(`${RAIZ}/usuarios/${idJefatura}`).set(jefatura)
      .send({ codigoRol: CODIGO_ROL.ADMINISTRADOR });
    expect(aAdmin.status).toBe(403);

    const aOtro = await peticion(entorno.aplicacion).patch(`${RAIZ}/usuarios/${idJefatura}`).set(jefatura)
      .send({ codigoRol: CODIGO_ROL.JEFE_TECNICOS });
    expect(aOtro.status).toBe(422);
    expect(aOtro.body.error.code).toBe('NO_PUEDE_CAMBIAR_SU_ROL');

    // Si puede corregir su propio nombre.
    await peticion(entorno.aplicacion).patch(`${RAIZ}/usuarios/${idJefatura}`).set(jefatura)
      .send({ correo: 'jefatura@servitotal-ejemplo.com' }).expect(200);
  });

  it('no asciende a nadie a administrador', async () => {
    const victima = await usuarioConRol(entorno.piscina, CODIGO_ROL.USUARIO_CONSULTA);
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM usuario WHERE nombre_usuario = $1', [victima],
    );
    const respuesta = await peticion(entorno.aplicacion).patch(`${RAIZ}/usuarios/${rows[0]!.id}`).set(jefatura)
      .send({ codigoRol: CODIGO_ROL.ADMINISTRADOR });
    expect(respuesta.status).toBe(403);
  });

  it('no toca la cuenta del administrador: ni datos, ni contrasena, ni baja', async () => {
    await peticion(entorno.aplicacion).patch(`${RAIZ}/usuarios/${idAdministrador}`).set(jefatura)
      .send({ nombres: 'Nombre Cambiado' }).expect(403);
    await peticion(entorno.aplicacion).put(`${RAIZ}/usuarios/${idAdministrador}/contrasena`).set(jefatura)
      .send({ contrasena: 'contrasena-tomada-1' }).expect(403);
    await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios/${idAdministrador}/desactivar`).set(jefatura)
      .send({ motivo: MOTIVO }).expect(403);

    // La contrasena del administrador sigue siendo la suya.
    expect((await iniciar(await usuarioConRol(entorno.piscina, CODIGO_ROL.ADMINISTRADOR))).status).toBe(201);
  });

  it('no se da permisos editando roles', async () => {
    const roles = await peticion(entorno.aplicacion).get(`${RAIZ}/roles?tamano=50`).set(jefatura).expect(200);
    const rolDe = (codigo: string) => roles.body.data.find((r: { codigo: string }) => r.codigo === codigo);

    // Su propio rol.
    const propios = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/roles/${rolDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE).id}/permisos`).set(jefatura).expect(200);
    const conMas = [...propios.body.data.map((p: { codigo: string }) => p.codigo), 'inventario.ajuste.registrar'];
    await peticion(entorno.aplicacion).put(`${RAIZ}/roles/${rolDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE).id}/permisos`)
      .set(jefatura).send({ codigosPermiso: conMas, motivo: MOTIVO }).expect(403);

    // El del administrador.
    await peticion(entorno.aplicacion).put(`${RAIZ}/roles/${rolDe(CODIGO_ROL.ADMINISTRADOR).id}/permisos`)
      .set(jefatura).send({ codigosPermiso: ['ordenes.consultar'], motivo: MOTIVO }).expect(403);

    // Conceder a otro rol algo que ella no tiene: seria escalar por persona interpuesta.
    const consulta = rolDe(CODIGO_ROL.USUARIO_CONSULTA);
    const previos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/roles/${consulta.id}/permisos`).set(jefatura).expect(200);
    const codigos: string[] = previos.body.data.map((p: { codigo: string }) => p.codigo);
    const respuesta = await peticion(entorno.aplicacion).put(`${RAIZ}/roles/${consulta.id}/permisos`)
      .set(jefatura).send({ codigosPermiso: [...codigos, 'inventario.ajuste.registrar'], motivo: MOTIVO });
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.message).toContain('inventario.ajuste.registrar');

    // Nada cambio.
    const despues = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/roles/${consulta.id}/permisos`).set(jefatura).expect(200);
    expect(despues.body.data).toHaveLength(codigos.length);
  });
});

describe('el administrador si administra', () => {
  it('crea una cuenta de administracion y la puede desactivar y reactivar', async () => {
    const creado = await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios`).set(administrador)
      .send({
        nombreUsuario: 'segundo.admin', nombres: 'Segundo Administrador',
        contrasena: 'contrasena-larga-2', codigoRol: CODIGO_ROL.ADMINISTRADOR,
      }).expect(201);
    const id = creado.body.data.id as string;

    await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios/${id}/desactivar`).set(administrador)
      .send({ motivo: MOTIVO }).expect(204);
    expect((await iniciar('segundo.admin', 'contrasena-larga-2')).status).toBe(401);

    // La jefatura no lo reactiva: es una cuenta de administracion.
    await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios/${id}/activar`).set(jefatura)
      .send({ motivo: MOTIVO }).expect(403);

    const reactivado = await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios/${id}/activar`)
      .set(administrador).send({ motivo: MOTIVO }).expect(200);
    expect(reactivado.body.data.activo).toBe(true);
    expect((await iniciar('segundo.admin', 'contrasena-larga-2')).status).toBe(201);

    const otraVez = await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios/${id}/activar`)
      .set(administrador).send({ motivo: MOTIVO });
    expect(otraVez.status).toBe(422);
    expect(otraVez.body.error.code).toBe('USUARIO_YA_ACTIVO');

    const asientos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/bitacora?tabla=usuario&idRegistro=${id}`).set(administrador).expect(200);
    const campos = asientos.body.data.map((a: { campo: string | null; motivo: string | null }) => [a.campo, a.motivo]);
    expect(campos).toContainEqual(['activo', MOTIVO]);
  });
});

describe('las cuentas que dejan de valer, dejan de valer ya', () => {
  it('un token emitido antes de desactivar la cuenta deja de servir en la siguiente peticion', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios`).set(jefatura)
      .send({
        nombreUsuario: 'baja.inmediata', nombres: 'Baja Inmediata',
        contrasena: 'contrasena-larga-3', codigoRol: CODIGO_ROL.AGENTE_TELEFONIA,
      }).expect(201);
    const sesion = await iniciar('baja.inmediata', 'contrasena-larga-3');
    const suya = { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
    await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes?tamano=1`).set(suya).expect(200);

    await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios/${sesion.body.data.usuario.id}/desactivar`)
      .set(jefatura).send({ motivo: MOTIVO }).expect(204);

    await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes?tamano=1`).set(suya).expect(401);
    await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/refresco`)
      .send({ tokenRefresco: sesion.body.data.tokenRefresco }).expect(401);
  });

  it('un cambio de rol se aplica en la siguiente peticion, sin volver a entrar', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios`).set(jefatura)
      .send({
        nombreUsuario: 'cambia.de.rol', nombres: 'Cambia De Rol',
        contrasena: 'contrasena-larga-4', codigoRol: CODIGO_ROL.AGENTE_TELEFONIA,
      }).expect(201);
    const sesion = await iniciar('cambia.de.rol', 'contrasena-larga-4');
    const suya = { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
    await peticion(entorno.aplicacion).get(`${RAIZ}/clientes?tamano=1`).set(suya).expect(200);

    await peticion(entorno.aplicacion).patch(`${RAIZ}/usuarios/${sesion.body.data.usuario.id}`).set(jefatura)
      .send({ codigoRol: CODIGO_ROL.BODEGUERO }).expect(200);

    // Un bodeguero no crea clientes; el agente telefonico si podia.
    await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(suya)
      .send({ nombres: 'No Deberia', telefono: '86009988' }).expect(403);
  });
});
