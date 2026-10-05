/**
 * Las tres alertas que faltaban del §55.
 *
 * Se prueban contra la BASE y no contra un numero escrito a mano: lo que
 * importa es que el total del aviso sea el mismo que la consulta de la base,
 * porque un aviso que cuenta distinto que la tabla deja de servir en cuanto
 * alguien lo verifica una vez.
 *
 * Y se prueba que el aviso NO aparezca cuando no hay nada: un cero de relleno
 * en la bandeja es peor que la ausencia, porque entrena a no leerla.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, TIPO_AVISO } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;
let admin: { Authorization: string };

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const respuesta = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${respuesta.body.data.tokenAcceso}` };
}

interface Grupo { readonly tipo: string; readonly total: number; readonly gravedad: string }

async function bandeja(cabecera: { Authorization: string }): Promise<Grupo[]> {
  const respuesta = await peticion(entorno.aplicacion)
    .get(`${RAIZ}/avisos`).set(cabecera).expect(200);
  return respuesta.body.data.grupos as Grupo[];
}

async function contar(consulta: string): Promise<number> {
  const { rows } = await entorno.piscina.query<{ total: string }>(consulta);
  return Number(rows[0]!.total);
}

beforeAll(async () => {
  entorno = await montarApi();
  admin = await sesionDe(CODIGO_ROL.ADMINISTRADOR);
});
afterAll(async () => { await entorno.cerrar(); });

describe('cotizaciones sin respuesta del cliente', () => {
  it('el total del aviso es el que dice la base', async () => {
    /*
     * `aceptada` es NULL mientras el cliente no contesta. NO es un booleano
     * de dos valores, y esa es la razon de esta prueba: la primera version
     * del aviso usaba `NOT aceptada`, que con NULL da NULL, y NULL no pasa el
     * WHERE. Devolvia cero descartando exactamente las que tenia que contar.
     */
    const enLaBase = await contar(`
      SELECT count(*)::text AS total FROM cotizacion c
        JOIN orden_servicio o ON o.id = c.id_orden
       WHERE c.aceptada IS NULL
         AND o.estado IN ('cotizada', 'esperando_autorizacion')`);

    const grupo = (await bandeja(admin))
      .find((g) => g.tipo === TIPO_AVISO.COTIZACION_PENDIENTE);

    if (enLaBase === 0) {
      expect(grupo).toBeUndefined();
      return;
    }
    expect(grupo).toBeDefined();
    expect(grupo!.total).toBe(enLaBase);
    expect(enLaBase).toBeGreaterThan(0);
  });

  it('una cotizacion RECHAZADA por el cliente no genera aviso', async () => {
    // `false` es «el cliente dijo que no», que es otra cosa y ya no espera a
    // nadie. Si se contara, el aviso diria que hay que llamar a alguien que
    // ya contesto.
    const rechazadas = await contar(`
      SELECT count(*)::text AS total FROM cotizacion c
        JOIN orden_servicio o ON o.id = c.id_orden
       WHERE c.aceptada = false
         AND o.estado IN ('cotizada', 'esperando_autorizacion')`);
    const pendientes = await contar(`
      SELECT count(*)::text AS total FROM cotizacion c
        JOIN orden_servicio o ON o.id = c.id_orden
       WHERE c.aceptada IS NULL
         AND o.estado IN ('cotizada', 'esperando_autorizacion')`);

    const grupo = (await bandeja(admin))
      .find((g) => g.tipo === TIPO_AVISO.COTIZACION_PENDIENTE);
    expect(grupo?.total ?? 0).toBe(pendientes);

    /*
     * La comprobacion de que no suma las rechazadas solo tiene sentido si hay
     * alguna rechazada. Con cero, `pendientes + rechazadas` es `pendientes` y
     * la asercion compara el numero contra si mismo: fallaba siempre, y el
     * fallo era de la prueba, no del aviso.
     */
    if (rechazadas > 0) {
      expect(grupo?.total ?? 0).not.toBe(pendientes + rechazadas);
    }
  });
});

describe('compras que no han llegado completas', () => {
  it('cuenta las enviadas, confirmadas y recibidas a medias', async () => {
    // 'recibida_parcial' cuenta: parte de la mercaderia sigue sin llegar y
    // alguien tiene que perseguirla.
    const enLaBase = await contar(`
      SELECT count(*)::text AS total FROM compra
       WHERE estado IN ('enviada', 'confirmada', 'recibida_parcial')`);

    const grupo = (await bandeja(admin))
      .find((g) => g.tipo === TIPO_AVISO.COMPRA_PENDIENTE);

    if (enLaBase === 0) {
      expect(grupo).toBeUndefined();
      return;
    }
    expect(grupo!.total).toBe(enLaBase);
  });

  it('no se lo muestra a quien no puede ver compras', async () => {
    const tecnico = await sesionDe(CODIGO_ROL.TECNICO_RUTA);
    const grupos = await bandeja(tecnico);
    expect(grupos.some((g) => g.tipo === TIPO_AVISO.COMPRA_PENDIENTE)).toBe(false);
  });
});

describe('repuestos agotados', () => {
  it('es critico, y es un aviso distinto de «bajo minimo»', async () => {
    const agotados = await contar(`
      SELECT count(*)::text AS total FROM repuesto r CROSS JOIN bodega b
        LEFT JOIN existencia e ON e.id_repuesto = r.id AND e.id_bodega = b.id
       WHERE r.activo AND b.tipo = 'central' AND b.activa AND b.surte_repuestos
         AND coalesce(e.cantidad, 0) = 0
         AND EXISTS (SELECT 1 FROM movimiento_repuesto m WHERE m.id_repuesto = r.id)`);

    const grupos = await bandeja(admin);
    const agotado = grupos.find((g) => g.tipo === TIPO_AVISO.REPUESTO_AGOTADO);

    if (agotados === 0) {
      // Cero de verdad, no cero de relleno: el grupo no aparece.
      expect(agotado).toBeUndefined();
      return;
    }
    expect(agotado!.total).toBe(agotados);
    // Agotado es critico; bajo minimo es informativo. Son dos cosas.
    expect(agotado!.gravedad).toBe('critico');
    const bajoMinimo = grupos.find((g) => g.tipo === TIPO_AVISO.REPUESTO_BAJO_MINIMO);
    if (bajoMinimo !== undefined) expect(bajoMinimo.gravedad).toBe('informativo');
  });
});

describe('la bandeja sigue sumando bien con los avisos nuevos', () => {
  it('el total es la suma de los grupos y los criticos son los criticos', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/avisos`).set(admin).expect(200);
    const d = respuesta.body.data as {
      total: number; criticos: number; grupos: Grupo[];
    };

    expect(d.total).toBe(d.grupos.reduce((suma, g) => suma + g.total, 0));
    expect(d.criticos).toBe(
      d.grupos.filter((g) => g.gravedad === 'critico').reduce((suma, g) => suma + g.total, 0),
    );
  });
});
