/**
 * Decision manual de la garantia, contra la base real.
 *
 * La garantia de una orden la elige quien la registra. El sistema la anota
 * con fecha y responsable, advierte sin sustituirla y solo la cambia una
 * reclasificacion con permiso y motivo, que conserva la clasificacion
 * anterior, la nueva, quien, cuando y por que.
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

async function crearOrden(extra: Record<string, unknown>): Promise<string> {
  const base = await articulo();
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

describe('la decision al registrar', () => {
  it('cada una de las tres opciones se registra tal cual, con fecha y responsable', async () => {
    for (const tipo of [TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.ADICIONAL, TIPO_GARANTIA.PARTICULAR]) {
      const id = await crearOrden({ tipoGarantiaElegida: tipo });
      const datos = await garantia(agente, id);
      expect(datos.tipoActual).toBe(tipo);
      expect(datos.vigente).toMatchObject({ tipo, tipoAnterior: null, origen: 'registro' });
      expect(datos.vigente.responsable).toBeTypeOf('string');
      expect(Date.parse(datos.vigente.momento)).not.toBeNaN();
      expect(datos.historial).toHaveLength(1);
    }
  });

  it('una garantia adicional elegida sin poliza registrada se acepta y deja la advertencia anotada', async () => {
    const base = await articulo('NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id)');
    const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente).send({
      ...base, modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'No enfria', tipoGarantiaElegida: 'adicional',
    }).expect(201);
    expect(creada.body.data.tipoGarantia).toBe(TIPO_GARANTIA.ADICIONAL);
    const datos = await garantia(agente, creada.body.data.id);
    expect(datos.advertencias[0]).toMatch(/^Garantia adicional \(la elegida\)/);
    expect(datos.vigente.motivo).toMatch(/Advertencias al decidir/);
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
    const id = await crearOrden({ tipoGarantiaElegida: 'proveedor' });
    await reclasificar(agente, id, { tipo: 'particular', motivo: 'El agente quiere cambiarla' }).expect(403);
    await reclasificar(consulta, id, { tipo: 'particular', motivo: 'Consulta quiere cambiarla' }).expect(403);
    expect((await garantia(agente, id)).tipoActual).toBe(TIPO_GARANTIA.PROVEEDOR);
    expect((await garantia(agente, id)).puedeReclasificar).toBe(false);
    expect((await garantia(jefatura, id)).puedeReclasificar).toBe(true);
  });

  it('exige motivo escrito', async () => {
    const id = await crearOrden({ tipoGarantiaElegida: 'proveedor' });
    const sin = await reclasificar(jefatura, id, { tipo: 'particular' });
    expect(sin.status).toBe(400);
    expect(sin.body.error.fields).toHaveProperty('motivo');
    const corto = await reclasificar(jefatura, id, { tipo: 'particular', motivo: 'porque' });
    expect(corto.status).toBe(400);
    expect((await garantia(agente, id)).tipoActual).toBe(TIPO_GARANTIA.PROVEEDOR);
  });

  it('no reclasifica a la misma clasificacion', async () => {
    const id = await crearOrden({ tipoGarantiaElegida: 'particular' });
    const respuesta = await reclasificar(jefatura, id, { tipo: 'particular', motivo: 'Lo mismo de nuevo, por error' });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.code).toBe('RECLASIFICACION_NO_PERMITIDA');
  });

  it('conserva la anterior, la nueva, el responsable, la fecha y el motivo', async () => {
    const id = await crearOrden({ tipoGarantiaElegida: 'proveedor' });
    const motivo = 'Diagnostico constato golpe; lo paga el cliente';
    await reclasificar(jefatura, id, { tipo: 'particular', motivo }).expect(200);

    const { rows } = await entorno.piscina.query<{
      accion: string; valor_anterior: string; valor_nuevo: string; motivo: string; id_usuario: string; momento: Date;
    }>(
      `SELECT accion, valor_anterior, valor_nuevo, motivo, id_usuario, momento FROM bitacora
        WHERE tabla = 'orden_servicio' AND id_registro = $1 AND campo = 'tipo_garantia' ORDER BY momento`, [id],
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ accion: 'modificar', valor_anterior: 'proveedor', valor_nuevo: 'particular' });
    // A particular no le afecta ninguna advertencia: el motivo queda tal cual.
    expect(rows[1]!.motivo).toBe(motivo);
    expect(rows[1]!.id_usuario).toBeTypeOf('string');

    const datos = await garantia(agente, id);
    expect(datos.historial.map((d: { tipo: string }) => d.tipo)).toEqual(['proveedor', 'particular']);
    expect(datos.vigente).toMatchObject({ tipoAnterior: 'proveedor', tipo: 'particular', origen: 'reclasificacion' });
    expect(datos.vigente.motivo).toContain(motivo);

    // Y se ve en el historial de la orden.
    const historial = (await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${id}/historial`).set(agente)
      .expect(200)).body.data as Array<{ titulo: string }>;
    expect(historial.some((e) => e.titulo.includes('Garantia reclasificada: proveedor → particular'))).toBe(true);
  });

  it('una orden cerrada no se reclasifica', async () => {
    const { rows } = await entorno.piscina.query<{ id: string; tipo_garantia: string }>(
      `SELECT id, tipo_garantia::text FROM orden_servicio
        WHERE estado = 'entregada' AND tipo_garantia <> 'particular' LIMIT 1`,
    );
    const respuesta = await reclasificar(jefatura, rows[0]!.id, { tipo: 'particular', motivo: 'Intento sobre una entregada' });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.message).toMatch(/nota de correccion/);
    const { rows: despues } = await entorno.piscina.query<{ tipo_garantia: string }>(
      'SELECT tipo_garantia::text FROM orden_servicio WHERE id = $1', [rows[0]!.id],
    );
    expect(despues[0]!.tipo_garantia).toBe(rows[0]!.tipo_garantia);
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
