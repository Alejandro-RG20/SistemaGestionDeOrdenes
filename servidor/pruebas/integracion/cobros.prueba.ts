/**
 * Cobros contra la base real.
 *
 * La prueba central es RF-57: que un expediente con evidencia incompleta no
 * salga del centro. Lo demas —conformar, verificar, anotar el resultado,
 * los indicadores— existe para que esa regla se pueda cumplir sin trabajo
 * manual.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import {
  CODIGO_ROL, DESTINATARIO_EXPEDIENTE, ESTADO_EXPEDIENTE, ESTADO_ORDEN, TIPO_GARANTIA,
} from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;
let gestor: { Authorization: string };
let jefatura: { Authorization: string };

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.datos.tokenAcceso}` };
}

/**
 * Una orden entregada, con garantia reclamable y sin expediente todavia.
 * `conEvidenciaCompleta` elige entre las que ya tienen toda la evidencia y
 * las que no, que es justo la distincion que RF-57 gobierna.
 */
async function ordenReclamableSinExpediente(
  conEvidenciaCompleta: boolean,
  { conConsumos = false, tipo = TIPO_GARANTIA.PROVEEDOR } = {},
): Promise<{ id: string; numero: number } | null> {
  const { rows } = await entorno.piscina.query<{ id: string; numero: string }>(
    `SELECT o.id, o.numero
       FROM orden_servicio o
      WHERE o.estado = $1 AND o.tipo_garantia = $2::tipo_garantia
        AND NOT EXISTS (SELECT 1 FROM expediente_cobro e WHERE e.id_orden = o.id)
        AND ${conEvidenciaCompleta ? 'NOT' : ''} EXISTS (
          SELECT 1 FROM v_evidencia_faltante f WHERE f.id_orden = o.id)
        ${conConsumos ? `AND EXISTS (
          SELECT 1 FROM movimiento_repuesto mv
           WHERE mv.id_orden = o.id AND mv.tipo = 'consumo')` : ''}
      ORDER BY o.numero LIMIT 1`,
    [ESTADO_ORDEN.ENTREGADA, tipo],
  );
  const fila = rows[0];
  return fila === undefined ? null : { id: fila.id, numero: Number(fila.numero) };
}

beforeAll(async () => {
  entorno = await montarApi();
  gestor = await sesionDe(CODIGO_ROL.GESTOR_COBROS);
  jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
}, 240_000);
afterAll(async () => { await entorno.cerrar(); });

describe('conformacion del expediente', () => {
  it('conforma sobre una orden entregada con garantia de proveedor', async () => {
    const orden = await ordenReclamableSinExpediente(true);
    expect(orden, 'la siembra no dejo ninguna orden reclamable disponible').not.toBeNull();

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${orden!.id}/expediente`).set(gestor).send({}).expect(201);
    const expediente = respuesta.body.datos;

    expect(expediente.destinatario).toBe(DESTINATARIO_EXPEDIENTE.PROVEEDOR);
    // El reclamo va a la marca del articulo, no a una generica.
    expect(expediente.idMarca).not.toBeNull();
    expect(expediente.evidenciaCompleta).toBe(true);
    expect(expediente.estado).toBe(ESTADO_EXPEDIENTE.EN_CONFORMACION);
    // El monto sale de los datos: repuestos + mano de obra + visita.
    expect(expediente.desglose.total).toBeCloseTo(
      expediente.desglose.totalRepuestos + expediente.desglose.manoObra
        + expediente.desglose.cargoVisita, 2,
    );
  });

  it('una orden sin evidencia completa nace bloqueada, no lista', async () => {
    const orden = await ordenReclamableSinExpediente(false);
    if (orden === null) return; // la siembra puede no dejar ninguna

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${orden.id}/expediente`).set(gestor).send({}).expect(201);

    expect(respuesta.body.datos.estado).toBe(ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA);
    expect(respuesta.body.datos.evidenciaPendiente.length).toBeGreaterThan(0);
  });

  it('no se conforma dos veces sobre la misma orden', async () => {
    const { rows } = await entorno.piscina.query<{ id_orden: string }>(
      'SELECT id_orden FROM expediente_cobro LIMIT 1',
    );
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${rows[0]!.id_orden}/expediente`).set(gestor).send({});

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toMatch(/ya tiene un expediente/i);
  });

  it('una reparacion que paga el cliente no tiene a quien reclamarle', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      `SELECT id FROM orden_servicio
        WHERE estado = $1 AND tipo_garantia = $2::tipo_garantia
          AND NOT EXISTS (SELECT 1 FROM expediente_cobro e WHERE e.id_orden = orden_servicio.id)
        LIMIT 1`,
      [ESTADO_ORDEN.ENTREGADA, TIPO_GARANTIA.PARTICULAR],
    );
    if (rows[0] === undefined) return;

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${rows[0].id}/expediente`).set(gestor).send({});

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.mensaje).toMatch(/paga el cliente/i);
  });

  it('no se conforma sobre una orden que todavia esta en el taller', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      `SELECT id FROM orden_servicio
        WHERE estado = 'en_reparacion' AND tipo_garantia = 'proveedor' LIMIT 1`,
    );
    if (rows[0] === undefined) return;

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${rows[0].id}/expediente`).set(gestor).send({});

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe('ORDEN_NO_ENTREGADA');
  });
});

describe('RF-57: la evidencia incompleta frena el envio', () => {
  it('un expediente bloqueado no pasa a listo para enviar, y dice que falta', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      `SELECT id FROM expediente_cobro WHERE estado = $1 LIMIT 1`,
      [ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA],
    );
    expect(rows[0], 'la siembra no dejo expedientes bloqueados').toBeDefined();

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/expedientes/${rows[0]!.id}/estado`).set(gestor)
      .send({ hacia: ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe('EXPEDIENTE_EVIDENCIA_INCOMPLETA');
    // No basta con negarse: hay que decir que foto conseguir.
    expect(respuesta.body.error.mensaje).toMatch(/Falta: .+/);
  });

  it('la ficha enumera exactamente lo que falta', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      `SELECT id FROM expediente_cobro WHERE estado = $1 LIMIT 1`,
      [ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA],
    );
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/expedientes/${rows[0]!.id}`).set(gestor).expect(200);

    expect(respuesta.body.datos.evidenciaPendiente.length).toBeGreaterThan(0);
    for (const pendiente of respuesta.body.datos.evidenciaPendiente) {
      expect(pendiente.etiqueta).toBeTruthy();
    }
  });
});

describe('recorrido completo de un expediente', () => {
  it('se alista, se envia, lo rechazan, se corrige y se cobra', async () => {
    // Con consumos: un expediente que no reclama nada no se puede enviar,
    // y eso ya lo cubre otra prueba.
    const orden = await ordenReclamableSinExpediente(true, { conConsumos: true });
    expect(orden, 'la siembra no dejo una orden reclamable con consumos').not.toBeNull();

    const creado = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${orden!.id}/expediente`).set(gestor).send({}).expect(201);
    const id: string = creado.body.datos.id;
    expect(creado.body.datos.desglose.total).toBeGreaterThan(0);

    const mover = (cuerpo: object) => peticion(entorno.aplicacion)
      .post(`${RAIZ}/expedientes/${id}/estado`).set(gestor).send(cuerpo);

    await mover({ hacia: ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR }).expect(200);

    const enviado = await mover({ hacia: ESTADO_EXPEDIENTE.ENVIADO }).expect(200);
    expect(enviado.body.datos.fechaEnvio).not.toBeNull();

    const rechazado = await mover({
      hacia: ESTADO_EXPEDIENTE.RECHAZADO,
      motivoRechazo: 'La factura de compra no es legible en el escaneo.',
    }).expect(200);
    expect(rechazado.body.datos.motivoRechazo).toMatch(/legible/);

    // Un rechazo no es el final: se corrige y se vuelve a presentar.
    await mover({ hacia: ESTADO_EXPEDIENTE.EN_CONFORMACION }).expect(200);
    await mover({ hacia: ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR }).expect(200);
    await mover({ hacia: ESTADO_EXPEDIENTE.ENVIADO }).expect(200);
    await mover({ hacia: ESTADO_EXPEDIENTE.ACEPTADO }).expect(200);

    const pagado = await mover({
      hacia: ESTADO_EXPEDIENTE.PAGADO, montoCobrado: 100,
    }).expect(200);
    expect(pagado.body.datos.montoCobrado).toBe(100);
    expect(pagado.body.datos.estado).toBe(ESTADO_EXPEDIENTE.PAGADO);

    // Y ya no se toca.
    const despues = await mover({ hacia: ESTADO_EXPEDIENTE.EN_CONFORMACION });
    expect(despues.status).toBe(422);
    expect(despues.body.error.codigo).toBe('EXPEDIENTE_CERRADO');
  });

  it('rechazar sin motivo se rechaza', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      `SELECT id FROM expediente_cobro WHERE estado = $1 LIMIT 1`, [ESTADO_EXPEDIENTE.ENVIADO],
    );
    if (rows[0] === undefined) return;

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/expedientes/${rows[0].id}/estado`).set(gestor)
      .send({ hacia: ESTADO_EXPEDIENTE.RECHAZADO });

    // Lo rechaza el dominio, no el esquema: la regla vive en la maquina de
    // estados, que es donde se puede razonar sobre ella.
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe('EXPEDIENTE_FALTA_RESULTADO');
  });
});

describe('verificacion contra los datos de hoy', () => {
  it('recalcula el monto y la evidencia, y devuelve el desglose', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM expediente_cobro LIMIT 1',
    );
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/expedientes/${rows[0]!.id}/verificar`).set(gestor).expect(200);

    const ficha = respuesta.body.datos;
    expect(ficha.desglose.total).toBe(ficha.montoReclamado);
    expect(ficha.evidenciaCompleta).toBe(ficha.evidenciaPendiente.length === 0);
  });
});

describe('pagos del cliente', () => {
  it('registra un pago contra la orden y lo devuelve en el listado', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      `SELECT id FROM orden_servicio WHERE estado = $1 LIMIT 1`, [ESTADO_ORDEN.ENTREGADA],
    );
    const creado = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${rows[0]!.id}/pagos`).set(gestor)
      .send({ monto: 1250.5, formaPago: 'efectivo', referencia: 'REC-909090' }).expect(201);

    expect(creado.body.datos.monto).toBe(1250.5);

    const listado = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/pagos?idOrden=${rows[0]!.id}`).set(gestor).expect(200);
    expect(listado.body.datos.some((pago: { id: string }) => pago.id === creado.body.datos.id))
      .toBe(true);
    expect(listado.body.paginacion).toBeDefined();
  });

  it('un pago en cero no se registra', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM orden_servicio LIMIT 1',
    );
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${rows[0]!.id}/pagos`).set(gestor)
      .send({ monto: 0, formaPago: 'efectivo' }).expect(400);
  });
});

describe('listado e indicadores', () => {
  it('el listado siempre viene paginado', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/expedientes?tamano=5`).set(gestor).expect(200);
    expect(respuesta.body.datos.length).toBeLessThanOrEqual(5);
    expect(respuesta.body.paginacion.total).toBeGreaterThan(0);
  });

  it('filtra por estado y por destinatario', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/expedientes?estado=${ESTADO_EXPEDIENTE.PAGADO}&destinatario=proveedor`)
      .set(gestor).expect(200);
    for (const expediente of respuesta.body.datos) {
      expect(expediente.estado).toBe(ESTADO_EXPEDIENTE.PAGADO);
      expect(expediente.destinatario).toBe(DESTINATARIO_EXPEDIENTE.PROVEEDOR);
    }
  });

  it('los indicadores cuadran con lo que hay', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/cobros/indicadores`).set(jefatura).expect(200);
    const indicadores = respuesta.body.datos;

    expect(indicadores.expedientes).toBeGreaterThan(0);
    expect(indicadores.totalCobrado).toBeLessThanOrEqual(indicadores.totalReclamado);
    expect(indicadores.tasaRecuperacion).toBeGreaterThanOrEqual(0);
    expect(indicadores.tasaRecuperacion).toBeLessThanOrEqual(100);

    // Lo expuesto es lo reclamado que no entro ni fue rechazado.
    expect(indicadores.expuesto).toBeLessThanOrEqual(indicadores.totalReclamado);

    const suma = indicadores.porMarca.reduce(
      (total: number, fila: { expedientes: number }) => total + fila.expedientes, 0,
    );
    expect(suma).toBe(indicadores.expedientes);
  });

  it('cada marca informa su tasa de recuperacion', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/cobros/indicadores`).set(jefatura).expect(200);

    for (const fila of respuesta.body.datos.porMarca) {
      expect(fila.marca).toBeTruthy();
      expect(fila.tasaRecuperacion).toBeGreaterThanOrEqual(0);
      expect(fila.cobrado).toBeLessThanOrEqual(fila.reclamado);
    }
  });
});

describe('quien puede hacer que', () => {
  it('un tecnico no conforma expedientes', async () => {
    const tecnico = await sesionDe(CODIGO_ROL.TECNICO_RUTA);
    await peticion(entorno.aplicacion).get(`${RAIZ}/expedientes`).set(tecnico).expect(403);
  });

  it('sin sesion no se ve nada', async () => {
    await peticion(entorno.aplicacion).get(`${RAIZ}/expedientes`).expect(401);
  });
});
