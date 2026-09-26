/**
 * Los diecisiete reportes, ejecutados de verdad contra la base.
 *
 * ESTA ES LA PRUEBA QUE IMPORTA DE ESTE MODULO. Un reporte es una consulta
 * SQL escrita a mano: no hay tipos que la protejan, y un nombre de columna
 * mal escrito o un parametro de mas no se ve hasta que alguien abre esa
 * pantalla —normalmente, delante de la jefatura—. Correr los diecisiete
 * contra datos reales atrapa esa clase entera de error de una sola vez.
 *
 * Fue asi como aparecio el desajuste de parametros en `inventario_critico`,
 * que no declara `$1` ni `$2` y recibia dos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';
import { REPORTES } from '../../src/modulos/reportes/catalogo.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;
let admin: { Authorization: string };
let tecnico: { Authorization: string };

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.datos.tokenAcceso}` };
}

beforeAll(async () => {
  entorno = await montarApi();
  admin = await sesionDe(CODIGO_ROL.ADMINISTRADOR);
  tecnico = await sesionDe(CODIGO_ROL.TECNICO_RUTA);
});

afterAll(async () => { await entorno.cerrar(); });

describe('reportes', () => {
  it('el catalogo anuncia exactamente los reportes que existen', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/reportes`).set(admin).expect(200);

    expect(respuesta.body.datos).toHaveLength(REPORTES.length);
    // Cada uno dice para que sirve: un reporte sin proposito escrito nadie
    // sabe cuando usarlo, y termina siendo uno mas en una lista larga.
    for (const definicion of respuesta.body.datos) {
      expect(definicion.proposito.length).toBeGreaterThan(15);
    }
  });

  // Uno por reporte, para que el fallo diga CUAL se rompio.
  for (const reporte of REPORTES) {
    it(`«${reporte.titulo}» se ejecuta y devuelve sus columnas`, async () => {
      const respuesta = await peticion(entorno.aplicacion)
        .get(`${RAIZ}/reportes/${reporte.clave}`).set(admin).expect(200);

      const datos = respuesta.body.datos;
      expect(datos.clave).toBe(reporte.clave);
      expect(datos.columnas.map((c: { clave: string }) => c.clave))
        .toEqual(reporte.columnas.map((c) => c.clave));

      // Toda fila trae TODAS las columnas declaradas. Si una consulta deja
      // de devolver una columna, el panel pintaria una celda vacia sin que
      // nadie se entere.
      for (const fila of datos.filas) {
        expect(Object.keys(fila).sort()).toEqual(reporte.columnas.map((c) => c.clave).sort());
      }
    });
  }

  it('el rango se aplica y reduce el resultado', async () => {
    const completo = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/reportes/ordenes_por_estado`).set(admin).expect(200);
    const total = (filas: { ordenes: number }[]): number =>
      filas.reduce((suma, fila) => suma + fila.ordenes, 0);

    const recorte = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/reportes/ordenes_por_estado?desde=2099-01-01&hasta=2099-12-31`)
      .set(admin).expect(200);

    expect(total(completo.body.datos.filas)).toBeGreaterThan(0);
    // Un rango en el futuro no puede contener ordenes.
    expect(total(recorte.body.datos.filas)).toBe(0);
  });

  it('un reporte que no admite rango ignora las fechas en vez de fallar', async () => {
    // `inventario_critico` es una foto de hoy. Mandarle fechas es un error
    // de quien llama, no algo que deba tumbar la consulta.
    await peticion(entorno.aplicacion)
      .get(`${RAIZ}/reportes/inventario_critico?desde=2020-01-01&hasta=2020-12-31`)
      .set(admin).expect(200);
  });

  it('un reporte inexistente da 404, no un error de base', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/reportes/no_existe_este`).set(admin).expect(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('un tecnico no consulta reportes', async () => {
    await peticion(entorno.aplicacion)
      .get(`${RAIZ}/reportes/ordenes_por_estado`).set(tecnico).expect(403);
  });
});
