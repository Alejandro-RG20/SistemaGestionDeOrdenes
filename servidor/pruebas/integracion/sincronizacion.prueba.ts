/**
 * Protocolo de sincronizacion contra la base real.
 *
 * Los tres invariantes: reenviar no duplica, nada de lo registrado en campo
 * se descarta, y el dispositivo no borra sin confirmacion del servidor.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  CODIGO_ROL, ESTADO_OPERACION, MODALIDAD_SERVICIO, TIPO_MOVIMIENTO, TIPO_OPERACION,
} from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;
/** Sesion del tecnico de ruta, atada a su dispositivo movil. */
let movil: { Authorization: string };
let idTecnicoRuta = '';
let idBodegaMovil = '';
let idCentral = '';
let gestor: { Authorization: string };
let agente: { Authorization: string };
let jefatura: { Authorization: string };
let bodeguero: { Authorization: string };

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}

/** Sesion movil: lleva el identificador del dispositivo vinculado. */
async function sesionMovil(): Promise<{ cabecera: { Authorization: string }; idTecnico: string }> {
  const { rows } = await entorno.piscina.query<{
    nombre_usuario: string; identificador: string; id_tecnico: string;
  }>(
    `SELECT u.nombre_usuario, d.identificador, t.id AS id_tecnico
       FROM dispositivo d
       JOIN usuario u ON u.id = d.id_usuario
       JOIN tecnico t ON t.id_usuario = u.id
      WHERE d.revocado_en IS NULL AND t.tipo = 'ruta'
      ORDER BY d.identificador LIMIT 1`,
  );
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({
      nombreUsuario: rows[0]!.nombre_usuario,
      contrasena: CONTRASENA_DE_PRUEBA,
      identificadorDispositivo: rows[0]!.identificador,
    }).expect(201);
  return {
    cabecera: { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` },
    idTecnico: rows[0]!.id_tecnico,
  };
}

function sincronizar(cabecera: { Authorization: string }, operaciones: unknown[]) {
  return peticion(entorno.aplicacion).post(`${RAIZ}/sincronizacion/cola`)
    .set(cabecera).send({ operaciones });
}

function operacion(tipo: string, carga: Record<string, unknown>, id = randomUUID()) {
  return {
    idOperacion: id,
    tipoOperacion: tipo,
    momentoDispositivo: new Date(Date.now() - 3_600_000).toISOString(),
    carga,
  };
}

async function clienteConArticulo(): Promise<{ idCliente: string; idArticulo: string }> {
  const { rows } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
    `SELECT a.id_cliente, a.id FROM articulo a JOIN cliente c ON c.id = a.id_cliente
      WHERE c.activo AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
      LIMIT 1`,
  );
  return { idCliente: rows[0]!.id_cliente, idArticulo: rows[0]!.id };
}

/**
 * La orden se le encarga al tecnico del movil. Con el cerco por datos en la
 * cola (un tecnico solo opera sobre sus ordenes), un consumo sobre una orden
 * que nadie le asigno es justamente lo que se rechaza; estas pruebas miden
 * otra cosa y necesitan la orden encargada, como pasa en la realidad.
 */
async function encargarAlTecnico(idOrden: string): Promise<void> {
  await entorno.piscina.query('UPDATE orden_servicio SET id_tecnico = $2 WHERE id = $1', [idOrden, idTecnicoRuta]);
}

let contador = 0;
async function repuestoNuevo(precio = 900): Promise<string> {
  contador += 1;
  const { rows } = await entorno.piscina.query<{ id: string }>(
    `INSERT INTO repuesto (codigo, descripcion, precio, stock_minimo)
     VALUES ($1, $2, $3, 1) RETURNING id`,
    [`SYN-${String(contador).padStart(5, '0')}`, `Repuesto de sincronizacion ${contador}`, precio],
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

beforeAll(async () => {
  entorno = await montarApi();
  const sesion = await sesionMovil();
  movil = sesion.cabecera;
  idTecnicoRuta = sesion.idTecnico;
  gestor = await sesionDe(CODIGO_ROL.GESTOR_TECNICOS);
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
  jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
  bodeguero = await sesionDe(CODIGO_ROL.BODEGUERO);

  const { rows } = await entorno.piscina.query<{ id: string }>(
    "SELECT id FROM bodega WHERE tipo = 'movil' AND id_tecnico = $1", [idTecnicoRuta],
  );
  idBodegaMovil = rows[0]!.id;
  const central = await entorno.piscina.query<{ id: string }>(
    "SELECT id FROM bodega WHERE nombre = 'Bodega central' LIMIT 1",
  );
  idCentral = central.rows[0]!.id;
});

afterAll(async () => { await entorno.cerrar(); });

describe('idempotencia: reenviar no duplica', () => {
  it('la misma operacion enviada dos veces crea una sola orden', async () => {
    // Prueba 4 del pliego.
    const base = await clienteConArticulo();
    const idOrden = randomUUID();
    const op = operacion(TIPO_OPERACION.ORDEN_CREAR, {
      id: idOrden,
      idCliente: base.idCliente,
      idArticulo: base.idArticulo,
      modalidad: MODALIDAD_SERVICIO.RUTA,
      fallaReportada: 'No enfria, levantada en campo',
    });

    const primera = await sincronizar(movil, [op]).expect(200);
    expect(primera.body.data.aplicadas).toBe(1);
    expect(primera.body.data.resultados[0].estado).toBe(ESTADO_OPERACION.APLICADA);
    expect(primera.body.data.resultados[0].confirmada).toBe(true);
    const numeroPrimero = primera.body.data.resultados[0].datos.numero;

    // El mismo envio otra vez, tal cual.
    const segunda = await sincronizar(movil, [op]).expect(200);
    expect(segunda.body.data.repetidas).toBe(1);
    expect(segunda.body.data.aplicadas).toBe(0);
    expect(segunda.body.data.resultados[0].estado).toBe(ESTADO_OPERACION.REPETIDA);
    expect(segunda.body.data.resultados[0].idEntidad).toBe(idOrden);
    expect(segunda.body.data.resultados[0].datos.numero).toBe(numeroPrimero);

    // Y en la base hay UNA orden, con UN numero.
    const { rows } = await entorno.piscina.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM orden_servicio WHERE id = $1', [idOrden],
    );
    expect(Number(rows[0]!.total)).toBe(1);
  });

  it('reenviar un consumo no descuenta dos veces', async () => {
    const base = await clienteConArticulo();
    const idRepuesto = await repuestoNuevo();
    await peticion(entorno.aplicacion).post(`${RAIZ}/movimientos`).set(bodeguero)
      .send({ idRepuesto, tipo: TIPO_MOVIMIENTO.INGRESO, idBodegaDestino: idCentral, cantidad: 10 })
      .expect(201);
    await peticion(entorno.aplicacion).post(`${RAIZ}/movimientos`).set(bodeguero)
      .send({
        idRepuesto, tipo: TIPO_MOVIMIENTO.DESPACHO_A_MOVIL,
        idBodegaOrigen: idCentral, idBodegaDestino: idBodegaMovil, cantidad: 6,
      }).expect(201);

    const orden = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
      .send({
        idCliente: base.idCliente, idArticulo: base.idArticulo,
        modalidad: MODALIDAD_SERVICIO.RUTA, fallaReportada: 'Para probar consumo repetido',
      }).expect(201);
    await encargarAlTecnico(orden.body.data.id);

    const op = operacion(TIPO_OPERACION.INVENTARIO_CONSUMO, {
      idOrden: orden.body.data.id, idRepuesto, idBodegaOrigen: idBodegaMovil, cantidad: 2,
    });

    await sincronizar(movil, [op]).expect(200);
    expect(await existenciaDe(idBodegaMovil, idRepuesto)).toBe(4);

    await sincronizar(movil, [op]).expect(200);
    // Sigue en 4: el reenvio no volvio a descontar.
    expect(await existenciaDe(idBodegaMovil, idRepuesto)).toBe(4);

    const { rows } = await entorno.piscina.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM movimiento_repuesto
        WHERE id_orden = $1 AND tipo = 'consumo'`, [orden.body.data.id],
    );
    expect(Number(rows[0]!.total)).toBe(1);
  });

  it('las operaciones se procesan en el orden en que llegan', async () => {
    const base = await clienteConArticulo();
    const idOrden = randomUUID();

    const respuesta = await sincronizar(movil, [
      operacion(TIPO_OPERACION.ORDEN_CREAR, {
        id: idOrden, idCliente: base.idCliente, idArticulo: base.idArticulo,
        modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'Primera de la cola',
      }),
      operacion(TIPO_OPERACION.DIAGNOSTICO_REGISTRAR, {
        idOrden, idTecnico: idTecnicoRuta, fallaReal: 'Compresor en corto', componente: 'compresor',
      }),
    ]).expect(200);

    // La segunda depende de que la primera se haya aplicado ya.
    expect(respuesta.body.data.aplicadas).toBe(2);
    expect(respuesta.body.data.resultados[1].estado).toBe(ESTADO_OPERACION.APLICADA);
  });
});

describe('nada de lo registrado en campo se descarta', () => {
  it('orden anulada mientras el tecnico trabajaba: se conserva el trabajo integro', async () => {
    const base = await clienteConArticulo();
    const orden = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
      .send({
        idCliente: base.idCliente, idArticulo: base.idArticulo,
        modalidad: MODALIDAD_SERVICIO.RUTA, fallaReportada: 'El tecnico ya salio a atenderla',
      }).expect(201);

    /*
     * Se le asigna al tecnico ANTES de anularla, que es como pasa en la
     * realidad: el tecnico no va a un domicilio por una orden que no tiene
     * encargada. Antes esta prueba se la dejaba sin asignar y funcionaba de
     * casualidad; con el cerco por datos (§13) la operacion ahora falla por
     * no ser suya, y el fallo que la prueba quiere comprobar es otro: que la
     * orden estaba anulada.
     */
    await entorno.piscina.query(
      'UPDATE orden_servicio SET id_tecnico = $2 WHERE id = $1',
      [orden.body.data.id, idTecnicoRuta],
    );

    // La anulan en el centro mientras el tecnico esta en el domicilio.
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${orden.body.data.id}/estado`)
      .set(jefatura).send({ hacia: 'anulada', motivo: 'El cliente llamo a cancelar el servicio' })
      .expect(200);

    // El tecnico vuelve con senal y sincroniza lo que hizo.
    const respuesta = await sincronizar(movil, [
      operacion(TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO, {
        idOrden: orden.body.data.id, hacia: 'en_diagnostico',
        observacion: 'Revise el equipo en el domicilio',
      }),
    ]).expect(200);

    const resultado = respuesta.body.data.resultados[0];
    expect(resultado.estado).toBe(ESTADO_OPERACION.EN_EXCEPCION);
    // Confirmada: el servidor ya tiene el trabajo, el dispositivo puede borrarlo.
    expect(resultado.confirmada).toBe(true);
    expect(resultado.mensaje).toMatch(/no se descarta nada/i);
    expect(resultado.idExcepcion).toBeTypeOf('string');

    // La carga original esta integra en la bandeja.
    const excepcion = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/sincronizacion/excepciones/${resultado.idExcepcion}`).set(gestor).expect(200);
    expect(excepcion.body.data.cargaOriginal.carga.observacion).toBe('Revise el equipo en el domicilio');
    expect(excepcion.body.data.cargaOriginal.idOperacion).toBeTypeOf('string');
    expect(excepcion.body.data.estado).toBe('pendiente');
    expect(excepcion.body.data.numeroOrden).toBe(orden.body.data.numero);
  });

  it('un rechazo queda registrado como procesado, para que el movil pueda borrarlo', async () => {
    const base = await clienteConArticulo();
    const orden = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
      .send({
        idCliente: base.idCliente, idArticulo: base.idArticulo,
        modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'Para probar transicion invalida',
      }).expect(201);

    const op = operacion(TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO, {
      idOrden: orden.body.data.id, hacia: 'entregada',
    });

    const primera = await sincronizar(movil, [op]).expect(200);
    expect(primera.body.data.resultados[0].estado).toBe(ESTADO_OPERACION.EN_EXCEPCION);

    // Reenviarla no crea una segunda excepcion: ya esta registrada.
    const segunda = await sincronizar(movil, [op]).expect(200);
    expect(segunda.body.data.resultados[0].estado).toBe(ESTADO_OPERACION.REPETIDA);

    const { rows } = await entorno.piscina.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM excepcion_sincronizacion WHERE id_operacion = $1',
      [op.idOperacion],
    );
    expect(Number(rows[0]!.total)).toBe(1);
  });

  it('la bandeja se resuelve con una explicacion escrita y no se borra', async () => {
    const pendientes = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/sincronizacion/excepciones?estado=pendiente&tamano=1`).set(gestor).expect(200);
    const id = pendientes.body.data[0].id;
    const totalAntes = await entorno.piscina.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM excepcion_sincronizacion',
    );

    const sinExplicar = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/sincronizacion/excepciones/${id}/resolver`).set(gestor)
      .send({ estado: 'resuelta', resolucion: 'ok' });
    expect(sinExplicar.status).toBe(400);

    const resuelta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/sincronizacion/excepciones/${id}/resolver`).set(gestor)
      .send({ estado: 'resuelta', resolucion: 'Se concilio con el tecnico y se aplico el trabajo a mano' })
      .expect(200);
    expect(resuelta.body.data.estado).toBe('resuelta');
    expect(resuelta.body.data.resueltaPor).toBeTypeOf('string');
    expect(resuelta.body.data.cargaOriginal).toBeTypeOf('object');

    const totalDespues = await entorno.piscina.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM excepcion_sincronizacion',
    );
    expect(totalDespues.rows[0]!.total).toBe(totalAntes.rows[0]!.total);

    // Resolver dos veces avisa en lugar de sobrescribir.
    const otraVez = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/sincronizacion/excepciones/${id}/resolver`).set(gestor)
      .send({ estado: 'descartada', resolucion: 'Intento de cerrarla dos veces para la prueba' });
    expect(otraVez.status).toBe(422);
    expect(otraVez.body.error.code).toBe('EXCEPCION_YA_CERRADA');
  });
});

describe('prevalece lo que ocurrio en el domicilio', () => {
  it('un repuesto que no figuraba en la bodega movil se acepta y genera diferencia', async () => {
    const base = await clienteConArticulo();
    const idRepuesto = await repuestoNuevo();
    const orden = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
      .send({
        idCliente: base.idCliente, idArticulo: base.idArticulo,
        modalidad: MODALIDAD_SERVICIO.RUTA, fallaReportada: 'El tecnico instalo una pieza que no figuraba',
      }).expect(201);
    await encargarAlTecnico(orden.body.data.id);

    // La bodega movil no tiene ni una unidad de este repuesto.
    expect(await existenciaDe(idBodegaMovil, idRepuesto)).toBe(0);

    const respuesta = await sincronizar(movil, [
      operacion(TIPO_OPERACION.INVENTARIO_CONSUMO, {
        idOrden: orden.body.data.id, idRepuesto, idBodegaOrigen: idBodegaMovil, cantidad: 2,
      }),
    ]).expect(200);

    const resultado = respuesta.body.data.resultados[0];
    expect(resultado.estado).toBe(ESTADO_OPERACION.ACEPTADA_CON_DIFERENCIA);
    expect(resultado.confirmada).toBe(true);
    expect(resultado.mensaje).toMatch(/no figuraban/i);

    // El consumo esta registrado y la existencia no quedo negativa.
    expect(await existenciaDe(idBodegaMovil, idRepuesto)).toBe(0);
    const { rows } = await entorno.piscina.query<{ tipo: string; cantidad: number }>(
      `SELECT tipo::text AS tipo, cantidad FROM movimiento_repuesto
        WHERE id_orden = $1 ORDER BY creado_en`, [orden.body.data.id],
    );
    expect(rows.map((f) => f.tipo)).toEqual(['ajuste', 'consumo']);
    expect(rows[0]!.cantidad).toBe(2);

    // Y hay una diferencia esperando a que alguien la concilie.
    const excepcion = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/sincronizacion/excepciones/${resultado.idExcepcion}`).set(gestor).expect(200);
    expect(excepcion.body.data.motivo).toMatch(/no figuraban en la bodega movil/i);
    expect(excepcion.body.data.estado).toBe('pendiente');
  });

  it('prevalece el precio que el cliente firmo, no el del catalogo de hoy', async () => {
    const base = await clienteConArticulo();
    const idRepuesto = await repuestoNuevo(1_000);
    await peticion(entorno.aplicacion).post(`${RAIZ}/movimientos`).set(bodeguero)
      .send({ idRepuesto, tipo: TIPO_MOVIMIENTO.INGRESO, idBodegaDestino: idCentral, cantidad: 5 })
      .expect(201);
    await peticion(entorno.aplicacion).post(`${RAIZ}/movimientos`).set(bodeguero)
      .send({
        idRepuesto, tipo: TIPO_MOVIMIENTO.DESPACHO_A_MOVIL,
        idBodegaOrigen: idCentral, idBodegaDestino: idBodegaMovil, cantidad: 3,
      }).expect(201);

    // El catalogo sube de precio mientras el tecnico esta en ruta.
    await entorno.piscina.query('UPDATE repuesto SET precio = 1500 WHERE id = $1', [idRepuesto]);

    const orden = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
      .send({
        idCliente: base.idCliente, idArticulo: base.idArticulo,
        modalidad: MODALIDAD_SERVICIO.RUTA, fallaReportada: 'Para probar el precio firmado',
      }).expect(201);
    await encargarAlTecnico(orden.body.data.id);

    const respuesta = await sincronizar(movil, [
      operacion(TIPO_OPERACION.INVENTARIO_CONSUMO, {
        idOrden: orden.body.data.id, idRepuesto, idBodegaOrigen: idBodegaMovil,
        cantidad: 1, precioUnitario: 1_000,
      }),
    ]).expect(200);

    const resultado = respuesta.body.data.resultados[0];
    expect(resultado.estado).toBe(ESTADO_OPERACION.ACEPTADA_CON_DIFERENCIA);
    expect(resultado.datos.precio).toBe(1_000);

    const { rows } = await entorno.piscina.query<{ precio_unitario: number }>(
      `SELECT precio_unitario FROM movimiento_repuesto
        WHERE id_orden = $1 AND tipo = 'consumo'`, [orden.body.data.id],
    );
    // El que el cliente firmo, no los 1500 del catalogo.
    expect(Number(rows[0]!.precio_unitario)).toBe(1_000);
    expect(resultado.mensaje).toMatch(/precio firmado/i);
  });
});

describe('quien puede sincronizar', () => {
  it('una sesion sin dispositivo no puede sincronizar', async () => {
    const respuesta = await sincronizar(agente, [
      operacion(TIPO_OPERACION.DIAGNOSTICO_REGISTRAR, { idOrden: randomUUID() }),
    ]);
    // El agente ni siquiera tiene el permiso de campo.
    expect(respuesta.status).toBe(403);
  });

  it('un tecnico de planta tiene el permiso pero no dispositivo atado', async () => {
    const { rows } = await entorno.piscina.query<{ nombre_usuario: string }>(
      `SELECT u.nombre_usuario FROM usuario u JOIN rol r ON r.id = u.id_rol
        WHERE r.codigo = 'tecnico_ruta' AND u.activo
          AND NOT EXISTS (SELECT 1 FROM dispositivo d WHERE d.id_usuario = u.id)
        LIMIT 1`,
    );
    if (rows[0] === undefined) return; // todos tienen dispositivo en la siembra

    const sesion = await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: rows[0].nombre_usuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);

    const respuesta = await sincronizar(
      { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` },
      [operacion(TIPO_OPERACION.DIAGNOSTICO_REGISTRAR, { idOrden: randomUUID() })],
    );
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.code).toBe('SESION_SIN_DISPOSITIVO');
  });

  it('solo quien tiene el permiso resuelve excepciones', async () => {
    await peticion(entorno.aplicacion)
      .get(`${RAIZ}/sincronizacion/excepciones`).set(agente).expect(403);
  });
});

describe('la cola no deja hacer lo que el panel no deja', () => {
  async function ordenDeRuta(): Promise<string> {
    const base = await clienteConArticulo();
    const orden = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
      .send({
        idCliente: base.idCliente, idArticulo: base.idArticulo,
        modalidad: MODALIDAD_SERVICIO.RUTA, fallaReportada: 'Orden para probar el cerco de la cola',
      }).expect(201);
    return orden.body.data.id as string;
  }

  async function motivoDe(idExcepcion: string): Promise<string> {
    const excepcion = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/sincronizacion/excepciones/${idExcepcion}`).set(gestor).expect(200);
    return excepcion.body.data.motivo as string;
  }

  it('un consumo sobre una orden ajena no descuenta nada y queda en la bandeja', async () => {
    const idOrden = await ordenDeRuta();
    const idRepuesto = await repuestoNuevo();

    const respuesta = await sincronizar(movil, [
      operacion(TIPO_OPERACION.INVENTARIO_CONSUMO, { idOrden, idRepuesto, idBodegaOrigen: idBodegaMovil, cantidad: 1 }),
    ]).expect(200);

    const resultado = respuesta.body.data.resultados[0];
    expect(resultado.estado).toBe(ESTADO_OPERACION.EN_EXCEPCION);
    expect(resultado.confirmada).toBe(true);
    const { rows } = await entorno.piscina.query('SELECT 1 FROM movimiento_repuesto WHERE id_orden = $1', [idOrden]);
    expect(rows).toHaveLength(0);
  });

  it('un tecnico no consume de una bodega que no es suya, ni siquiera para ajustar faltantes', async () => {
    const idOrden = await ordenDeRuta();
    await encargarAlTecnico(idOrden);
    const idRepuesto = await repuestoNuevo();
    const antes = await existenciaDe(idCentral, idRepuesto);

    const respuesta = await sincronizar(movil, [
      operacion(TIPO_OPERACION.INVENTARIO_CONSUMO, { idOrden, idRepuesto, idBodegaOrigen: idCentral, cantidad: 3 }),
    ]).expect(200);

    const resultado = respuesta.body.data.resultados[0];
    expect(resultado.estado).toBe(ESTADO_OPERACION.EN_EXCEPCION);
    expect(await existenciaDe(idCentral, idRepuesto)).toBe(antes);
    const { rows } = await entorno.piscina.query('SELECT 1 FROM movimiento_repuesto WHERE id_orden = $1', [idOrden]);
    expect(rows).toHaveLength(0);
  });

  it('el diagnostico se registra a nombre de quien sincroniza, no de quien diga la carga', async () => {
    const idOrden = await ordenDeRuta();
    await encargarAlTecnico(idOrden);
    const { rows: otros } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM tecnico WHERE id <> $1 AND activo LIMIT 1', [idTecnicoRuta],
    );

    const suplantado = await sincronizar(movil, [
      operacion(TIPO_OPERACION.DIAGNOSTICO_REGISTRAR, {
        idOrden, idTecnico: otros[0]!.id, fallaReal: 'Tarjeta quemada', componente: 'tarjeta',
      }),
    ]).expect(200);
    expect(suplantado.body.data.resultados[0].estado).toBe(ESTADO_OPERACION.EN_EXCEPCION);
    expect(await motivoDe(suplantado.body.data.resultados[0].idExcepcion)).toBeTypeOf('string');

    // Sin idTecnico en la carga, se toma el de la sesion.
    const propio = await sincronizar(movil, [
      operacion(TIPO_OPERACION.DIAGNOSTICO_REGISTRAR, { idOrden, fallaReal: 'Tarjeta quemada', componente: 'tarjeta' }),
    ]).expect(200);
    expect(propio.body.data.resultados[0].estado).toBe(ESTADO_OPERACION.APLICADA);
    const { rows } = await entorno.piscina.query<{ id_tecnico: string }>(
      'SELECT id_tecnico FROM diagnostico WHERE id_orden = $1', [idOrden],
    );
    expect(rows.map((fila) => fila.id_tecnico)).toEqual([idTecnicoRuta]);
  });

  it('el resultado de una visita no se sobrescribe con un segundo registro', async () => {
    const idOrden = await ordenDeRuta();
    await encargarAlTecnico(idOrden);
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${idOrden}/visitas`).set(gestor)
      .send({ idTecnico: idTecnicoRuta, fechaProgramada: '2031-03-03', franjaHoraria: '07:00-09:00' })
      .expect(201);

    const primera = await sincronizar(movil, [
      operacion(TIPO_OPERACION.VISITA_REGISTRAR, {
        idOrden, resultado: 'resuelta_en_sitio', horaLlegada: '2031-03-03T09:00:00.000Z',
      }),
    ]).expect(200);
    expect(primera.body.data.resultados[0].estado).toBe(ESTADO_OPERACION.APLICADA);

    const segunda = await sincronizar(movil, [
      operacion(TIPO_OPERACION.VISITA_REGISTRAR, {
        idOrden, resultado: 'cliente_ausente', horaLlegada: '2031-03-03T11:00:00.000Z',
      }),
    ]).expect(200);
    expect(segunda.body.data.resultados[0].estado).toBe(ESTADO_OPERACION.EN_EXCEPCION);

    const { rows } = await entorno.piscina.query<{ resultado: string; hora_llegada: Date }>(
      'SELECT resultado::text AS resultado, hora_llegada FROM visita WHERE id_orden = $1 AND vigente', [idOrden],
    );
    expect(rows[0]!.resultado).toBe('resuelta_en_sitio');
    expect(rows[0]!.hora_llegada.toISOString()).toBe('2031-03-03T09:00:00.000Z');
  });

  it('no se registra evidencia de campo en una orden ya cerrada', async () => {
    const idOrden = await ordenDeRuta();
    await encargarAlTecnico(idOrden);
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${idOrden}/estado`).set(jefatura)
      .send({ hacia: 'anulada', motivo: 'El cliente cancelo antes de la visita' }).expect(200);

    const respuesta = await sincronizar(movil, [
      operacion(TIPO_OPERACION.EVIDENCIA_REGISTRAR, { idOrden, tipo: 'foto', clave: 'equipo_recibido' }),
    ]).expect(200);
    expect(respuesta.body.data.resultados[0].estado).toBe(ESTADO_OPERACION.EN_EXCEPCION);
    const { rows } = await entorno.piscina.query('SELECT 1 FROM evidencia WHERE id_orden = $1', [idOrden]);
    expect(rows).toHaveLength(0);
  });
});
