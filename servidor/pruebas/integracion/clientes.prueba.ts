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
  return { Authorization: `Bearer ${sesion.body.datos.tokenAcceso}` };
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

    expect(respuesta.body.datos.length).toBeGreaterThan(0);
    expect(respuesta.body.datos.length).toBeLessThanOrEqual(5);
    expect(respuesta.body.paginacion.total).toBeGreaterThan(0);
  });

  it('busca por telefono exacto', async () => {
    const { rows } = await entorno.piscina.query<{ numero: string; id_cliente: string }>(
      'SELECT numero, id_cliente FROM cliente_telefono WHERE vigente LIMIT 1',
    );
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/clientes?telefono=${rows[0]!.numero}`).set(cabecera).expect(200);

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0].id).toBe(rows[0]!.id_cliente);
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

    idCliente = respuesta.body.datos.id;
    // El telefono se normaliza: entra con espacios, se guarda con ocho digitos.
    expect(respuesta.body.datos.telefonoVigente).toBe('85554433');
    expect(respuesta.body.datos.telefonos).toHaveLength(1);
    expect(respuesta.body.datos.direcciones[0].principal).toBe(true);
  });

  it('rechaza un telefono que no tiene ocho digitos', async () => {
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/clientes`).set(cabecera)
      .send({ nombres: 'Otro Cliente', telefono: '123' });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campos.telefono).toMatch(/ocho digitos/);
  });

  it('conserva el telefono anterior al cambiarlo, no lo sobrescribe', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${idCliente}/telefonos`).set(cabecera)
      .send({ numero: '77112233', tipo: 'casa', reemplazaAlVigente: true }).expect(201);

    expect(respuesta.body.datos.telefonoVigente).toBe('77112233');
    expect(respuesta.body.datos.telefonos).toHaveLength(2);

    const anterior = respuesta.body.datos.telefonos.find((t: { numero: string }) => t.numero === '85554433');
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
    const cambio = asientos.body.datos.find((a: { campo: string }) => a.campo === 'nombres');
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
    expect(ficha.body.datos.telefonoVigente).toBe('81234567');
    expect(ficha.body.datos.direccionPrincipal).toMatch(/Reparto Schick/);
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

    expect(respuesta.body.datos.articulosTrasladados).toBe(Number(duplicado.articulos));
    expect(respuesta.body.datos.ordenesTrasladadas).toBe(Number(duplicado.ordenes));

    // Nada se elimina: la ficha absorbida sigue ahi, desactivada y apuntando.
    const totalDespues = await entorno.piscina.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM cliente',
    );
    expect(totalDespues.rows[0]!.total).toBe(totalAntes.rows[0]!.total);

    const absorbido = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/clientes/${duplicado.id}`).set(cabecera).expect(200);
    expect(absorbido.body.datos.activo).toBe(false);
    expect(absorbido.body.datos.idClientePrincipal).toBe(principal.id);
    expect(absorbido.body.datos.cantidadArticulos).toBe(0);
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
    expect(yaFusionado.body.error.codigo).toBe('YA_FUSIONADO');
  });

  it('solo la jefatura puede fusionar', async () => {
    const agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
    const { rows } = await entorno.piscina.query<{ id: string }>('SELECT id FROM cliente LIMIT 2');
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/clientes/${rows[0]!.id}/fusionar`).set(agente)
      .send({ idClienteAbsorbido: rows[1]!.id, motivo: MOTIVO }).expect(403);
  });
});
