/**
 * Clientes: datos vivos que se corrigen en todas partes, salvo lo que la
 * orden congelo al crearse.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
const MOTIVO = 'Prueba automatizada de la etapa 3';
let entorno: EntornoApi;
let cabecera: { Authorization: string };
let cabeceraTecnico: { Authorization: string };

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}

beforeAll(async () => {
  entorno = await montarApi();
  cabecera = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
  cabeceraTecnico = await sesionDe(CODIGO_ROL.TECNICO_RUTA);
});

afterAll(async () => { await entorno.cerrar(); });

describe('busqueda de clientes', () => {
  it('llega paginada y encuentra sin acentos ni mayusculas', async () => {
    const { rows } = await entorno.piscina.query<{ nombres: string }>(
      "SELECT nombres FROM cliente WHERE nombres = 'Jose' LIMIT 1",
    );
    const nombre = rows[0]?.nombres ?? 'Maria';

    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/clientes?texto=${encodeURIComponent(nombre.toUpperCase())}&tamano=5`)
      .set(cabecera).expect(200);

    expect(respuesta.body.data.length).toBeGreaterThan(0);
    expect(respuesta.body.data.length).toBeLessThanOrEqual(5);
    expect(respuesta.body.pagination.total).toBeGreaterThan(0);
  });

  it('busca por telefono exacto', async () => {
    const { rows } = await entorno.piscina.query<{ numero: string; id_cliente: string }>(
      'SELECT numero, id_cliente FROM cliente_telefono WHERE vigente LIMIT 1',
    );
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/clientes?telefono=${rows[0]!.numero}`).set(cabecera).expect(200);

    expect(respuesta.body.data).toHaveLength(1);
    expect(respuesta.body.data[0].id).toBe(rows[0]!.id_cliente);
  });

  it('un tecnico de ruta puede consultar clientes pero no crearlos', async () => {
    await peticion(entorno.aplicacion).get(`${RAIZ}/clientes?tamano=1`).set(cabeceraTecnico).expect(200);
    await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(cabeceraTecnico)
      .send({ nombres: 'Intento', telefono: '88887777' }).expect(403);
  });
});

describe('alta y correccion de clientes', () => {
  let idCliente: string;

  it('crea un cliente con su telefono y su direccion', async () => {
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(cabecera)
      .send({
        nombres: 'Cliente', apellidos: 'De Prueba Etapa Tres',
        telefono: '8 555 4433',
        direccion: { detalle: 'Villa Venezuela, casa 120', referencia: 'Porton azul' },
      }).expect(201);

    idCliente = respuesta.body.data.id;
    // El telefono se normaliza: entra con espacios, se guarda con ocho digitos.
    expect(respuesta.body.data.telefonoVigente).toBe('85554433');
    expect(respuesta.body.data.telefonos).toHaveLength(1);
    expect(respuesta.body.data.direcciones[0].principal).toBe(true);
  });

  it('rechaza un telefono que no tiene ocho digitos', async () => {
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(cabecera)
      .send({ nombres: 'Otro Cliente', telefono: '123' });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.fields.telefono).toMatch(/ocho digitos/);
  });

  it('conserva el telefono anterior al cambiarlo, no lo sobrescribe', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${idCliente}/telefonos`).set(cabecera)
      .send({ numero: '77112233', tipo: 'casa', reemplazaAlVigente: true }).expect(201);

    expect(respuesta.body.data.telefonoVigente).toBe('77112233');
    expect(respuesta.body.data.telefonos).toHaveLength(2);

    const anterior = respuesta.body.data.telefonos.find((t: { numero: string }) => t.numero === '85554433');
    expect(anterior.vigente).toBe(false);
    expect(anterior.hasta).toBeTypeOf('string');
  });

  it('no admite dos veces el mismo telefono vigente', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${idCliente}/telefonos`).set(cabecera)
      .send({ numero: '77112233', reemplazaAlVigente: false });
    expect(respuesta.status).toBe(409);
  });

  it('registra en bitacora la correccion del nombre', async () => {
    await peticion(entorno.aplicacion).patch(`${RAIZ}/clientes/${idCliente}`).set(cabecera)
      .send({ nombres: 'Cliente Corregido' }).expect(200);

    const asientos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/bitacora?tabla=cliente&idRegistro=${idCliente}`).set(cabecera).expect(200);
    const cambio = asientos.body.data.find((a: { campo: string }) => a.campo === 'nombres');
    expect(cambio.valorAnterior).toBe('Cliente');
    expect(cambio.valorNuevo).toBe('Cliente Corregido');
  });
});

describe('los datos congelados de la orden no se mueven', () => {
  it('cambiar la direccion del cliente no altera las ordenes ya programadas', async () => {
    // Prueba 8 del pliego, sobre una orden real de la siembra.
    const { rows } = await entorno.piscina.query<{
      id_cliente: string; id_orden: string; direccion_servicio: string | null;
      telefono_contacto: string; cargo_visita: number; id_zona: string | null;
    }>(
      `SELECT o.id_cliente, o.id AS id_orden, o.direccion_servicio, o.telefono_contacto,
              o.cargo_visita, o.id_zona
         FROM orden_servicio o
        WHERE o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
          AND o.direccion_servicio IS NOT NULL
        LIMIT 1`,
    );
    const antes = rows[0]!;

    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${antes.id_cliente}/direcciones`).set(cabecera)
      .send({
        detalle: 'Se mudo: Reparto Schick, casa 9', referencia: 'Frente al parque', esPrincipal: true,
      }).expect(201);

    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${antes.id_cliente}/telefonos`).set(cabecera)
      .send({ numero: '81234567', reemplazaAlVigente: true }).expect(201);

    const { rows: despues } = await entorno.piscina.query<typeof antes>(
      `SELECT id_cliente, id AS id_orden, direccion_servicio, telefono_contacto, cargo_visita, id_zona
         FROM orden_servicio WHERE id = $1`,
      [antes.id_orden],
    );

    // Lo que la orden copio al crearse queda exactamente igual.
    expect(despues[0]!.direccion_servicio).toBe(antes.direccion_servicio);
    expect(despues[0]!.telefono_contacto).toBe(antes.telefono_contacto);
    expect(Number(despues[0]!.cargo_visita)).toBe(Number(antes.cargo_visita));
    expect(despues[0]!.id_zona).toBe(antes.id_zona);

    // Y la ficha del cliente si muestra los datos nuevos: son datos vivos.
    const ficha = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/clientes/${antes.id_cliente}`).set(cabecera).expect(200);
    expect(ficha.body.data.telefonoVigente).toBe('81234567');
    expect(ficha.body.data.direccionPrincipal).toMatch(/Reparto Schick/);
  });
});

describe('fusion de duplicados', () => {
  it('traslada articulos y ordenes, desactiva el duplicado y no borra nada', async () => {
    const { rows } = await entorno.piscina.query<{ id: string; articulos: string; ordenes: string }>(
      `SELECT c.id,
              (SELECT count(*) FROM articulo WHERE id_cliente = c.id)::text AS articulos,
              (SELECT count(*) FROM orden_servicio WHERE id_cliente = c.id)::text AS ordenes
         FROM cliente c
        WHERE c.activo AND c.id_cliente_principal IS NULL
          AND EXISTS (SELECT 1 FROM articulo WHERE id_cliente = c.id)
        LIMIT 2`,
    );
    const [principal, duplicado] = [rows[0]!, rows[1]!];
    const totalAntes = await entorno.piscina.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM cliente',
    );

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${principal.id}/fusionar`).set(cabecera)
      .send({ idClienteAbsorbido: duplicado.id, motivo: `${MOTIVO}: misma persona con dos fichas` })
      .expect(200);

    expect(respuesta.body.data.articulosTrasladados).toBe(Number(duplicado.articulos));
    expect(respuesta.body.data.ordenesTrasladadas).toBe(Number(duplicado.ordenes));

    // Nada se elimina: la ficha absorbida sigue ahi, desactivada y apuntando.
    const totalDespues = await entorno.piscina.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM cliente',
    );
    expect(totalDespues.rows[0]!.total).toBe(totalAntes.rows[0]!.total);

    const absorbido = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/clientes/${duplicado.id}`).set(cabecera).expect(200);
    expect(absorbido.body.data.activo).toBe(false);
    expect(absorbido.body.data.idClientePrincipal).toBe(principal.id);
    expect(absorbido.body.data.cantidadArticulos).toBe(0);
  });

  it('no fusiona un cliente consigo mismo ni uno ya fusionado', async () => {
    const { rows } = await entorno.piscina.query<{ id: string; id_cliente_principal: string }>(
      'SELECT id, id_cliente_principal FROM cliente WHERE id_cliente_principal IS NOT NULL LIMIT 1',
    );
    const absorbido = rows[0]!;

    const consigoMismo = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${absorbido.id_cliente_principal}/fusionar`).set(cabecera)
      .send({ idClienteAbsorbido: absorbido.id_cliente_principal, motivo: MOTIVO });
    expect(consigoMismo.status).toBe(422);

    const yaFusionado = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${absorbido.id_cliente_principal}/fusionar`).set(cabecera)
      .send({ idClienteAbsorbido: absorbido.id, motivo: MOTIVO });
    expect(yaFusionado.status).toBe(422);
    expect(yaFusionado.body.error.code).toBe('YA_FUSIONADO');
  });

  it('solo la jefatura puede fusionar', async () => {
    const agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
    const { rows } = await entorno.piscina.query<{ id: string }>('SELECT id FROM cliente LIMIT 2');
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${rows[0]!.id}/fusionar`).set(agente)
      .send({ idClienteAbsorbido: rows[1]!.id, motivo: MOTIVO }).expect(403);
  });
});

describe('duplicados al registrar', () => {
  it('rechaza la misma identificacion de un cliente activo y dice cual es', async () => {
    const primero = await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(cabecera)
      .send({ nombres: 'Duplicado', apellidos: 'Por Cedula', identificacion: '001-010190-9999Z', telefono: '86001122' })
      .expect(201);

    const segundo = await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(cabecera)
      .send({ nombres: 'Otro Nombre', identificacion: '001-010190-9999z', telefono: '86001133' });
    expect(segundo.status).toBe(409);
    expect(segundo.body.error.code).toBe('CLIENTE_DUPLICADO');
    expect(segundo.body.error.fields.identificacion).toBe(primero.body.data.id);

    // Confirmar no sirve: la misma identificacion es la misma persona.
    const forzado = await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(cabecera)
      .send({ nombres: 'Otro Nombre', identificacion: '001-010190-9999Z', telefono: '86001133', confirmarDuplicado: true });
    expect(forzado.status).toBe(409);
  });

  it('el mismo telefono vigente exige confirmacion y despues se acepta', async () => {
    const primero = await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(cabecera)
      .send({ nombres: 'Titular', apellidos: 'Del Celular', telefono: '86002244' }).expect(201);

    const sinConfirmar = await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(cabecera)
      .send({ nombres: 'Hija', apellidos: 'Del Titular', telefono: '8600 2244' });
    expect(sinConfirmar.status).toBe(409);
    expect(sinConfirmar.body.error.code).toBe('CLIENTE_POSIBLE_DUPLICADO');
    expect(sinConfirmar.body.error.fields.telefono).toBe(primero.body.data.id);

    await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(cabecera)
      .send({ nombres: 'Hija', apellidos: 'Del Titular', telefono: '86002244', confirmarDuplicado: true })
      .expect(201);
  });
});

describe('desactivar y reactivar', () => {
  let idCliente: string;
  let idArticulo: string;

  beforeAll(async () => {
    const { rows } = await entorno.piscina.query<{ id_cliente: string; id_articulo: string }>(
      `SELECT c.id AS id_cliente, a.id AS id_articulo
         FROM cliente c JOIN articulo a ON a.id_cliente = c.id AND a.activo
        WHERE c.activo AND c.id_cliente_principal IS NULL
          AND EXISTS (SELECT 1 FROM cliente_telefono t WHERE t.id_cliente = c.id AND t.vigente)
        ORDER BY c.creado_en DESC LIMIT 1`,
    );
    idCliente = rows[0]!.id_cliente;
    idArticulo = rows[0]!.id_articulo;
  });

  it('exige motivo y el permiso de supervision', async () => {
    const sinMotivo = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${idCliente}/desactivar`).set(cabecera).send({ motivo: 'corto' });
    expect(sinMotivo.status).toBe(400);

    const agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${idCliente}/desactivar`).set(agente)
      .send({ motivo: `${MOTIVO}: no deberia poder` }).expect(403);
  });

  it('desactiva sin borrar nada, lo saca de la busqueda y le cierra las ordenes nuevas', async () => {
    const antes = await peticion(entorno.aplicacion).get(`${RAIZ}/clientes/${idCliente}`).set(cabecera).expect(200);

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${idCliente}/desactivar`).set(cabecera)
      .send({ motivo: `${MOTIVO}: el cliente pidio no ser contactado` }).expect(200);
    expect(respuesta.body.data.activo).toBe(false);
    expect(respuesta.body.data.cantidadOrdenes).toBe(antes.body.data.cantidadOrdenes);
    expect(respuesta.body.data.cantidadArticulos).toBe(antes.body.data.cantidadArticulos);

    const telefono = antes.body.data.telefonoVigente as string;
    const activos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/clientes?telefono=${telefono}`).set(cabecera).expect(200);
    expect(activos.body.data.map((c: { id: string }) => c.id)).not.toContain(idCliente);
    const todos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/clientes?telefono=${telefono}&soloActivos=false`).set(cabecera).expect(200);
    expect(todos.body.data.map((c: { id: string }) => c.id)).toContain(idCliente);

    const orden = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(cabecera)
      .send({ idCliente, idArticulo, modalidad: 'taller', tipoGarantiaElegida: 'proveedor', fallaReportada: 'No enciende desde ayer por la tarde' });
    expect(orden.status).toBe(400);
    expect(orden.body.error.message).toMatch(/desactivado/);

    const asientos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/bitacora?tabla=cliente&idRegistro=${idCliente}`).set(cabecera).expect(200);
    const baja = asientos.body.data.find((a: { accion: string }) => a.accion === 'desactivar');
    expect(baja.motivo).toMatch(/no ser contactado/);
  });

  it('no desactiva dos veces y se puede reactivar', async () => {
    const otraVez = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${idCliente}/desactivar`).set(cabecera)
      .send({ motivo: `${MOTIVO}: segundo intento` });
    expect(otraVez.status).toBe(422);
    expect(otraVez.body.error.code).toBe('CLIENTE_YA_INACTIVO');

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${idCliente}/activar`).set(cabecera)
      .send({ motivo: `${MOTIVO}: volvio a solicitar servicio` }).expect(200);
    expect(respuesta.body.data.activo).toBe(true);

    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(cabecera)
      .send({ idCliente, idArticulo, modalidad: 'taller', tipoGarantiaElegida: 'proveedor', fallaReportada: 'No enciende desde ayer por la tarde' })
      .expect(201);
  });

  it('una ficha fusionada no se reactiva ni recibe ordenes', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM cliente WHERE id_cliente_principal IS NOT NULL LIMIT 1',
    );
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${rows[0]!.id}/activar`).set(cabecera)
      .send({ motivo: `${MOTIVO}: intento sobre fusionado` });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.code).toBe('YA_FUSIONADO');
  });
});
