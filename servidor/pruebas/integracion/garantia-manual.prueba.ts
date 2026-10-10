/**
 * Eleccion de la garantia, contra la base real (pruebas 1 a 3 del pliego).
 *
 * La garantia de una orden la elige quien la registra, pero solo entre las
 * que aplican: registrada, vigente y del articulo y el solicitante. La
 * vigencia de una orden ya registrada se mide a la FECHA DE RECEPCION. Se
 * anota con fecha y responsable, y solo la cambia una reclasificacion con
 * permiso y motivo; de garantia a particular no se reclasifica (exclusion).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, MODALIDAD_SERVICIO, TIPO_GARANTIA } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
type Cabecera = { Authorization: string };

let entorno: EntornoApi;
let agente: Cabecera;
let jefatura: Cabecera;
let consulta: Cabecera;

async function sesionDe(codigoRol: string): Promise<Cabecera> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}

/** Articulo sin ordenes abiertas, de un cliente activo con telefono. */
async function articulo(filtro = 'true'): Promise<{ idCliente: string; idArticulo: string }> {
  const { rows } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
    `SELECT a.id_cliente, a.id FROM articulo a
       JOIN cliente c ON c.id = a.id_cliente JOIN tienda_origen t ON t.id = a.id_tienda_origen
      WHERE a.activo AND c.activo AND c.id_cliente_principal IS NULL
        AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
        AND NOT EXISTS (SELECT 1 FROM orden_servicio o WHERE o.id_articulo = a.id
                         AND o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada'))
        AND ${filtro}
      ORDER BY random() LIMIT 1`,
  );
  return { idCliente: rows[0]!.id_cliente, idArticulo: rows[0]!.id };
}

/** Articulo con la garantia del proveedor aplicable: tienda del grupo, compra reciente. */
const PROVEEDOR_APLICA = `t.pertenece_al_grupo AND a.fecha_compra > current_date - interval '3 months'
  AND NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id AND cb.activa)`;
/** Articulo sin ninguna garantia aplicable: comprado fuera del grupo, sin coberturas. */
const SIN_GARANTIA = `NOT t.pertenece_al_grupo
  AND NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id)`;

function hace(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}

async function crearOrden(extra: Record<string, unknown>, filtro = PROVEEDOR_APLICA): Promise<string> {
  const base = await articulo(filtro);
  const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente).send({
    ...base, modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'No enciende desde hace dos dias', ...extra,
  }).expect(201);
  return creada.body.data.id as string;
}

const garantia = async (cabecera: Cabecera, idOrden: string) =>
  (await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${idOrden}/garantia`).set(cabecera).expect(200)).body.data;

const reclasificar = (cabecera: Cabecera, idOrden: string, cuerpo: Record<string, unknown>) =>
  peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${idOrden}/garantia`).set(cabecera).send(cuerpo);

beforeAll(async () => {
  entorno = await montarApi();
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
  jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
  consulta = await sesionDe(CODIGO_ROL.USUARIO_CONSULTA);
});

afterAll(async () => { await entorno.cerrar(); });

const crear = (base: { idCliente: string; idArticulo: string }, tipo: string) =>
  peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente).send({
    ...base, modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'No enciende desde ayer', tipoGarantiaElegida: tipo,
  });

describe('que garantias se pueden elegir', () => {
  it('1. proveedor vigente y aplicable: se registra, con fecha y responsable', async () => {
    const id = await crearOrden({ tipoGarantiaElegida: 'proveedor' });
    const datos = await garantia(agente, id);
    expect(datos.tipoActual).toBe(TIPO_GARANTIA.PROVEEDOR);
    expect(datos.vigente).toMatchObject({ tipo: 'proveedor', tipoAnterior: null, origen: 'registro' });
    expect(datos.vigente.responsable).toBeTypeOf('string');
    expect(Date.parse(datos.vigente.momento)).not.toBeNaN();
    expect(datos.advertencias).toEqual([]);
  });

  it('2. solo garantia adicional vigente: adicional y particular si, proveedor no', async () => {
    const base = await articulo(SIN_GARANTIA);
    await peticion(entorno.aplicacion).post(`${RAIZ}/articulos/${base.idArticulo}/coberturas`).set(jefatura)
      .send({ tipo: 'adicional', vigenteDesde: hace(30), meses: 12, documentoRespaldo: 'POL-PRUEBA-1' }).expect(201);

    const consultaGarantias = (await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/evaluar`).set(agente)
      .send(base).expect(200)).body.data;
    expect(consultaGarantias.garantias.proveedor.aplicable).toBe(false);
    expect(consultaGarantias.garantias.adicional.aplicable).toBe(true);

    const proveedor = await crear(base, 'proveedor');
    expect(proveedor.status).toBe(422);
    expect(proveedor.body.error.code).toBe('GARANTIA_NO_APLICABLE');
    const adicional = await crear(base, 'adicional');
    expect(adicional.status).toBe(201);
    expect(adicional.body.data.tipoGarantia).toBe('adicional');
  });

  it('3. sin ninguna garantia vigente: solo particular', async () => {
    const base = await articulo(SIN_GARANTIA);
    for (const tipo of ['proveedor', 'adicional']) {
      const respuesta = await crear(base, tipo);
      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.code).toBe('GARANTIA_NO_APLICABLE');
    }
    const particular = await crear(base, 'particular');
    expect(particular.status).toBe(201);
    expect(particular.body.data.tipoGarantia).toBe('particular');
  });

  it('una poliza a nombre de otra persona no habilita la garantia adicional', async () => {
    const base = await articulo(SIN_GARANTIA);
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM cliente WHERE id <> $1 AND activo LIMIT 1', [base.idCliente],
    );
    await peticion(entorno.aplicacion).post(`${RAIZ}/articulos/${base.idArticulo}/coberturas`).set(jefatura)
      .send({ tipo: 'adicional', vigenteDesde: hace(30), meses: 12, idClienteContratante: rows[0]!.id }).expect(201);
    expect((await crear(base, 'adicional')).status).toBe(422);
  });

  it('la vigencia de una orden registrada se mide a su fecha de recepcion', async () => {
    // Una orden particular recibida el dia 200 atras, sobre un articulo cuya
    // garantia del proveedor registrada cubria ese dia y ya vencio.
    const id = await crearOrden({ tipoGarantiaElegida: 'particular' });
    const { rows } = await entorno.piscina.query<{ id_articulo: string }>(
      'SELECT id_articulo FROM orden_servicio WHERE id = $1', [id],
    );
    await entorno.piscina.query(
      `INSERT INTO cobertura (id_articulo, tipo, vigente_desde, vigente_hasta, documento_respaldo, activa)
       VALUES ($1, 'proveedor', $2, $3, 'Carta del fabricante', true)`,
      [rows[0]!.id_articulo, hace(400), hace(100)],
    );
    await entorno.piscina.query('UPDATE orden_servicio SET fecha_recepcion = $2 WHERE id = $1', [id, hace(200)]);

    const datos = await garantia(jefatura, id);
    expect(datos.garantias.proveedor.vigencia).toBe('vigente');
    await reclasificar(jefatura, id, { tipo: 'proveedor', motivo: 'Cliente presento la carta de garantia vigente al recibir' })
      .expect(200);

    // Hoy ya no se podria registrar una orden nueva con esa garantia.
    const hoy = await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/evaluar`).set(agente)
      .send({ idArticulo: rows[0]!.id_articulo }).expect(200);
    expect(hoy.body.data.garantias.proveedor.vigencia).toBe('vencida');
  });

  it('una orden levantada en campo sin eleccion entra por validar y se confirma reclasificando', async () => {
    const id = await crearOrden({ levantadaEnCampo: true });
    const antes = await garantia(agente, id);
    expect(antes.tipoActual).toBe(TIPO_GARANTIA.POR_VALIDAR);
    expect(antes.vigente.origen).toBe('campo');

    await reclasificar(jefatura, id, { tipo: 'proveedor', motivo: 'Cliente presento la factura en el taller' })
      .expect(200);
    const despues = await garantia(agente, id);
    expect(despues.tipoActual).toBe(TIPO_GARANTIA.PROVEEDOR);
    expect(despues.vigente).toMatchObject({ tipoAnterior: 'por_validar', tipo: 'proveedor', origen: 'reclasificacion' });
  });
});

describe('reclasificar', () => {
  it('exige el permiso: el agente y el usuario de consulta no pueden', async () => {
    const id = await crearOrden({ tipoGarantiaElegida: 'particular' });
    await reclasificar(agente, id, { tipo: 'proveedor', motivo: 'El agente quiere cambiarla' }).expect(403);
    await reclasificar(consulta, id, { tipo: 'proveedor', motivo: 'Consulta quiere cambiarla' }).expect(403);
    expect((await garantia(agente, id)).tipoActual).toBe(TIPO_GARANTIA.PARTICULAR);
    expect((await garantia(agente, id)).puedeReclasificar).toBe(false);
    expect((await garantia(jefatura, id)).puedeReclasificar).toBe(true);
  });

  it('exige motivo escrito', async () => {
    const id = await crearOrden({ tipoGarantiaElegida: 'particular' });
    const sin = await reclasificar(jefatura, id, { tipo: 'proveedor' });
    expect(sin.status).toBe(400);
    expect(sin.body.error.fields).toHaveProperty('motivo');
    const corto = await reclasificar(jefatura, id, { tipo: 'proveedor', motivo: 'porque' });
    expect(corto.status).toBe(400);
    expect((await garantia(agente, id)).tipoActual).toBe(TIPO_GARANTIA.PARTICULAR);
  });

  it('no reclasifica a la misma clasificacion', async () => {
    const id = await crearOrden({ tipoGarantiaElegida: 'particular' });
    const respuesta = await reclasificar(jefatura, id, { tipo: 'particular', motivo: 'Lo mismo de nuevo, por error' });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.code).toBe('RECLASIFICACION_NO_PERMITIDA');
  });

  it('una orden de garantia NO se reclasifica a particular: remite a la exclusion', async () => {
    const id = await crearOrden({ tipoGarantiaElegida: 'proveedor' });
    const respuesta = await reclasificar(jefatura, id, { tipo: 'particular', motivo: 'Golpe constatado en la visita' });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.message).toMatch(/confirme la exclusion/);
    expect((await garantia(agente, id)).tipoActual).toBe(TIPO_GARANTIA.PROVEEDOR);
  });

  it('no pasa a una garantia que no aplica', async () => {
    const id = await crearOrden({ tipoGarantiaElegida: 'particular' }, SIN_GARANTIA);
    const respuesta = await reclasificar(jefatura, id, { tipo: 'proveedor', motivo: 'Intento sin garantia vigente' });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.code).toBe('GARANTIA_NO_APLICABLE');
  });

  it('conserva la anterior, la nueva, el responsable, la fecha y el motivo', async () => {
    const id = await crearOrden({ tipoGarantiaElegida: 'particular' });
    const motivo = 'El cliente presento la factura de compra';
    await reclasificar(jefatura, id, { tipo: 'proveedor', motivo }).expect(200);

    const { rows } = await entorno.piscina.query<{
      accion: string; valor_anterior: string; valor_nuevo: string; motivo: string; id_usuario: string; momento: Date;
    }>(
      `SELECT accion, valor_anterior, valor_nuevo, motivo, id_usuario, momento FROM bitacora
        WHERE tabla = 'orden_servicio' AND id_registro = $1 AND campo = 'tipo_garantia' ORDER BY momento`, [id],
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ accion: 'modificar', valor_anterior: 'particular', valor_nuevo: 'proveedor', motivo });
    expect(rows[1]!.id_usuario).toBeTypeOf('string');

    const datos = await garantia(agente, id);
    expect(datos.historial.map((d: { tipo: string }) => d.tipo)).toEqual(['particular', 'proveedor']);
    expect(datos.vigente).toMatchObject({ tipoAnterior: 'particular', tipo: 'proveedor', origen: 'reclasificacion' });

    const historial = (await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${id}/historial`).set(agente)
      .expect(200)).body.data as Array<{ titulo: string }>;
    expect(historial.some((e) => e.titulo.includes('Garantia reclasificada: particular → proveedor'))).toBe(true);
  });

  it('una orden cerrada no se reclasifica', async () => {
    const { rows } = await entorno.piscina.query<{ id: string; tipo_garantia: string }>(
      `SELECT id, tipo_garantia::text FROM orden_servicio
        WHERE estado = 'entregada' AND tipo_garantia = 'particular' LIMIT 1`,
    );
    const respuesta = await reclasificar(jefatura, rows[0]!.id, { tipo: 'proveedor', motivo: 'Intento sobre una entregada' });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.message).toMatch(/nota de correccion/);
  });
});

describe('ordenes anteriores', () => {
  it('una orden sembrada sin decision anotada muestra su alta y se puede leer igual', async () => {
    const { rows } = await entorno.piscina.query<{ id: string; tipo_garantia: string }>(
      `SELECT o.id, o.tipo_garantia::text FROM orden_servicio o
        WHERE NOT EXISTS (SELECT 1 FROM bitacora b WHERE b.tabla = 'orden_servicio'
                            AND b.id_registro = o.id AND b.campo = 'tipo_garantia')
          AND NOT EXISTS (SELECT 1 FROM evento_orden e WHERE e.id_orden = o.id
                            AND e.observacion LIKE 'Cobertura reevaluada de %')
        LIMIT 1`,
    );
    const datos = await garantia(jefatura, rows[0]!.id);
    expect(datos.tipoActual).toBe(rows[0]!.tipo_garantia);
    expect(datos.vigente).toMatchObject({ origen: 'sin_registro', tipo: rows[0]!.tipo_garantia });
  });
});
