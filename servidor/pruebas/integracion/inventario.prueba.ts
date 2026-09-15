/**
 * Inventario contra la base real.
 *
 * Lo que mas importa aqui: que la existencia sea siempre una proyeccion fiel
 * de los movimientos, y que un consumo que no alcanza no descuente nada.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, MODALIDAD_SERVICIO, TIPO_MOVIMIENTO } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;
let bodeguero: { Authorization: string };
let agente: { Authorization: string };
let tecnicoPlanta: { Authorization: string };
let idCentral = '';
let idMovil = '';

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.datos.tokenAcceso}` };
}

/** Repuesto recien creado, para no pelear con las existencias de la siembra. */
let contadorRepuesto = 0;
async function repuestoNuevo(precio = 500): Promise<string> {
  contadorRepuesto += 1;
  const { rows } = await entorno.piscina.query<{ id: string }>(
    `INSERT INTO repuesto (codigo, descripcion, unidad_medida, precio, stock_minimo, via_abastecimiento)
     VALUES ($1, $2, 'u', $3, 2, 'compra_local') RETURNING id`,
    [`PRB-${String(contadorRepuesto).padStart(5, '0')}`,
      `Repuesto de prueba numero ${contadorRepuesto}`, precio],
  );
  return rows[0]!.id;
}

async function existenciaDe(idBodega: string, idRepuesto: string): Promise<number> {
  const { rows } = await entorno.piscina.query<{ cantidad: number }>(
    'SELECT cantidad FROM existencia WHERE id_bodega = $1 AND id_repuesto = $2',
    [idBodega, idRepuesto],
  );
  return rows[0]?.cantidad ?? 0;
}

function movimiento(cabecera: { Authorization: string }, cuerpo: Record<string, unknown>) {
  return peticion(entorno.aplicacion).post(`${RAIZ}/movimientos`).set(cabecera).send(cuerpo);
}

async function ingresar(idRepuesto: string, cantidad: number): Promise<void> {
  await movimiento(bodeguero, {
    idRepuesto, tipo: TIPO_MOVIMIENTO.INGRESO, idBodegaDestino: idCentral, cantidad,
  }).expect(201);
}

/** Orden abierta y asignada a un tecnico de planta, lista para consumir. */
async function ordenAbierta(): Promise<string> {
  const { rows } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
    `SELECT a.id_cliente, a.id FROM articulo a
       JOIN cliente c ON c.id = a.id_cliente
      WHERE c.activo AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
      LIMIT 1`,
  );
  const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
    .send({
      idCliente: rows[0]!.id_cliente, idArticulo: rows[0]!.id,
      modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'No enfria, para prueba de inventario',
    }).expect(201);
  return creada.body.datos.id;
}

beforeAll(async () => {
  entorno = await montarApi();
  bodeguero = await sesionDe(CODIGO_ROL.BODEGUERO);
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
  tecnicoPlanta = await sesionDe(CODIGO_ROL.TECNICO_PLANTA);

  const bodegas = await peticion(entorno.aplicacion).get(`${RAIZ}/bodegas`).set(bodeguero).expect(200);
  idCentral = bodegas.body.datos.find(
    (b: { tipo: string; nombre: string }) => b.tipo === 'central' && b.nombre === 'Bodega central',
  ).id;
  idMovil = bodegas.body.datos.find((b: { tipo: string }) => b.tipo === 'movil').id;
});

afterAll(async () => { await entorno.cerrar(); });

describe('movimientos y proyeccion', () => {
  it('un ingreso suma a la central y devuelve la existencia resultante', async () => {
    const idRepuesto = await repuestoNuevo();
    const respuesta = await movimiento(bodeguero, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.INGRESO, idBodegaDestino: idCentral, cantidad: 12,
    }).expect(201);

    expect(respuesta.body.datos.movimiento.cantidad).toBe(12);
    expect(respuesta.body.datos.existencias[0].cantidad).toBe(12);
    expect(await existenciaDe(idCentral, idRepuesto)).toBe(12);
  });

  it('congela el precio del repuesto en el momento del movimiento', async () => {
    const idRepuesto = await repuestoNuevo(750);
    const respuesta = await movimiento(bodeguero, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.INGRESO, idBodegaDestino: idCentral, cantidad: 3,
    }).expect(201);
    expect(respuesta.body.datos.movimiento.precioUnitario).toBe(750);

    // Aunque el catalogo cambie despues, el movimiento conserva su precio.
    await entorno.piscina.query('UPDATE repuesto SET precio = 999 WHERE id = $1', [idRepuesto]);
    const movimientos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/movimientos?idRepuesto=${idRepuesto}`).set(bodeguero).expect(200);
    expect(movimientos.body.datos[0].precioUnitario).toBe(750);
  });

  it('un despacho no crea ni destruye unidades: las mueve', async () => {
    const idRepuesto = await repuestoNuevo();
    await ingresar(idRepuesto, 10);

    await movimiento(bodeguero, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.DESPACHO_A_MOVIL,
      idBodegaOrigen: idCentral, idBodegaDestino: idMovil, cantidad: 4,
    }).expect(201);

    expect(await existenciaDe(idCentral, idRepuesto)).toBe(6);
    expect(await existenciaDe(idMovil, idRepuesto)).toBe(4);
  });

  it('no se despacha mas de lo que hay, y el mensaje dice cuanto hay', async () => {
    const idRepuesto = await repuestoNuevo();
    await ingresar(idRepuesto, 2);

    const respuesta = await movimiento(bodeguero, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.DESPACHO_A_MOVIL,
      idBodegaOrigen: idCentral, idBodegaDestino: idMovil, cantidad: 5,
    });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe('EXISTENCIA_INSUFICIENTE');
    expect(respuesta.body.error.mensaje).toMatch(/se piden 5 y hay 2/);
    expect(await existenciaDe(idCentral, idRepuesto)).toBe(2);
  });

  it('un movimiento no se edita: se corrige con un ajuste justificado', async () => {
    const idRepuesto = await repuestoNuevo();
    await ingresar(idRepuesto, 5);

    const sinJustificar = await movimiento(bodeguero, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.AJUSTE, idBodegaDestino: idCentral, cantidad: 2,
    });
    expect(sinJustificar.status).toBe(400);
    expect(sinJustificar.body.error.campos.justificacion).toMatch(/ajuste justificado/);

    await movimiento(bodeguero, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.AJUSTE, idBodegaDestino: idCentral, cantidad: 2,
      justificacion: 'Conteo fisico: se encontraron dos unidades no registradas',
    }).expect(201);
    expect(await existenciaDe(idCentral, idRepuesto)).toBe(7);

    // Y un ajuste que resta lleva la bodega en origen.
    await movimiento(bodeguero, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.AJUSTE, idBodegaOrigen: idCentral, cantidad: 3,
      justificacion: 'Conteo fisico: faltante detectado en el inventario trimestral',
    }).expect(201);
    expect(await existenciaDe(idCentral, idRepuesto)).toBe(4);
  });

  it('la existencia se puede reconstruir desde los movimientos, en cualquier momento', async () => {
    const { rows } = await entorno.piscina.query<{ diferencias: string }>(`
      WITH proyeccion AS (
        SELECT id_bodega, id_repuesto, sum(delta)::int AS cantidad FROM (
          SELECT id_bodega_destino AS id_bodega, id_repuesto,  cantidad AS delta
            FROM movimiento_repuesto WHERE id_bodega_destino IS NOT NULL
          UNION ALL
          SELECT id_bodega_origen  AS id_bodega, id_repuesto, -cantidad AS delta
            FROM movimiento_repuesto WHERE id_bodega_origen IS NOT NULL) AS s
        GROUP BY 1, 2)
      SELECT count(*)::text AS diferencias FROM proyeccion p
        FULL JOIN existencia e USING (id_bodega, id_repuesto)
       WHERE p.cantidad IS DISTINCT FROM e.cantidad`);
    expect(Number(rows[0]!.diferencias)).toBe(0);
  });
});

describe('la bodega movil no tiene concurrencia; la central si', () => {
  it('la central no se descuenta sin conexion', async () => {
    const idRepuesto = await repuestoNuevo();
    await ingresar(idRepuesto, 5);
    const idOrden = await ordenAbierta();

    const respuesta = await movimiento(tecnicoPlanta, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.CONSUMO, idBodegaOrigen: idCentral,
      cantidad: 1, idOrden, registradoSinConexion: true,
    });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.mensaje).toMatch(/solo se descuenta en linea/);
    expect(await existenciaDe(idCentral, idRepuesto)).toBe(5);
  });

  it('la bodega movil si, que es para lo que existe', async () => {
    const idRepuesto = await repuestoNuevo();
    await ingresar(idRepuesto, 5);
    await movimiento(bodeguero, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.DESPACHO_A_MOVIL,
      idBodegaOrigen: idCentral, idBodegaDestino: idMovil, cantidad: 3,
    }).expect(201);

    const idOrden = await ordenAbierta();
    const tecnicoRuta = await sesionDe(CODIGO_ROL.TECNICO_RUTA);
    await movimiento(tecnicoRuta, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.CONSUMO, idBodegaOrigen: idMovil,
      cantidad: 2, idOrden, registradoSinConexion: true,
      momentoDispositivo: new Date(Date.now() - 3_600_000).toISOString(),
    }).expect(201);

    expect(await existenciaDe(idMovil, idRepuesto)).toBe(1);
  });

  it('cada bodega movil pertenece a un solo tecnico', async () => {
    const bodegas = await peticion(entorno.aplicacion).get(`${RAIZ}/bodegas`).set(bodeguero).expect(200);
    const moviles = bodegas.body.datos.filter((b: { tipo: string }) => b.tipo === 'movil');
    expect(moviles.length).toBeGreaterThan(0);
    for (const bodega of moviles) expect(bodega.idTecnico).toBeTypeOf('string');
    expect(new Set(moviles.map((b: { idTecnico: string }) => b.idTecnico)).size).toBe(moviles.length);
  });
});

describe('todo consumo va atado a su orden', () => {
  it('un consumo sin orden se rechaza', async () => {
    const idRepuesto = await repuestoNuevo();
    await ingresar(idRepuesto, 5);

    const respuesta = await movimiento(tecnicoPlanta, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.CONSUMO, idBodegaOrigen: idCentral, cantidad: 1,
    });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campos.idOrden).toMatch(/atado a la orden/);
  });

  it('el consumo queda consultable desde la orden', async () => {
    const idRepuesto = await repuestoNuevo();
    await ingresar(idRepuesto, 5);
    const idOrden = await ordenAbierta();

    await movimiento(tecnicoPlanta, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.CONSUMO, idBodegaOrigen: idCentral, cantidad: 2, idOrden,
    }).expect(201);

    const movimientos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/movimientos?idOrden=${idOrden}`).set(bodeguero).expect(200);
    expect(movimientos.body.datos).toHaveLength(1);
    expect(movimientos.body.datos[0].numeroOrden).toBeTypeOf('number');
  });

  it('no se cargan repuestos a una orden cerrada', async () => {
    const idRepuesto = await repuestoNuevo();
    await ingresar(idRepuesto, 5);
    const idOrden = await ordenAbierta();
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${idOrden}/estado`).set(jefatura)
      .send({ hacia: 'anulada', motivo: 'Anulada para la prueba de inventario' }).expect(200);

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${idOrden}/consumos`).set(tecnicoPlanta)
      .send({ consumos: [{ idRepuesto, cantidad: 1, idBodegaOrigen: idCentral }] });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe('ORDEN_CERRADA');
    expect(await existenciaDe(idCentral, idRepuesto)).toBe(5);
  });
});

describe('consumo en lote: todo o nada', () => {
  it('con inventario insuficiente revierte completo y no descuenta nada', async () => {
    // Prueba 1 del pliego.
    const alcanza = await repuestoNuevo();
    const tambienAlcanza = await repuestoNuevo();
    const noAlcanza = await repuestoNuevo();
    await ingresar(alcanza, 10);
    await ingresar(tambienAlcanza, 10);
    await ingresar(noAlcanza, 1);

    const idOrden = await ordenAbierta();

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${idOrden}/consumos`).set(tecnicoPlanta)
      .send({
        consumos: [
          { idRepuesto: alcanza, cantidad: 3, idBodegaOrigen: idCentral },
          { idRepuesto: tambienAlcanza, cantidad: 2, idBodegaOrigen: idCentral },
          { idRepuesto: noAlcanza, cantidad: 5, idBodegaOrigen: idCentral },
        ],
      });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe('EXISTENCIA_INSUFICIENTE');

    // Ni el primero ni el segundo se descontaron.
    expect(await existenciaDe(idCentral, alcanza)).toBe(10);
    expect(await existenciaDe(idCentral, tambienAlcanza)).toBe(10);
    expect(await existenciaDe(idCentral, noAlcanza)).toBe(1);

    // Y no quedo ningun movimiento suelto.
    const { rows } = await entorno.piscina.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM movimiento_repuesto WHERE id_orden = $1', [idOrden],
    );
    expect(Number(rows[0]!.total)).toBe(0);
  });

  it('cuando todo alcanza, se descuenta todo junto', async () => {
    const uno = await repuestoNuevo();
    const otro = await repuestoNuevo();
    await ingresar(uno, 10);
    await ingresar(otro, 10);
    const idOrden = await ordenAbierta();

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${idOrden}/consumos`).set(tecnicoPlanta)
      .send({
        consumos: [
          { idRepuesto: uno, cantidad: 3, idBodegaOrigen: idCentral },
          { idRepuesto: otro, cantidad: 4, idBodegaOrigen: idCentral },
        ],
      }).expect(201);

    expect(respuesta.body.datos).toHaveLength(2);
    expect(await existenciaDe(idCentral, uno)).toBe(7);
    expect(await existenciaDe(idCentral, otro)).toBe(6);
  });
});

describe('liberacion automatica al ingresar el repuesto', () => {
  it('las ordenes que lo esperaban se liberan solas y queda constancia', async () => {
    const idRepuesto = await repuestoNuevo();
    const primera = await ordenAbierta();
    const segunda = await ordenAbierta();
    const jefeCompras = await sesionDe(CODIGO_ROL.JEFE_COMPRAS);

    for (const idOrden of [primera, segunda]) {
      await peticion(entorno.aplicacion)
        .post(`${RAIZ}/ordenes/${idOrden}/solicitudes-repuesto`).set(jefeCompras)
        .send({ idRepuesto, cantidad: 1, fechaEstimada: '2026-10-01' }).expect(201);
    }

    const pendientes = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/solicitudes-repuesto?idRepuesto=${idRepuesto}&soloPendientes=true`)
      .set(bodeguero).expect(200);
    expect(pendientes.body.datos).toHaveLength(2);

    const ingreso = await movimiento(bodeguero, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.INGRESO, idBodegaDestino: idCentral, cantidad: 2,
    }).expect(201);

    expect(ingreso.body.datos.ordenesLiberadas).toHaveLength(2);
    const numeros = ingreso.body.datos.ordenesLiberadas.map((o: { numeroOrden: number }) => o.numeroOrden);
    expect(new Set(numeros).size).toBe(2);

    // Ya no quedan pendientes.
    const despues = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/solicitudes-repuesto?idRepuesto=${idRepuesto}&soloPendientes=true`)
      .set(bodeguero).expect(200);
    expect(despues.body.datos).toHaveLength(0);

    // Y cada orden tiene el aviso en su bitacora.
    const ficha = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${primera}`).set(agente).expect(200);
    expect(ficha.body.datos.eventos.at(-1).observacion).toMatch(/Ingreso el repuesto que la orden esperaba/);
  });

  it('si la cantidad no alcanza para todas, libera por orden de llegada', async () => {
    const idRepuesto = await repuestoNuevo();
    const primera = await ordenAbierta();
    const segunda = await ordenAbierta();
    const jefeCompras = await sesionDe(CODIGO_ROL.JEFE_COMPRAS);

    for (const idOrden of [primera, segunda]) {
      await peticion(entorno.aplicacion)
        .post(`${RAIZ}/ordenes/${idOrden}/solicitudes-repuesto`).set(jefeCompras)
        .send({ idRepuesto, cantidad: 2 }).expect(201);
    }

    // Entran 2: alcanza para una sola solicitud de 2 unidades.
    const ingreso = await movimiento(bodeguero, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.INGRESO, idBodegaDestino: idCentral, cantidad: 2,
    }).expect(201);

    expect(ingreso.body.datos.ordenesLiberadas).toHaveLength(1);

    const pendientes = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/solicitudes-repuesto?idRepuesto=${idRepuesto}&soloPendientes=true`)
      .set(bodeguero).expect(200);
    expect(pendientes.body.datos).toHaveLength(1);
  });
});

describe('permisos y listados', () => {
  it('un agente de telefonia no registra movimientos de inventario', async () => {
    const idRepuesto = await repuestoNuevo();
    await movimiento(agente, {
      idRepuesto, tipo: TIPO_MOVIMIENTO.INGRESO, idBodegaDestino: idCentral, cantidad: 1,
    }).expect(403);
  });

  it('los listados llegan paginados y el de bajo minimo filtra', async () => {
    const existencias = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/existencias?soloBajoMinimo=true&tamano=10`).set(bodeguero).expect(200);
    expect(existencias.body.datos.length).toBeLessThanOrEqual(10);
    for (const fila of existencias.body.datos) expect(fila.bajoMinimo).toBe(true);

    const repuestos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/repuestos?tamano=5`).set(bodeguero).expect(200);
    expect(repuestos.body.datos).toHaveLength(5);
    expect(repuestos.body.paginacion.total).toBeGreaterThan(300);
  });
});
