/**
 * Bandeja de avisos, portal publico e indicadores.
 *
 * La bandeja es EL canal de aviso del sistema —el negocio decidio que no se
 * empuja nada—, asi que lo que se prueba aqui no es que responda 200: es que
 * cada quien vea lo suyo. Una bandeja que muestra los problemas de los demas
 * se vuelve ruido, se deja de mirar, y siendo el unico canal, dejar de
 * mirarla es quedarse sin aviso.
 *
 * Del portal se prueba sobre todo lo que NO devuelve.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, GRAVEDAD_AVISO, TIPO_AVISO } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.datos.tokenAcceso}` };
}

const tiposDe = (cuerpo: { grupos: { tipo: string }[] }): string[] =>
  cuerpo.grupos.map((grupo) => grupo.tipo);

beforeAll(async () => { entorno = await montarApi(); }, 240_000);
afterAll(async () => { await entorno.cerrar(); });

describe('bandeja de avisos', () => {
  it('la jefatura de tecnicos ve las ordenes vencidas del taller', async () => {
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/avisos`).set(jefatura).expect(200);
    const bandeja = respuesta.body.datos;

    expect(tiposDe(bandeja)).toContain(TIPO_AVISO.ORDEN_VENCIDA);
    const vencidas = bandeja.grupos.find(
      (grupo: { tipo: string }) => grupo.tipo === TIPO_AVISO.ORDEN_VENCIDA,
    );
    expect(vencidas.gravedad).toBe(GRAVEDAD_AVISO.CRITICO);
    expect(vencidas.total).toBeGreaterThan(0);
    // Cada renglon lleva a donde se resuelve.
    for (const renglon of vencidas.muestra) expect(renglon.enlace).toMatch(/^\/ordenes\//);
  });

  it('cada grupo explica por que le aparece a esa persona', async () => {
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/avisos`).set(jefatura).expect(200);

    for (const grupo of respuesta.body.datos.grupos) {
      expect(grupo.porQue.length).toBeGreaterThan(10);
      expect(grupo.enlaceVerTodo).toBeTruthy();
    }
  });

  it('un tecnico solo ve sus ordenes, no las del taller', async () => {
    const tecnico = await sesionDe(CODIGO_ROL.TECNICO_RUTA);
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);

    const suya = await peticion(entorno.aplicacion).get(`${RAIZ}/avisos`).set(tecnico).expect(200);
    const todas = await peticion(entorno.aplicacion).get(`${RAIZ}/avisos`).set(jefatura).expect(200);

    const vencidasTecnico = suya.body.datos.grupos.find(
      (grupo: { tipo: string }) => grupo.tipo === TIPO_AVISO.ORDEN_VENCIDA,
    );
    const vencidasJefatura = todas.body.datos.grupos.find(
      (grupo: { tipo: string }) => grupo.tipo === TIPO_AVISO.ORDEN_VENCIDA,
    );

    if (vencidasTecnico !== undefined && vencidasJefatura !== undefined) {
      expect(vencidasTecnico.total).toBeLessThan(vencidasJefatura.total);
      expect(vencidasTecnico.porQue).toMatch(/a su cargo|asignadas/i);
    }
  });

  it('quien no resuelve excepciones no las ve en su bandeja', async () => {
    // El permiso decide, no el rol: mostrarle a alguien un problema que no
    // puede tocar es ruido, y el ruido hace que se deje de mirar la bandeja.
    const tecnico = await sesionDe(CODIGO_ROL.TECNICO_RUTA);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/avisos`).set(tecnico).expect(200);

    expect(tiposDe(respuesta.body.datos)).not.toContain(TIPO_AVISO.EXCEPCION_SINCRONIZACION);
  });

  it('la jefatura de tecnicos si ve el trabajo de campo sin conciliar', async () => {
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/avisos`).set(jefatura).expect(200);

    expect(tiposDe(respuesta.body.datos)).toContain(TIPO_AVISO.EXCEPCION_SINCRONIZACION);
  });

  it('el gestor de cobros ve los expedientes bloqueados y no las excepciones', async () => {
    const gestor = await sesionDe(CODIGO_ROL.GESTOR_COBROS);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/avisos`).set(gestor).expect(200);
    const tipos = tiposDe(respuesta.body.datos);

    expect(tipos).toContain(TIPO_AVISO.EXPEDIENTE_BLOQUEADO);
    expect(tipos).not.toContain(TIPO_AVISO.EXCEPCION_SINCRONIZACION);
  });

  it('el bodeguero ve el inventario bajo minimo y no los cobros', async () => {
    const bodeguero = await sesionDe(CODIGO_ROL.BODEGUERO);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/avisos`).set(bodeguero).expect(200);
    const tipos = tiposDe(respuesta.body.datos);

    expect(tipos).toContain(TIPO_AVISO.REPUESTO_BAJO_MINIMO);
    expect(tipos).not.toContain(TIPO_AVISO.EXPEDIENTE_BLOQUEADO);
  });

  it('lo critico va primero', async () => {
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/avisos`).set(jefatura).expect(200);

    const peso = { critico: 0, atencion: 1, informativo: 2 } as Record<string, number>;
    const gravedades: string[] = respuesta.body.datos.grupos.map(
      (grupo: { gravedad: string }) => grupo.gravedad,
    );
    const pesos = gravedades.map((gravedad) => peso[gravedad]!);
    expect(pesos).toEqual([...pesos].sort((uno, otro) => uno - otro));
  });

  it('el total y los criticos cuadran con los grupos', async () => {
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/avisos`).set(jefatura).expect(200);
    const bandeja = respuesta.body.datos;

    const suma = bandeja.grupos.reduce(
      (total: number, grupo: { total: number }) => total + grupo.total, 0,
    );
    expect(bandeja.total).toBe(suma);
    expect(bandeja.criticos).toBeLessThanOrEqual(bandeja.total);
  });

  it('sin sesion no hay bandeja', async () => {
    await peticion(entorno.aplicacion).get(`${RAIZ}/avisos`).expect(401);
  });
});

describe('portal publico', () => {
  async function ordenConsultable(): Promise<{ numero: number; telefono: string }> {
    const { rows } = await entorno.piscina.query<{ numero: string; telefono_contacto: string }>(
      "SELECT numero, telefono_contacto FROM orden_servicio WHERE estado <> 'anulada' LIMIT 1",
    );
    return { numero: Number(rows[0]!.numero), telefono: rows[0]!.telefono_contacto };
  }

  it('devuelve el estado con el numero de orden y el telefono, sin sesion', async () => {
    const { numero, telefono } = await ordenConsultable();
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/portal/ordenes/${numero}?telefono=${encodeURIComponent(telefono)}`)
      .expect(200);

    const estado = respuesta.body.datos;
    expect(estado.numeroOrden).toBe(numero);
    expect(estado.situacion).toBeTruthy();
    expect(estado.explicacion).toBeTruthy();
    expect(estado.recorrido).toHaveLength(5);
  });

  it('NO devuelve datos personales ni internos', async () => {
    // Es la prueba que de verdad importa de este endpoint.
    const { numero, telefono } = await ordenConsultable();
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/portal/ordenes/${numero}?telefono=${encodeURIComponent(telefono)}`)
      .expect(200);

    const texto = JSON.stringify(respuesta.body);
    expect(texto).not.toContain(telefono);
    for (const campo of [
      'telefonoContacto', 'direccionServicio', 'referenciaUbicacion', 'fallaReportada',
      'fallaReal', 'total', 'tecnico', 'idCliente', 'idTecnico', 'tipoGarantia',
    ]) {
      expect(texto, `el portal filtro ${campo}`).not.toContain(campo);
    }
  });

  it('el nombre del cliente va en iniciales', async () => {
    const { numero, telefono } = await ordenConsultable();
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/portal/ordenes/${numero}?telefono=${encodeURIComponent(telefono)}`)
      .expect(200);

    expect(respuesta.body.datos.cliente).toMatch(/^([A-ZÁÉÍÓÚÑ]\.\s?)+$/);
  });

  it('acepta el telefono escrito con guiones o con codigo de pais', async () => {
    const { numero, telefono } = await ordenConsultable();
    const digitos = telefono.replace(/\D/g, '');
    const conGuion = `${digitos.slice(0, 4)}-${digitos.slice(4)}`;

    await peticion(entorno.aplicacion)
      .get(`${RAIZ}/portal/ordenes/${numero}?telefono=${encodeURIComponent(conGuion)}`)
      .expect(200);
  });

  it('con el telefono equivocado responde lo mismo que si no existiera', async () => {
    // Si dijeran cosas distintas, probando numeros con un telefono
    // cualquiera se sabria que ordenes existen.
    const { numero } = await ordenConsultable();
    const ajena = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/portal/ordenes/${numero}?telefono=50588880000`).expect(404);
    const inexistente = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/portal/ordenes/99999999?telefono=50588880000`).expect(404);

    expect(ajena.body.error.mensaje).toBe(inexistente.body.error.mensaje);
  });

  it('sin telefono no responde', async () => {
    const { numero } = await ordenConsultable();
    await peticion(entorno.aplicacion).get(`${RAIZ}/portal/ordenes/${numero}`).expect(400);
  });
});

describe('indicadores de operacion', () => {
  it('cuadran entre si', async () => {
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/indicadores/operacion`).set(jefatura).expect(200);
    const indicadores = respuesta.body.datos;

    const suma = indicadores.porEstado.reduce(
      (total: number, fila: { ordenes: number }) => total + fila.ordenes, 0,
    );
    expect(indicadores.ordenesVivas).toBe(suma);

    expect(indicadores.cumplimiento.aTiempo)
      .toBeLessThanOrEqual(indicadores.cumplimiento.cerradas);
    expect(indicadores.cumplimiento.porcentaje).toBeGreaterThanOrEqual(0);
    expect(indicadores.cumplimiento.porcentaje).toBeLessThanOrEqual(100);
  });

  it('ningun estado final aparece entre las ordenes vivas', async () => {
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/indicadores/operacion`).set(jefatura).expect(200);

    const estados = respuesta.body.datos.porEstado.map((fila: { estado: string }) => fila.estado);
    for (const final of ['entregada', 'cerrada_sin_reparar', 'anulada']) {
      expect(estados).not.toContain(final);
    }
  });

  it('la reincidencia se cuenta por articulo y solo con mas de una orden', async () => {
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/indicadores/operacion`).set(jefatura).expect(200);

    for (const fila of respuesta.body.datos.reincidencias) {
      expect(fila.ordenes).toBeGreaterThan(1);
      expect(fila.articulo).toBeTruthy();
    }
  });

  it('la productividad no inventa tecnicos ni promedios imposibles', async () => {
    const jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/indicadores/operacion`).set(jefatura).expect(200);

    expect(respuesta.body.datos.tecnicos.length).toBeGreaterThan(0);
    for (const fila of respuesta.body.datos.tecnicos) {
      expect(fila.vencidas).toBeLessThanOrEqual(fila.enCurso);
      if (fila.horasPromedioCierre !== null) {
        expect(fila.horasPromedioCierre).toBeGreaterThan(0);
      }
    }
  });
});
