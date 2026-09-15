/**
 * Descarga de jornada: lo que el tecnico se lleva a la calle.
 *
 * La prueba que importa no es "responde 200": es que lo que baja ALCANCE
 * para trabajar un dia entero sin cobertura. Si falta la bodega movil no
 * puede consumir repuestos; si faltan las reglas de evidencia no puede
 * saber que foto le exigen; si bajan ordenes de otro tecnico, esta viendo
 * trabajo que no es suyo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, ESTADOS_FINALES } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;

async function sesionDeTecnico(tipo: 'ruta' | 'planta'): Promise<{
  cabecera: { Authorization: string }; idTecnico: string; nombreUsuario: string;
}> {
  const { rows } = await entorno.piscina.query<{ nombre_usuario: string; id_tecnico: string }>(
    `SELECT u.nombre_usuario, t.id AS id_tecnico
       FROM tecnico t JOIN usuario u ON u.id = t.id_usuario
      WHERE t.tipo = $1 AND t.activo AND u.activo AND NOT u.bloqueado
      ORDER BY u.nombre_usuario LIMIT 1`,
    [tipo],
  );
  const fila = rows[0]!;
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario: fila.nombre_usuario, contrasena: CONTRASENA_DE_PRUEBA })
    .expect(201);
  return {
    cabecera: { Authorization: `Bearer ${sesion.body.datos.tokenAcceso}` },
    idTecnico: fila.id_tecnico,
    nombreUsuario: fila.nombre_usuario,
  };
}

beforeAll(async () => { entorno = await montarApi(); }, 240_000);
afterAll(async () => { await entorno.cerrar(); });

describe('GET /campo/jornada', () => {
  it('le baja al tecnico de ruta sus ordenes, su bodega y el catalogo', async () => {
    const { cabecera, idTecnico } = await sesionDeTecnico('ruta');

    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/campo/jornada`).set(cabecera).expect(200);
    const jornada = respuesta.body.datos;

    expect(jornada.idTecnico).toBe(idTecnico);
    // Sin bodega movil no puede descargar repuestos en el domicilio.
    expect(jornada.bodega).not.toBeNull();
    expect(jornada.repuestos.length).toBeGreaterThan(0);
    expect(jornada.reglasEvidencia.length).toBeGreaterThan(0);
    expect(typeof jornada.descargadaEn).toBe('string');
  });

  it('no baja ordenes de otros tecnicos ni ordenes ya cerradas', async () => {
    const { cabecera, idTecnico } = await sesionDeTecnico('ruta');

    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/campo/jornada`).set(cabecera).expect(200);
    const ordenes: { id: string; estado: string }[] = respuesta.body.datos.ordenes;

    const { rows } = await entorno.piscina.query<{ id: string; id_tecnico: string; estado: string }>(
      'SELECT id, id_tecnico, estado::text AS estado FROM orden_servicio WHERE id = ANY($1::uuid[])',
      [ordenes.map((orden) => orden.id)],
    );
    for (const fila of rows) {
      expect(fila.id_tecnico).toBe(idTecnico);
      // Una orden cerrada no tiene nada que hacer en la tableta.
      expect(ESTADOS_FINALES).not.toContain(fila.estado);
    }
  });

  it('las existencias que bajan son las de SU bodega movil, no las de la central', async () => {
    const { cabecera } = await sesionDeTecnico('ruta');

    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/campo/jornada`).set(cabecera).expect(200);
    const jornada = respuesta.body.datos;

    for (const existencia of jornada.existencias) {
      const { rows } = await entorno.piscina.query<{ cantidad: number }>(
        'SELECT cantidad FROM existencia WHERE id_bodega = $1 AND id_repuesto = $2',
        [jornada.bodega.id, existencia.idRepuesto],
      );
      expect(rows[0]?.cantidad).toBe(existencia.cantidad);
    }
  });

  it('el tecnico de planta tambien la descarga: usa la misma tableta', async () => {
    // Trabaja en el taller, pero registra todo por la app igual que el de ruta.
    const { cabecera } = await sesionDeTecnico('planta');
    await peticion(entorno.aplicacion).get(`${RAIZ}/campo/jornada`).set(cabecera).expect(200);
  });

  it('quien no trabaja desde la tableta no descarga jornada', async () => {
    const nombreUsuario = await usuarioConRol(entorno.piscina, CODIGO_ROL.JEFE_TECNICOS);
    const sesion = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);

    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/campo/jornada`)
      .set({ Authorization: `Bearer ${sesion.body.datos.tokenAcceso}` });

    // La jefatura de tecnicos no tiene campo.sincronizar: se corta antes.
    expect(respuesta.status).toBe(403);
  });

  it('sin sesion no se descarga nada', async () => {
    await peticion(entorno.aplicacion).get(`${RAIZ}/campo/jornada`).expect(401);
  });
});
