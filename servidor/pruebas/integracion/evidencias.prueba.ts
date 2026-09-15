/**
 * La segunda cola: las evidencias suben por partes, con reanudacion.
 *
 * El binario nunca entra en la base: la base guarda ruta, huella y
 * metadatos, y el archivo vive en el almacenamiento de objetos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { CODIGO_ROL, MODALIDAD_SERVICIO } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;
let tecnico: { Authorization: string };
let agente: { Authorization: string };

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.datos.tokenAcceso}` };
}

async function ordenNueva(): Promise<string> {
  const { rows } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
    `SELECT a.id_cliente, a.id FROM articulo a JOIN cliente c ON c.id = a.id_cliente
      WHERE c.activo AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
      LIMIT 1`,
  );
  const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
    .send({
      idCliente: rows[0]!.id_cliente, idArticulo: rows[0]!.id,
      modalidad: MODALIDAD_SERVICIO.RUTA, fallaReportada: 'Para probar la carga de evidencias',
    }).expect(201);
  return creada.body.datos.id;
}

/** Sube el archivo por trozos, como haria el movil con mala senal. */
async function subirPorPartes(
  idCarga: string, contenido: Buffer, tamanoDeParte: number,
): Promise<number> {
  let enviados = 0;
  while (enviados < contenido.length) {
    const parte = contenido.subarray(enviados, enviados + tamanoDeParte);
    const respuesta = await peticion(entorno.aplicacion)
      .patch(`${RAIZ}/evidencias/cargas/${idCarga}`)
      .set(tecnico)
      .set('Content-Type', 'application/octet-stream')
      .set('X-Desplazamiento', String(enviados))
      .send(parte).expect(200);
    enviados = respuesta.body.datos.bytesRecibidos;
  }
  return enviados;
}

beforeAll(async () => {
  entorno = await montarApi();
  tecnico = await sesionDe(CODIGO_ROL.TECNICO_RUTA);
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
});

afterAll(async () => { await entorno.cerrar(); });

describe('carga por partes con reanudacion', () => {
  it('sube una foto en trozos y la cierra verificando la huella', async () => {
    const idOrden = await ordenNueva();
    const contenido = randomBytes(9_000);
    const huella = createHash('sha256').update(contenido).digest('hex');

    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'foto_articulo', tipo: 'foto',
        bytes: contenido.length, huellaDigital: huella,
        momentoDispositivo: new Date().toISOString(),
        latitud: 12.13, longitud: -86.25,
      }).expect(201);

    expect(carga.body.datos.bytesRecibidos).toBe(0);
    expect(carga.body.datos.completa).toBe(false);
    const { idCarga, idEvidencia } = carga.body.datos;

    // La evidencia ya consta, sin archivo: si el telefono muere a mitad de
    // la subida, el taller igual sabe que esa foto existe y falta.
    const antes = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${idOrden}/evidencias`).set(tecnico).expect(200);
    const pendiente = antes.body.datos.find((e: { id: string }) => e.id === idEvidencia);
    expect(pendiente.sincronizada).toBe(false);
    expect(pendiente.rutaArchivo).toBeNull();

    const enviados = await subirPorPartes(idCarga, contenido, 2_048);
    expect(enviados).toBe(contenido.length);

    const cerrada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${idCarga}/cerrar`).set(tecnico)
      .send({ idEvidencia }).expect(200);

    expect(cerrada.body.datos.sincronizada).toBe(true);
    expect(cerrada.body.datos.huellaDigital).toBe(huella);
    expect(cerrada.body.datos.bytes).toBe(contenido.length);
    // La base guarda la RUTA, no el binario.
    expect(cerrada.body.datos.rutaArchivo).toMatch(/^ordenes\//);
  });

  it('el dispositivo puede preguntar desde que byte reanudar', async () => {
    const idOrden = await ordenNueva();
    const contenido = randomBytes(5_000);
    const huella = createHash('sha256').update(contenido).digest('hex');

    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'firma_cliente', tipo: 'firma',
        bytes: contenido.length, huellaDigital: huella,
        momentoDispositivo: new Date().toISOString(),
      }).expect(201);
    const { idCarga } = carga.body.datos;

    // Se corta la conexion a mitad de camino.
    await peticion(entorno.aplicacion).patch(`${RAIZ}/evidencias/cargas/${idCarga}`)
      .set(tecnico).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '0')
      .send(contenido.subarray(0, 2_000)).expect(200);

    const estado = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/evidencias/cargas/${idCarga}`).set(tecnico).expect(200);
    expect(estado.body.datos.bytesRecibidos).toBe(2_000);
    expect(estado.body.datos.completa).toBe(false);

    // Reanuda exactamente desde ahi.
    await peticion(entorno.aplicacion).patch(`${RAIZ}/evidencias/cargas/${idCarga}`)
      .set(tecnico).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '2000')
      .send(contenido.subarray(2_000)).expect(200);

    const completa = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/evidencias/cargas/${idCarga}`).set(tecnico).expect(200);
    expect(completa.body.datos.bytesRecibidos).toBe(contenido.length);
    expect(completa.body.datos.completa).toBe(true);

    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${idCarga}/cerrar`).set(tecnico)
      .send({ idEvidencia: carga.body.datos.idEvidencia }).expect(200);
  });

  it('reanudar desde el byte equivocado se rechaza en lugar de corromper el archivo', async () => {
    const idOrden = await ordenNueva();
    const contenido = randomBytes(3_000);
    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'foto_falla', tipo: 'foto', bytes: contenido.length,
        huellaDigital: createHash('sha256').update(contenido).digest('hex'),
        momentoDispositivo: new Date().toISOString(),
      }).expect(201);

    await peticion(entorno.aplicacion).patch(`${RAIZ}/evidencias/cargas/${carga.body.datos.idCarga}`)
      .set(tecnico).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '0')
      .send(contenido.subarray(0, 1_000)).expect(200);

    const desfasada = await peticion(entorno.aplicacion)
      .patch(`${RAIZ}/evidencias/cargas/${carga.body.datos.idCarga}`)
      .set(tecnico).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '2500')
      .send(contenido.subarray(2_500));

    expect(desfasada.status).toBe(422);
    expect(desfasada.body.error.codigo).toBe('DESPLAZAMIENTO_INCORRECTO');
    expect(desfasada.body.error.mensaje).toMatch(/Reanude desde el byte 1000/);
  });

  it('un archivo que no casa con su huella no se da por bueno', async () => {
    const idOrden = await ordenNueva();
    const contenido = randomBytes(1_500);
    const huellaDeOtroArchivo = createHash('sha256').update(randomBytes(1_500)).digest('hex');

    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'documento_factura', tipo: 'documento',
        bytes: contenido.length, huellaDigital: huellaDeOtroArchivo,
        momentoDispositivo: new Date().toISOString(),
      }).expect(201);

    await subirPorPartes(carga.body.datos.idCarga, contenido, 1_500);

    const cerrada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${carga.body.datos.idCarga}/cerrar`).set(tecnico)
      .send({ idEvidencia: carga.body.datos.idEvidencia });

    expect(cerrada.status).toBe(422);
    expect(cerrada.body.error.codigo).toBe('HUELLA_NO_COINCIDE');
    expect(cerrada.body.error.mensaje).toMatch(/volver a subirlo/);
  });

  it('no se cierra una carga incompleta', async () => {
    const idOrden = await ordenNueva();
    const contenido = randomBytes(4_000);
    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'foto_entrega', tipo: 'foto', bytes: contenido.length,
        huellaDigital: createHash('sha256').update(contenido).digest('hex'),
        momentoDispositivo: new Date().toISOString(),
      }).expect(201);

    await peticion(entorno.aplicacion).patch(`${RAIZ}/evidencias/cargas/${carga.body.datos.idCarga}`)
      .set(tecnico).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '0')
      .send(contenido.subarray(0, 1_000)).expect(200);

    const cerrada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${carga.body.datos.idCarga}/cerrar`).set(tecnico)
      .send({ idEvidencia: carga.body.datos.idEvidencia });

    expect(cerrada.status).toBe(422);
    expect(cerrada.body.error.codigo).toBe('CARGA_INCOMPLETA');
  });

  it('una carga que no existe se avisa, no revienta', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/evidencias/cargas/00000000-0000-4000-8000-000000000000`).set(tecnico);
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.mensaje).toMatch(/Vuelva a iniciarla/);
  });

  it('un agente de telefonia no carga evidencias de campo', async () => {
    const idOrden = await ordenNueva();
    await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(agente)
      .send({
        idOrden, clave: 'foto_articulo', tipo: 'foto', bytes: 10,
        huellaDigital: 'a'.repeat(64), momentoDispositivo: new Date().toISOString(),
      }).expect(403);
  });
});
