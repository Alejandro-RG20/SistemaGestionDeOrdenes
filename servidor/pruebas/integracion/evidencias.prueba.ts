/**
 * La segunda cola: las evidencias suben por partes, con reanudacion.
 *
 * El binario nunca entra en la base: la base guarda ruta, huella y
 * metadatos, y el archivo vive en el almacenamiento de objetos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { CODIGO_ROL, MODALIDAD_SERVICIO, TIPO_OPERACION } from '@servitotal/compartido';
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
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}

/**
 * Una orden nueva, ASIGNADA al tecnico que va a trabajarla.
 *
 * La asignacion no es adorno de la prueba: desde que existe el cerco por
 * datos (§13), un tecnico no toca —ni para leer ni para subir fotos— una
 * orden que no es suya. Antes esta prueba levantaba la orden con el agente y
 * se la dejaba sin asignar, y el tecnico le subia evidencias igual. Eso era
 * justamente el agujero: una foto colgada de la orden de otro.
 */
async function ordenNueva(): Promise<string> {
  const { rows } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
    `SELECT a.id_cliente, a.id FROM articulo a JOIN cliente c ON c.id = a.id_cliente
      WHERE c.activo AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
        -- Garantia del proveedor aplicable: tienda del grupo y compra reciente.
        AND a.activo AND a.fecha_compra > current_date - interval '3 months'
        AND EXISTS (SELECT 1 FROM tienda_origen t WHERE t.id = a.id_tienda_origen AND t.pertenece_al_grupo)
        AND NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id AND cb.activa AND cb.tipo = 'proveedor')
      LIMIT 1`,
  );
  const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
    .send({
      idCliente: rows[0]!.id_cliente, idArticulo: rows[0]!.id,
      modalidad: MODALIDAD_SERVICIO.RUTA, tipoGarantiaElegida: 'proveedor', fallaReportada: 'Para probar la carga de evidencias',
    }).expect(201);

  await asignarAlTecnicoDeLaSesion(creada.body.data.id);
  return creada.body.data.id;
}

/**
 * Asigna la orden al tecnico cuya sesion usan estas pruebas.
 *
 * Se hace por la base y no por la API porque el tecnico no tiene
 * `ordenes.asignar` —y no debe tenerlo—, y montar aqui una sesion de
 * jefatura solo para asignar añadiria ruido a una prueba que es sobre
 * evidencias.
 */
async function asignarAlTecnicoDeLaSesion(idOrden: string): Promise<void> {
  const token = tecnico.Authorization.replace('Bearer ', '');
  const carga = JSON.parse(
    Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
  ) as { sub: string };

  const { rows } = await entorno.piscina.query<{ id: string }>(
    'SELECT id FROM tecnico WHERE id_usuario = $1 AND activo', [carga.sub],
  );
  if (rows[0] === undefined) throw new Error('La sesion de pruebas no es de un tecnico con ficha.');

  await entorno.piscina.query(
    'UPDATE orden_servicio SET id_tecnico = $2 WHERE id = $1', [idOrden, rows[0].id],
  );
}

/**
 * Sesion atada a un dispositivo, que es lo que el servidor exige para
 * aceptar la cola de operaciones (RF-05: revocacion remota).
 */
async function sesionDeDispositivo(): Promise<{ Authorization: string }> {
  const { rows } = await entorno.piscina.query<{
    nombre_usuario: string; identificador: string;
  }>(
    `SELECT u.nombre_usuario, d.identificador
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
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}

/**
 * Bytes que el servidor reconoce como JPEG: la firma del formato y relleno al
 * azar. Desde la migracion 0023 el servidor rechaza lo que no es imagen ni
 * PDF, asi que un bloque de bytes aleatorios ya no pasa por fotografia.
 */
function fotoDePrueba(bytes: number): Buffer {
  const contenido = randomBytes(bytes);
  contenido[0] = 0xff; contenido[1] = 0xd8; contenido[2] = 0xff; contenido[3] = 0xe0;
  return contenido;
}

/** Sube el archivo por trozos, como haria el movil con mala senal. */
async function subirPorPartes(
  idCarga: string, contenido: Buffer, tamanoDeParte: number,
  sesion: { Authorization: string } = tecnico,
): Promise<number> {
  let enviados = 0;
  while (enviados < contenido.length) {
    const parte = contenido.subarray(enviados, enviados + tamanoDeParte);
    const respuesta = await peticion(entorno.aplicacion)
      .patch(`${RAIZ}/evidencias/cargas/${idCarga}`)
      .set(sesion)
      .set('Content-Type', 'application/octet-stream')
      .set('X-Desplazamiento', String(enviados))
      .send(parte).expect(200);
    enviados = respuesta.body.data.bytesRecibidos;
  }
  return enviados;
}

beforeAll(async () => {
  entorno = await montarApi();
  tecnico = await sesionDe(CODIGO_ROL.TECNICO_RUTA);
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
});

afterAll(async () => { await entorno.cerrar(); });

describe('solo se admiten imagenes y PDF', () => {
  it('rechaza un archivo que no es imagen ni PDF, aunque diga que es una foto', async () => {
    const idOrden = await ordenNueva();
    // Un ejecutable de Windows: empieza con «MZ».
    const contenido = Buffer.concat([Buffer.from('MZ'), randomBytes(2_000)]);
    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'foto_articulo', tipo: 'foto', bytes: contenido.length,
        huellaDigital: createHash('sha256').update(contenido).digest('hex'),
        momentoDispositivo: new Date().toISOString(),
      }).expect(201);

    const parte = await peticion(entorno.aplicacion)
      .patch(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}`).set(tecnico)
      .set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '0')
      .send(contenido);
    expect(parte.status).toBe(422);
    expect(parte.body.error.code).toBe('ARCHIVO_NO_ADMITIDO');

    // Y no se da por guardada: sigue pendiente, sin archivo.
    const lista = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${idOrden}/evidencias`).set(tecnico).expect(200);
    const registrada = lista.body.data.find((e: { id: string }) => e.id === carga.body.data.idEvidencia);
    expect(registrada.sincronizada).toBe(false);
    expect(registrada.rutaArchivo).toBeNull();
  });

  it('acepta un PDF', async () => {
    const idOrden = await ordenNueva();
    const contenido = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(1_200)]);
    const huella = createHash('sha256').update(contenido).digest('hex');
    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'factura_compra', tipo: 'documento', bytes: contenido.length,
        huellaDigital: huella, momentoDispositivo: new Date().toISOString(),
      }).expect(201);
    await subirPorPartes(carga.body.data.idCarga, contenido, 1_024);
    const cerrada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}/cerrar`).set(tecnico)
      .send({ idEvidencia: carga.body.data.idEvidencia }).expect(200);
    expect(cerrada.body.data.sincronizada).toBe(true);
  });

  it('una evidencia registrada no se puede borrar ni desde la base', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>('SELECT id FROM evidencia LIMIT 1');
    await expect(entorno.piscina.query('DELETE FROM evidencia WHERE id = $1', [rows[0]!.id]))
      .rejects.toThrow(/no se modifican ni se borran/);
  });
});

describe('carga por partes con reanudacion', () => {
  it('sube una foto en trozos y la cierra verificando la huella', async () => {
    const idOrden = await ordenNueva();
    const contenido = fotoDePrueba(9_000);
    const huella = createHash('sha256').update(contenido).digest('hex');

    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'foto_articulo', tipo: 'foto',
        bytes: contenido.length, huellaDigital: huella,
        momentoDispositivo: new Date().toISOString(),
        latitud: 12.13, longitud: -86.25,
      }).expect(201);

    expect(carga.body.data.bytesRecibidos).toBe(0);
    expect(carga.body.data.completa).toBe(false);
    const { idCarga, idEvidencia } = carga.body.data;

    // La evidencia ya consta, sin archivo: si el telefono muere a mitad de
    // la subida, el taller igual sabe que esa foto existe y falta.
    const antes = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${idOrden}/evidencias`).set(tecnico).expect(200);
    const pendiente = antes.body.data.find((e: { id: string }) => e.id === idEvidencia);
    expect(pendiente.sincronizada).toBe(false);
    expect(pendiente.rutaArchivo).toBeNull();

    const enviados = await subirPorPartes(idCarga, contenido, 2_048);
    expect(enviados).toBe(contenido.length);

    const cerrada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${idCarga}/cerrar`).set(tecnico)
      .send({ idEvidencia }).expect(200);

    expect(cerrada.body.data.sincronizada).toBe(true);
    expect(cerrada.body.data.huellaDigital).toBe(huella);
    expect(cerrada.body.data.bytes).toBe(contenido.length);
    // La base guarda la RUTA, no el binario.
    expect(cerrada.body.data.rutaArchivo).toMatch(/^ordenes\//);
  });

  /**
   * Una fotografia llega por DOS colas: la ficha por la de operaciones, el
   * archivo por la de cargas. El servidor tiene que reconocerla como una
   * sola, o cada foto dejaria dos filas —una huerfana sin archivo y otra
   * completa— y el expediente de cobro se leeria como incompleto teniendo
   * todo. La identidad es la huella, que el dispositivo calcula una vez.
   */
  it('la ficha y el archivo de una misma foto no crean dos evidencias', async () => {
    const idOrden = await ordenNueva();
    const contenido = fotoDePrueba(3_000);
    const huella = createHash('sha256').update(contenido).digest('hex');
    const momento = new Date().toISOString();

    // Primero la ficha, por la cola de operaciones: es el orden en que lo
    // manda el dispositivo. Ficha y archivo los manda el MISMO tecnico desde
    // su dispositivo, y la orden es suya: la cola tambien aplica el cerco
    // por datos y rechaza operaciones sobre ordenes ajenas.
    const movil = await sesionDeDispositivo();
    await entorno.piscina.query(
      `UPDATE orden_servicio SET id_tecnico = (
         SELECT t.id FROM dispositivo d JOIN tecnico t ON t.id_usuario = d.id_usuario
          WHERE d.revocado_en IS NULL AND t.tipo = 'ruta' ORDER BY d.identificador LIMIT 1)
        WHERE id = $1`, [idOrden],
    );
    const cola = await peticion(entorno.aplicacion).post(`${RAIZ}/sincronizacion/cola`)
      .set(movil)
      .send({
        operaciones: [{
          idOperacion: randomUUID(),
          tipoOperacion: TIPO_OPERACION.EVIDENCIA_REGISTRAR,
          momentoDispositivo: momento,
          carga: {
            idOrden, clave: 'foto_falla', tipo: 'foto',
            bytes: contenido.length, huellaDigital: huella,
          },
        }],
      }).expect(200);
    expect(cola.body.data.aplicadas).toBe(1);

    // Y despues el archivo. Se tiene que colgar de la ficha que ya existe.
    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(movil)
      .send({
        idOrden, clave: 'foto_falla', tipo: 'foto',
        bytes: contenido.length, huellaDigital: huella, momentoDispositivo: momento,
      }).expect(201);

    await subirPorPartes(carga.body.data.idCarga, contenido, 1_024, movil);
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}/cerrar`).set(movil)
      .send({ idEvidencia: carga.body.data.idEvidencia }).expect(200);

    const listadas = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${idOrden}/evidencias`).set(movil).expect(200);
    const deEsaFoto = listadas.body.data
      .filter((e: { clave: string }) => e.clave === 'foto_falla');

    expect(deEsaFoto).toHaveLength(1);
    expect(deEsaFoto[0].sincronizada).toBe(true);
    expect(deEsaFoto[0].huellaDigital).toBe(huella);
  });

  /**
   * Y al reves: una segunda toma de la MISMA clave —porque la primera salio
   * movida— es otra evidencia. La huella es distinta, asi que no se
   * confunden. Perder la repetida seria perder la buena.
   */
  it('dos tomas distintas de la misma clave siguen siendo dos evidencias', async () => {
    const idOrden = await ordenNueva();

    for (const contenido of [fotoDePrueba(1_500), fotoDePrueba(1_700)]) {
      const huella = createHash('sha256').update(contenido).digest('hex');
      const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`)
        .set(tecnico)
        .send({
          idOrden, clave: 'foto_articulo', tipo: 'foto',
          bytes: contenido.length, huellaDigital: huella,
          momentoDispositivo: new Date().toISOString(),
        }).expect(201);
      await subirPorPartes(carga.body.data.idCarga, contenido, 1_024);
      await peticion(entorno.aplicacion)
        .post(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}/cerrar`).set(tecnico)
        .send({ idEvidencia: carga.body.data.idEvidencia }).expect(200);
    }

    const listadas = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${idOrden}/evidencias`).set(tecnico).expect(200);
    expect(listadas.body.data
      .filter((e: { clave: string }) => e.clave === 'foto_articulo')).toHaveLength(2);
  });

  it('el dispositivo puede preguntar desde que byte reanudar', async () => {
    const idOrden = await ordenNueva();
    const contenido = fotoDePrueba(5_000);
    const huella = createHash('sha256').update(contenido).digest('hex');

    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'firma_cliente', tipo: 'firma',
        bytes: contenido.length, huellaDigital: huella,
        momentoDispositivo: new Date().toISOString(),
      }).expect(201);
    const { idCarga } = carga.body.data;

    // Se corta la conexion a mitad de camino.
    await peticion(entorno.aplicacion).patch(`${RAIZ}/evidencias/cargas/${idCarga}`)
      .set(tecnico).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '0')
      .send(contenido.subarray(0, 2_000)).expect(200);

    const estado = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/evidencias/cargas/${idCarga}`).set(tecnico).expect(200);
    expect(estado.body.data.bytesRecibidos).toBe(2_000);
    expect(estado.body.data.completa).toBe(false);

    // Reanuda exactamente desde ahi.
    await peticion(entorno.aplicacion).patch(`${RAIZ}/evidencias/cargas/${idCarga}`)
      .set(tecnico).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '2000')
      .send(contenido.subarray(2_000)).expect(200);

    const completa = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/evidencias/cargas/${idCarga}`).set(tecnico).expect(200);
    expect(completa.body.data.bytesRecibidos).toBe(contenido.length);
    expect(completa.body.data.completa).toBe(true);

    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${idCarga}/cerrar`).set(tecnico)
      .send({ idEvidencia: carga.body.data.idEvidencia }).expect(200);
  });

  it('reanudar desde el byte equivocado se rechaza en lugar de corromper el archivo', async () => {
    const idOrden = await ordenNueva();
    const contenido = fotoDePrueba(3_000);
    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'foto_falla', tipo: 'foto', bytes: contenido.length,
        huellaDigital: createHash('sha256').update(contenido).digest('hex'),
        momentoDispositivo: new Date().toISOString(),
      }).expect(201);

    await peticion(entorno.aplicacion).patch(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}`)
      .set(tecnico).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '0')
      .send(contenido.subarray(0, 1_000)).expect(200);

    const desfasada = await peticion(entorno.aplicacion)
      .patch(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}`)
      .set(tecnico).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '2500')
      .send(contenido.subarray(2_500));

    expect(desfasada.status).toBe(422);
    expect(desfasada.body.error.code).toBe('DESPLAZAMIENTO_INCORRECTO');
    expect(desfasada.body.error.message).toMatch(/Reanude desde el byte 1000/);
  });

  it('un archivo que no casa con su huella no se da por bueno', async () => {
    const idOrden = await ordenNueva();
    const contenido = fotoDePrueba(1_500);
    const huellaDeOtroArchivo = createHash('sha256').update(fotoDePrueba(1_500)).digest('hex');

    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'documento_factura', tipo: 'documento',
        bytes: contenido.length, huellaDigital: huellaDeOtroArchivo,
        momentoDispositivo: new Date().toISOString(),
      }).expect(201);

    await subirPorPartes(carga.body.data.idCarga, contenido, 1_500);

    const cerrada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}/cerrar`).set(tecnico)
      .send({ idEvidencia: carga.body.data.idEvidencia });

    expect(cerrada.status).toBe(422);
    expect(cerrada.body.error.code).toBe('HUELLA_NO_COINCIDE');
    expect(cerrada.body.error.message).toMatch(/volver a subirlo/);
  });

  it('no se cierra una carga incompleta', async () => {
    const idOrden = await ordenNueva();
    const contenido = fotoDePrueba(4_000);
    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'foto_entrega', tipo: 'foto', bytes: contenido.length,
        huellaDigital: createHash('sha256').update(contenido).digest('hex'),
        momentoDispositivo: new Date().toISOString(),
      }).expect(201);

    await peticion(entorno.aplicacion).patch(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}`)
      .set(tecnico).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '0')
      .send(contenido.subarray(0, 1_000)).expect(200);

    const cerrada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}/cerrar`).set(tecnico)
      .send({ idEvidencia: carga.body.data.idEvidencia });

    expect(cerrada.status).toBe(422);
    expect(cerrada.body.error.code).toBe('CARGA_INCOMPLETA');
  });

  it('una carga que no existe se avisa, no revienta', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/evidencias/cargas/00000000-0000-4000-8000-000000000000`).set(tecnico);
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.message).toMatch(/Vuelva a iniciarla/);
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

/**
 * El cerco por datos sobre la evidencia (§13).
 *
 * Esta prueba existe por lo que descubrio la anterior: el tecnico no podia
 * LISTAR las evidencias de una orden ajena pero si SUBIRLE fotos. La puerta
 * de escritura era la peor de las dos: una foto colgada de la orden de otro
 * acaba en el expediente de cobro de ese otro, y nadie la encuentra buscando
 * donde se tomo.
 */
describe('un tecnico no toca la evidencia de una orden ajena', () => {
  async function ordenDeOtro(): Promise<string> {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      `SELECT o.id FROM orden_servicio o
        WHERE o.id_tecnico IS NOT NULL
          AND o.id_tecnico <> (
            SELECT t.id FROM tecnico t
              JOIN usuario u ON u.id = t.id_usuario
             WHERE u.nombre_usuario = (
               SELECT u2.nombre_usuario FROM usuario u2
                 JOIN rol r ON r.id = u2.id_rol
                WHERE r.codigo = 'tecnico_ruta' AND u2.activo
                ORDER BY u2.nombre_usuario LIMIT 1
             ))
        LIMIT 1`,
    );
    return rows[0]!.id;
  }

  it('no puede iniciar una carga sobre ella', async () => {
    const idOrden = await ordenDeOtro();
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas`).set(tecnico)
      .send({
        idOrden, clave: 'foto_articulo', tipo: 'foto',
        huellaDigital: 'a'.repeat(64), bytes: 10,
        momentoDispositivo: new Date().toISOString(),
      });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.code).toBe('SIN_PERMISO');
  });

  it('ni listar las que ya tiene', async () => {
    const idOrden = await ordenDeOtro();
    await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${idOrden}/evidencias`).set(tecnico).expect(403);
  });
});
