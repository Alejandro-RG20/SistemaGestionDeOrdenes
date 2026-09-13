/**
 * Gestion de usuarios, permisos y dispositivos. Comprueba sobre todo dos
 * reglas: nada se elimina, y todo cambio deja asiento en la bitacora.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
const MOTIVO = 'Prueba automatizada de la etapa 2';
let entorno: EntornoApi;
let cabecera: { Authorization: string };
let idJefatura: string;

beforeAll(async () => {
  entorno = await montarApi();
  const nombreUsuario = await usuarioConRol(entorno.piscina, CODIGO_ROL.JEFE_ATENCION_CLIENTE);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  cabecera = { Authorization: `Bearer ${sesion.body.datos.tokenAcceso}` };
  idJefatura = sesion.body.datos.usuario.id;
});

afterAll(async () => { await entorno.cerrar(); });

describe('alta y mantenimiento de usuarios', () => {
  it('crea un usuario, lo deja iniciar sesion y anota el alta en la bitacora', async () => {
    const creado = await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios`).set(cabecera)
      .send({
        nombreUsuario: 'nueva.agente',
        nombres: 'Nueva Agente De Prueba',
        contrasena: 'contrasena-de-prueba-1',
        codigoRol: CODIGO_ROL.AGENTE_TELEFONIA,
        correo: 'nueva.agente@servitotal-ejemplo.com',
      }).expect(201);

    expect(creado.body.datos.nombreUsuario).toBe('nueva.agente');
    expect(creado.body.datos.activo).toBe(true);

    await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: 'nueva.agente', contrasena: 'contrasena-de-prueba-1' }).expect(201);

    const asientos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/bitacora?tabla=usuario&idRegistro=${creado.body.datos.id}`).set(cabecera).expect(200);
    expect(asientos.body.datos.some((a: { accion: string }) => a.accion === 'crear')).toBe(true);
  });

  it('rechaza un nombre de usuario repetido con un mensaje que se entiende', async () => {
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios`).set(cabecera)
      .send({
        nombreUsuario: 'nueva.agente', nombres: 'Otra Persona Distinta',
        contrasena: 'contrasena-de-prueba-2', codigoRol: CODIGO_ROL.AGENTE_TELEFONIA,
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toContain('nueva.agente');
    expect(respuesta.body.error.mensaje).not.toMatch(/constraint|duplicate key|23505/i);
  });

  it('rechaza una contrasena corta y un rol inexistente', async () => {
    const corta = await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios`).set(cabecera)
      .send({ nombreUsuario: 'otra.persona', nombres: 'Otra Persona', contrasena: 'corta', codigoRol: CODIGO_ROL.BODEGUERO });
    expect(corta.status).toBe(400);
    expect(corta.body.error.campos.contrasena).toMatch(/10 caracteres/);

    const rolMalo = await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios`).set(cabecera)
      .send({ nombreUsuario: 'otra.persona', nombres: 'Otra Persona', contrasena: 'contrasena-larga-1', codigoRol: 'jefe_supremo' });
    expect(rolMalo.status).toBe(400);
  });

  it('cambia el rol y deja constancia del valor anterior y del nuevo', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      "SELECT id FROM usuario WHERE nombre_usuario = 'nueva.agente'",
    );
    const id = rows[0]!.id;

    await peticion(entorno.aplicacion).patch(`${RAIZ}/usuarios/${id}`).set(cabecera)
      .send({ codigoRol: CODIGO_ROL.GESTOR_COBROS }).expect(200);

    const asientos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/bitacora?tabla=usuario&idRegistro=${id}`).set(cabecera).expect(200);
    const cambioDeRol = asientos.body.datos.find((a: { campo: string }) => a.campo === 'rol');
    expect(cambioDeRol.valorAnterior).toBe(CODIGO_ROL.AGENTE_TELEFONIA);
    expect(cambioDeRol.valorNuevo).toBe(CODIGO_ROL.GESTOR_COBROS);
  });

  it('desbloquea una cuenta bloqueada, exigiendo motivo escrito', async () => {
    const victima = await usuarioConRol(entorno.piscina, CODIGO_ROL.TECNICO_PLANTA);
    for (let i = 0; i < 5; i += 1) {
      await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
        .send({ nombreUsuario: victima, contrasena: 'mal' }).expect(401);
    }
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM usuario WHERE nombre_usuario = $1', [victima],
    );
    const id = rows[0]!.id;

    const sinMotivo = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/usuarios/${id}/desbloquear`).set(cabecera).send({ motivo: 'corto' });
    expect(sinMotivo.status).toBe(400);

    await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios/${id}/desbloquear`)
      .set(cabecera).send({ motivo: 'La persona olvido su contrasena y se verifico su identidad' }).expect(204);

    await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: victima, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  });

  it('desactiva en lugar de eliminar: la fila sigue ahi', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      "SELECT id FROM usuario WHERE nombre_usuario = 'nueva.agente'",
    );
    const id = rows[0]!.id;
    const antes = await entorno.piscina.query('SELECT count(*)::int AS total FROM usuario');

    await peticion(entorno.aplicacion).post(`${RAIZ}/usuarios/${id}/desactivar`)
      .set(cabecera).send({ motivo: MOTIVO }).expect(204);

    const despues = await entorno.piscina.query<{ total: number }>('SELECT count(*)::int AS total FROM usuario');
    expect(despues.rows[0]!.total).toBe(antes.rows[0]!.total);

    const { rows: estado } = await entorno.piscina.query<{ activo: boolean }>(
      'SELECT activo FROM usuario WHERE id = $1', [id],
    );
    expect(estado[0]!.activo).toBe(false);

    // Y ya no puede iniciar sesion.
    await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: 'nueva.agente', contrasena: 'contrasena-de-prueba-1' }).expect(401);
  });

  it('nadie puede desactivar su propia cuenta', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/usuarios/${idJefatura}/desactivar`).set(cabecera).send({ motivo: MOTIVO });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe('NO_PUEDE_DESACTIVARSE');
  });

  it('responde 404 por un usuario que no existe', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/usuarios/00000000-0000-4000-8000-000000000000`).set(cabecera);
    expect(respuesta.status).toBe(404);
  });
});

describe('permisos de un rol', () => {
  it('reemplaza el conjunto de permisos y registra altas y bajas por separado', async () => {
    const roles = await peticion(entorno.aplicacion).get(`${RAIZ}/roles?tamano=50`).set(cabecera).expect(200);
    const bodeguero = roles.body.datos.find((r: { codigo: string }) => r.codigo === CODIGO_ROL.BODEGUERO);

    const previos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/roles/${bodeguero.id}/permisos`).set(cabecera).expect(200);
    const codigosPrevios: string[] = previos.body.datos.map((p: { codigo: string }) => p.codigo);

    const nuevos = [...codigosPrevios.filter((c) => c !== 'inventario.ajuste.registrar'), 'agenda.consultar'];
    await peticion(entorno.aplicacion).put(`${RAIZ}/roles/${bodeguero.id}/permisos`).set(cabecera)
      .send({ codigosPermiso: nuevos, motivo: 'Reorganizacion de funciones de bodega' }).expect(200);

    const asientos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/bitacora?tabla=rol_permiso&idRegistro=${bodeguero.id}`).set(cabecera).expect(200);
    const baja = asientos.body.datos.find((a: { valorAnterior: string }) => a.valorAnterior === 'inventario.ajuste.registrar');
    const alta = asientos.body.datos.find((a: { valorNuevo: string }) => a.valorNuevo === 'agenda.consultar');
    expect(baja.motivo).toBe('Reorganizacion de funciones de bodega');
    expect(alta.motivo).toBe('Reorganizacion de funciones de bodega');

    // Se restituye el estado para no dejar el juego de datos alterado.
    await peticion(entorno.aplicacion).put(`${RAIZ}/roles/${bodeguero.id}/permisos`).set(cabecera)
      .send({ codigosPermiso: codigosPrevios, motivo: 'Restitucion tras la prueba automatizada' }).expect(200);
  });

  it('rechaza permisos que no estan en el catalogo, nombrandolos', async () => {
    const roles = await peticion(entorno.aplicacion).get(`${RAIZ}/roles?tamano=50`).set(cabecera).expect(200);
    const rol = roles.body.datos[0];

    const respuesta = await peticion(entorno.aplicacion)
      .put(`${RAIZ}/roles/${rol.id}/permisos`).set(cabecera)
      .send({ codigosPermiso: ['ordenes.consultar', 'poder.absoluto'], motivo: MOTIVO });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.mensaje).toContain('poder.absoluto');
  });

  it('exige motivo escrito para tocar permisos', async () => {
    const roles = await peticion(entorno.aplicacion).get(`${RAIZ}/roles?tamano=50`).set(cabecera).expect(200);
    const respuesta = await peticion(entorno.aplicacion)
      .put(`${RAIZ}/roles/${roles.body.datos[0].id}/permisos`).set(cabecera)
      .send({ codigosPermiso: [] });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campos.motivo).toBeTypeOf('string');
  });
});

describe('dispositivos moviles', () => {
  it('vincula un dispositivo y lo revoca, dejando rastro', async () => {
    const tecnico = await usuarioConRol(entorno.piscina, CODIGO_ROL.TECNICO_RUTA);
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM usuario WHERE nombre_usuario = $1', [tecnico],
    );

    const vinculado = await peticion(entorno.aplicacion).post(`${RAIZ}/dispositivos`).set(cabecera)
      .send({ idUsuario: rows[0]!.id, identificador: 'SRVT-MOV-PRUEBA', modelo: 'Tableta de prueba' })
      .expect(201);
    expect(vinculado.body.datos.revocadoEn).toBeNull();

    const repetido = await peticion(entorno.aplicacion).post(`${RAIZ}/dispositivos`).set(cabecera)
      .send({ idUsuario: rows[0]!.id, identificador: 'SRVT-MOV-PRUEBA' });
    expect(repetido.status).toBe(409);

    const revocado = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/dispositivos/${vinculado.body.datos.id}/revocar`).set(cabecera)
      .send({ motivo: 'La tableta se extravio en ruta' }).expect(200);
    expect(revocado.body.datos.revocadoEn).toBeTypeOf('string');

    // Revocar dos veces no es un error silencioso: se avisa.
    const otraVez = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/dispositivos/${vinculado.body.datos.id}/revocar`).set(cabecera)
      .send({ motivo: 'La tableta se extravio en ruta' });
    expect(otraVez.status).toBe(422);

    const asientos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/bitacora?tabla=dispositivo&idRegistro=${vinculado.body.datos.id}`).set(cabecera).expect(200);
    expect(asientos.body.datos).toHaveLength(2);
  });

  it('no vincula dispositivos a una cuenta desactivada', async () => {
    const persona = await usuarioConRol(entorno.piscina, CODIGO_ROL.GESTOR_TECNICOS);
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM usuario WHERE nombre_usuario = $1', [persona],
    );
    await entorno.piscina.query('UPDATE usuario SET activo = false WHERE id = $1', [rows[0]!.id]);
    try {
      const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/dispositivos`).set(cabecera)
        .send({ idUsuario: rows[0]!.id, identificador: 'SRVT-MOV-INACTIVA' });
      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.codigo).toBe('USUARIO_INACTIVO');
    } finally {
      await entorno.piscina.query('UPDATE usuario SET activo = true WHERE id = $1', [rows[0]!.id]);
    }
  });
});
