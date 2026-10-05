/**
 * Compras y proveedores.
 *
 * LA REGLA QUE SE PRUEBA AQUI, POR ENCIMA DE TODO: una compra no es
 * mercaderia. Crear un pedido no suma ni una pieza a la existencia; la
 * existencia la mueve bodega cuando abre las cajas y cuenta.
 *
 * Si esto se rompiera, el sistema diria que hay compresores disponibles
 * mientras siguen en un camion, y un tecnico saldria a una casa confiando
 * en una pieza que no existe.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, ESTADO_COMPRA } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;
let compras: { Authorization: string };
let bodega: { Authorization: string };
let tecnico: { Authorization: string };
let idBodegaCentral: string;
let idProveedor: string;
let repuestos: { id: string; precio: number }[];

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}

async function existenciaDe(idRepuesto: string): Promise<number> {
  const { rows } = await entorno.piscina.query<{ cantidad: string }>(
    'SELECT coalesce(cantidad, 0)::text AS cantidad FROM existencia WHERE id_bodega = $1 AND id_repuesto = $2',
    [idBodegaCentral, idRepuesto],
  );
  return Number(rows[0]?.cantidad ?? 0);
}

/** Un pedido de dos lineas, listo para recibir. */
async function compraEnviada(cantidad = 6): Promise<{ id: string; lineas: { id: string }[] }> {
  const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/compras`).set(compras)
    .send({
      idProveedor,
      lineas: repuestos.map((repuesto) => ({
        idRepuesto: repuesto.id, cantidad, precioUnitario: 250,
      })),
    }).expect(201);
  await peticion(entorno.aplicacion)
    .post(`${RAIZ}/compras/${creada.body.data.id}/estado`).set(compras)
    .send({ hacia: ESTADO_COMPRA.ENVIADA }).expect(200);
  return { id: creada.body.data.id, lineas: creada.body.data.detalle };
}

beforeAll(async () => {
  entorno = await montarApi();
  compras = await sesionDe(CODIGO_ROL.JEFE_COMPRAS);
  bodega = await sesionDe(CODIGO_ROL.BODEGUERO);
  tecnico = await sesionDe(CODIGO_ROL.TECNICO_RUTA);

  const central = await entorno.piscina.query<{ id: string }>(
    "SELECT id FROM bodega WHERE tipo = 'central' LIMIT 1",
  );
  idBodegaCentral = central.rows[0]!.id;

  const proveedor = await entorno.piscina.query<{ id: string }>(
    'SELECT id FROM proveedor WHERE activo LIMIT 1',
  );
  idProveedor = proveedor.rows[0]!.id;

  const piezas = await entorno.piscina.query<{ id: string; precio: string }>(
    'SELECT id, precio FROM repuesto WHERE activo ORDER BY codigo LIMIT 2',
  );
  repuestos = piezas.rows.map((fila) => ({ id: fila.id, precio: Number(fila.precio) }));
});

afterAll(async () => { await entorno.cerrar(); });

describe('el pedido no mueve inventario', () => {
  it('crear una compra deja la existencia intacta', async () => {
    const antes = await existenciaDe(repuestos[0]!.id);

    await peticion(entorno.aplicacion).post(`${RAIZ}/compras`).set(compras)
      .send({
        idProveedor,
        lineas: [{ idRepuesto: repuestos[0]!.id, cantidad: 40, precioUnitario: 300 }],
      }).expect(201);

    expect(await existenciaDe(repuestos[0]!.id)).toBe(antes);
  });

  it('el total se calcula en el servidor, no se acepta del cliente', async () => {
    const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/compras`).set(compras)
      .send({
        idProveedor,
        lineas: [
          { idRepuesto: repuestos[0]!.id, cantidad: 3, precioUnitario: 100 },
          { idRepuesto: repuestos[1]!.id, cantidad: 2, precioUnitario: 250 },
        ],
      }).expect(201);
    expect(creada.body.data.total).toBe(800);
  });

  it('un repuesto repetido se explica, no revienta con un error de base', async () => {
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/compras`).set(compras)
      .send({
        idProveedor,
        lineas: [
          { idRepuesto: repuestos[0]!.id, cantidad: 2, precioUnitario: 100 },
          { idRepuesto: repuestos[0]!.id, cantidad: 3, precioUnitario: 100 },
        ],
      }).expect(400);
    expect(respuesta.body.error.message).toMatch(/dos veces/);
  });
});

describe('estados de la compra', () => {
  it('no se recibe lo que nunca se envio', async () => {
    const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/compras`).set(compras)
      .send({
        idProveedor,
        lineas: [{ idRepuesto: repuestos[0]!.id, cantidad: 5, precioUnitario: 100 }],
      }).expect(201);

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/compras/${creada.body.data.id}/recepcion`).set(bodega)
      .send({
        idBodega: idBodegaCentral,
        lineas: [{ idLinea: creada.body.data.detalle[0].id, cantidad: 5 }],
      }).expect(422);
    expect(respuesta.body.error.code).toBe('COMPRA_NO_ADMITE_RECEPCION');
  });

  it('una transicion que el flujo no admite se rechaza', async () => {
    const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/compras`).set(compras)
      .send({
        idProveedor,
        lineas: [{ idRepuesto: repuestos[0]!.id, cantidad: 1, precioUnitario: 100 }],
      }).expect(201);

    // De borrador no se salta a confirmada: el proveedor no ha visto nada.
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/compras/${creada.body.data.id}/estado`).set(compras)
      .send({ hacia: ESTADO_COMPRA.CONFIRMADA }).expect(422);
    expect(respuesta.body.error.code).toBe('TRANSICION_COMPRA_INVALIDA');
  });

  it('cancelar exige motivo escrito', async () => {
    const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/compras`).set(compras)
      .send({
        idProveedor,
        lineas: [{ idRepuesto: repuestos[0]!.id, cantidad: 1, precioUnitario: 100 }],
      }).expect(201);

    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/compras/${creada.body.data.id}/estado`).set(compras)
      .send({ hacia: ESTADO_COMPRA.CANCELADA }).expect(400);

    const cancelada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/compras/${creada.body.data.id}/estado`).set(compras)
      .send({
        hacia: ESTADO_COMPRA.CANCELADA,
        motivoCancelacion: 'El proveedor descontinuo la pieza y no ofrecio equivalente.',
      }).expect(200);
    expect(cancelada.body.data.motivoCancelacion).toMatch(/descontinuo/);
  });
});

describe('la recepcion es lo que mueve el inventario', () => {
  it('recibir suma a la bodega y deja la compra parcial', async () => {
    const antes = await existenciaDe(repuestos[0]!.id);
    const compra = await compraEnviada(6);

    const recibida = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/compras/${compra.id}/recepcion`).set(bodega)
      .send({
        idBodega: idBodegaCentral,
        lineas: compra.lineas.map((linea) => ({ idLinea: linea.id, cantidad: 2 })),
      }).expect(200);

    expect(recibida.body.data.estado).toBe(ESTADO_COMPRA.RECIBIDA_PARCIAL);
    expect(await existenciaDe(repuestos[0]!.id)).toBe(antes + 2);
  });

  /**
   * El estado final lo decide el sistema comparando lo contado con lo
   * pedido, NO la persona: una compra que alguien marca «recibida»
   * teniendo la mitad en el camion es un agujero de inventario.
   */
  it('al completarse lo pedido, la compra pasa a recibida sola', async () => {
    const compra = await compraEnviada(4);
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/compras/${compra.id}/recepcion`).set(bodega)
      .send({
        idBodega: idBodegaCentral,
        lineas: compra.lineas.map((linea) => ({ idLinea: linea.id, cantidad: 4 })),
      }).expect(200);

    const final = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/compras/${compra.id}`).set(compras).expect(200);
    expect(final.body.data.estado).toBe(ESTADO_COMPRA.RECIBIDA);
    expect(final.body.data.recibido).toBe(final.body.data.pedido);
  });

  /**
   * TODO O NADA. Si la segunda linea trae mas de lo pedido, la primera
   * tampoco ingresa. Recibir a medias y dejar la compra en un estado que
   * nadie sabe interpretar es peor que rechazar la operacion completa.
   */
  it('si una linea excede lo pedido, NINGUNA entra', async () => {
    const compra = await compraEnviada(5);
    const antes = await existenciaDe(repuestos[0]!.id);

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/compras/${compra.id}/recepcion`).set(bodega)
      .send({
        idBodega: idBodegaCentral,
        lineas: [
          { idLinea: compra.lineas[0]!.id, cantidad: 2 },
          { idLinea: compra.lineas[1]!.id, cantidad: 99 },
        ],
      }).expect(422);

    expect(respuesta.body.error.code).toBe('RECEPCION_EXCEDIDA');
    // La primera linea no se descontó del camion ni sumó a la bodega.
    expect(await existenciaDe(repuestos[0]!.id)).toBe(antes);

    const sinTocar = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/compras/${compra.id}`).set(compras).expect(200);
    expect(sinTocar.body.data.recibido).toBe(0);
    expect(sinTocar.body.data.estado).toBe(ESTADO_COMPRA.ENVIADA);
  });

  it('la recepcion queda como movimiento de inventario con su responsable', async () => {
    const compra = await compraEnviada(3);
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/compras/${compra.id}/recepcion`).set(bodega)
      .send({
        idBodega: idBodegaCentral,
        lineas: [{ idLinea: compra.lineas[0]!.id, cantidad: 3 }],
      }).expect(200);

    const { rows } = await entorno.piscina.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM movimiento_repuesto
        WHERE tipo = 'ingreso' AND justificacion = $1`,
      [`Recepcion de la compra ${compra.id}`],
    );
    expect(Number(rows[0]!.total)).toBe(1);
  });
});

describe('quien pide no es quien recibe', () => {
  it('el jefe de compras no registra la recepcion fisica', async () => {
    const compra = await compraEnviada(2);
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/compras/${compra.id}/recepcion`).set(compras)
      .send({
        idBodega: idBodegaCentral,
        lineas: [{ idLinea: compra.lineas[0]!.id, cantidad: 2 }],
      }).expect(403);
  });

  it('bodega no arma pedidos al proveedor', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/compras`).set(bodega)
      .send({
        idProveedor,
        lineas: [{ idRepuesto: repuestos[0]!.id, cantidad: 1, precioUnitario: 100 }],
      }).expect(403);
  });

  it('un tecnico no ve compras', async () => {
    await peticion(entorno.aplicacion).get(`${RAIZ}/compras`).set(tecnico).expect(403);
  });
});

describe('proveedores', () => {
  it('se desactivan, no se borran: las compras viejas siguen apuntando ahi', async () => {
    const creado = await peticion(entorno.aplicacion).post(`${RAIZ}/proveedores`).set(compras)
      .send({
        codigo: `PRV-T${Date.now() % 100000}`,
        nombre: 'Proveedor temporal de prueba',
        atiendeGarantias: false,
      }).expect(201);

    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/proveedores/${creado.body.data.id}/desactivar`).set(compras).expect(200);

    const activos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/proveedores?soloActivos=true`).set(compras).expect(200);
    expect(activos.body.data.map((p: { id: string }) => p.id))
      .not.toContain(creado.body.data.id);

    // Pero sigue existiendo.
    const todos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/proveedores`).set(compras).expect(200);
    expect(todos.body.data.map((p: { id: string }) => p.id))
      .toContain(creado.body.data.id);
  });
});
