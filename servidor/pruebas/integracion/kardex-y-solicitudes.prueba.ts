/**
 * La aritmetica del inventario y el recorrido de la solicitud.
 *
 * Dos cosas que el pliego pide probar con numeros concretos (§26, §28, §59)
 * y que no se pueden verificar leyendo el codigo: hay que mover existencia de
 * verdad y volver a contarla.
 *
 * El recorrido que se sigue es el del pliego:
 *
 *   entran 10 a la central           ->  central 10, movil 0
 *   se despachan 3 al tecnico        ->  central  7, movil 3
 *   el tecnico consume 1 en la orden ->  central  7, movil 2
 *   devuelve 1 a la central          ->  central  8, movil 1
 *
 * Y en cada paso se comprueba que el KARDEX diga lo mismo que la existencia.
 * Son dos caminos distintos al mismo numero —uno suma movimientos, el otro
 * lee la proyeccion— y el dia que no coincidan, el inventario deja de servir
 * para nada.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import {
  CODIGO_ROL, ESTADO_SOLICITUD, MODALIDAD_SERVICIO, TIPO_MOVIMIENTO,
} from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;

let bodeguero: { Authorization: string };
let agente: { Authorization: string };
let jefatura: { Authorization: string };

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const respuesta = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${respuesta.body.data.tokenAcceso}` };
}

/** La existencia que guarda la proyeccion, para esa bodega y repuesto. */
async function existencia(idBodega: string, idRepuesto: string): Promise<number> {
  const { rows } = await entorno.piscina.query<{ cantidad: number }>(
    'SELECT cantidad FROM existencia WHERE id_bodega = $1 AND id_repuesto = $2',
    [idBodega, idRepuesto],
  );
  return rows[0]?.cantidad ?? 0;
}

/** El saldo final que calcula el kardex, que es otro camino al mismo numero. */
async function saldoDelKardex(idRepuesto: string, idBodega: string): Promise<number> {
  const respuesta = await peticion(entorno.aplicacion)
    .get(`${RAIZ}/repuestos/${idRepuesto}/kardex?idBodega=${idBodega}&tamano=100`)
    .set(bodeguero).expect(200);
  return respuesta.body.data.saldoFinal;
}

async function movimiento(cuerpo: Record<string, unknown>): Promise<void> {
  await peticion(entorno.aplicacion)
    .post(`${RAIZ}/movimientos`).set(bodeguero).send(cuerpo).expect(201);
}

beforeAll(async () => {
  entorno = await montarApi();
  bodeguero = await sesionDe(CODIGO_ROL.BODEGUERO);
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
  jefatura = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);
});
afterAll(async () => { await entorno.cerrar(); });

describe('la aritmetica del inventario cuadra con el kardex', () => {
  it('10 -> 7/3 -> 7/2 -> 8/1, y el kardex dice lo mismo en cada paso', async () => {
    /*
     * Un repuesto NUEVO, creado aqui.
     *
     * La primera version buscaba uno sin movimientos en la siembra y no habia
     * ninguno: la siembra mueve todo el catalogo. Con un repuesto recien
     * creado los numeros son exactamente los del ejercicio del pliego —10,
     * 7/3, 7/2, 8/1— en vez de deltas sobre un saldo cualquiera, y una prueba
     * que compara numeros literales se lee mucho mejor que una que compara
     * diferencias.
     *
     * Se inserta por la base porque el sistema no tiene alta de repuestos por
     * API: el catalogo lo carga el administrador del grupo, no el taller.
     */
    const { rows: repuestos } = await entorno.piscina.query<{ id: string }>(
      `INSERT INTO repuesto (codigo, descripcion, precio, stock_minimo)
       VALUES ($1, 'Repuesto de prueba de aritmetica', 100, 2) RETURNING id`,
      [`PRB-ARI-${Date.now().toString().slice(-6)}`],
    );
    const idRepuesto = repuestos[0]!.id;

    const { rows: central } = await entorno.piscina.query<{ id: string }>(
      "SELECT id FROM bodega WHERE tipo = 'central' AND surte_repuestos AND activa LIMIT 1",
    );
    const { rows: movil } = await entorno.piscina.query<{ id: string; id_tecnico: string }>(
      "SELECT id, id_tecnico FROM bodega WHERE tipo = 'movil' AND activa AND id_tecnico IS NOT NULL LIMIT 1",
    );
    const bCentral = central[0]!.id;
    const bMovil = movil[0]!.id;

    // Una orden asignada a ESE tecnico, para poder consumir contra ella.
    const { rows: base } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
      `SELECT a.id_cliente, a.id FROM articulo a JOIN cliente c ON c.id = a.id_cliente
        WHERE c.activo AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
        -- Garantia del proveedor aplicable: tienda del grupo y compra reciente.
        AND a.activo AND a.fecha_compra > current_date - interval '3 months'
        AND EXISTS (SELECT 1 FROM tienda_origen t WHERE t.id = a.id_tienda_origen AND t.pertenece_al_grupo)
        AND NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id AND cb.activa AND cb.tipo = 'proveedor')
        LIMIT 1`,
    );
    const orden = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
      .send({
        idCliente: base[0]!.id_cliente, idArticulo: base[0]!.id,
        modalidad: MODALIDAD_SERVICIO.RUTA, tipoGarantiaElegida: 'proveedor', fallaReportada: 'Para probar la aritmetica del inventario',
      }).expect(201);
    await peticion(entorno.aplicacion)
      .put(`${RAIZ}/ordenes/${orden.body.data.id}/tecnico`).set(jefatura)
      .send({ idTecnico: movil[0]!.id_tecnico }).expect(200);

    // ── 1. entran 10 a la central ──────────────────────────────────────
    await movimiento({
      tipo: TIPO_MOVIMIENTO.INGRESO, idRepuesto,
      idBodegaDestino: bCentral, cantidad: 10,
    });
    expect(await existencia(bCentral, idRepuesto)).toBe(10);
    expect(await existencia(bMovil, idRepuesto)).toBe(0);
    expect(await saldoDelKardex(idRepuesto, bCentral)).toBe(10);

    // ── 2. se despachan 3 al tecnico ───────────────────────────────────
    await movimiento({
      tipo: TIPO_MOVIMIENTO.DESPACHO_A_MOVIL, idRepuesto,
      idBodegaOrigen: bCentral, idBodegaDestino: bMovil, cantidad: 3,
    });
    expect(await existencia(bCentral, idRepuesto)).toBe(7);
    expect(await existencia(bMovil, idRepuesto)).toBe(3);
    expect(await saldoDelKardex(idRepuesto, bCentral)).toBe(7);
    expect(await saldoDelKardex(idRepuesto, bMovil)).toBe(3);

    // ── 3. el tecnico consume 1 en la orden ────────────────────────────
    await movimiento({
      tipo: TIPO_MOVIMIENTO.CONSUMO, idRepuesto,
      idBodegaOrigen: bMovil, cantidad: 1, idOrden: orden.body.data.id,
    });
    expect(await existencia(bCentral, idRepuesto)).toBe(7);
    expect(await existencia(bMovil, idRepuesto)).toBe(2);
    expect(await saldoDelKardex(idRepuesto, bMovil)).toBe(2);

    // ── 4. devuelve 1 a la central ─────────────────────────────────────
    await movimiento({
      tipo: TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL, idRepuesto,
      idBodegaOrigen: bMovil, idBodegaDestino: bCentral, cantidad: 1,
    });
    expect(await existencia(bCentral, idRepuesto)).toBe(8);
    expect(await existencia(bMovil, idRepuesto)).toBe(1);
    expect(await saldoDelKardex(idRepuesto, bCentral)).toBe(8);
    expect(await saldoDelKardex(idRepuesto, bMovil)).toBe(1);

    // ── el kardex del CENTRO: el despacho y la devolucion no lo mueven ─
    const delCentro = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/repuestos/${idRepuesto}/kardex?tamano=100`).set(bodeguero).expect(200);
    // Entraron 10 de afuera y salio 1 por consumo: quedan 9 en el centro.
    expect(delCentro.body.data.saldoFinal).toBe(9);
    expect(await existencia(bCentral, idRepuesto) + await existencia(bMovil, idRepuesto)).toBe(9);
  });

  it('el kardex trae el saldo corrido, no solo los movimientos', async () => {
    const { rows } = await entorno.piscina.query<{ id_repuesto: string; id_bodega: string }>(
      `SELECT m.id_repuesto, b.id AS id_bodega
         FROM movimiento_repuesto m JOIN bodega b ON b.id = m.id_bodega_destino
        GROUP BY m.id_repuesto, b.id HAVING count(*) >= 2 LIMIT 1`,
    );
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/repuestos/${rows[0]!.id_repuesto}/kardex`
        + `?idBodega=${rows[0]!.id_bodega}&tamano=100`)
      .set(bodeguero).expect(200);

    const lineas = respuesta.body.data.lineas as {
      entrada: number; salida: number; saldo: number;
    }[];
    expect(lineas.length).toBeGreaterThan(1);

    // El saldo de cada linea es el de la anterior mas lo que entro menos lo
    // que salio. Si esto falla, el saldo esta mal calculado y el kardex no
    // sirve para explicar un faltante.
    let acumulado = respuesta.body.data.saldoInicial as number;
    for (const linea of lineas) {
      acumulado += linea.entrada - linea.salida;
      expect(linea.saldo).toBe(acumulado);
    }
    expect(respuesta.body.data.saldoFinal).toBe(acumulado);
  });

  it('un repuesto que no existe no devuelve un kardex vacio: devuelve 404', async () => {
    await peticion(entorno.aplicacion)
      .get(`${RAIZ}/repuestos/00000000-0000-0000-0000-000000000000/kardex`)
      .set(bodeguero).expect(404);
  });
});

describe('el recorrido de la solicitud de repuesto', () => {
  /** Una solicitud nueva sobre una orden con tecnico asignado. */
  async function solicitudNueva(): Promise<{ id: string; idOrden: string; nombreTecnico: string }> {
    const { rows: tecnicos } = await entorno.piscina.query<{
      id: string; nombre_usuario: string;
    }>(
      `SELECT t.id, u.nombre_usuario FROM tecnico t
         JOIN usuario u ON u.id = t.id_usuario JOIN rol r ON r.id = u.id_rol
        WHERE r.codigo = $1 AND t.activo AND u.activo AND NOT u.bloqueado LIMIT 1`,
      [CODIGO_ROL.TECNICO_RUTA],
    );
    const { rows: base } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
      `SELECT a.id_cliente, a.id FROM articulo a JOIN cliente c ON c.id = a.id_cliente
        WHERE c.activo AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
        -- Garantia del proveedor aplicable: tienda del grupo y compra reciente.
        AND a.activo AND a.fecha_compra > current_date - interval '3 months'
        AND EXISTS (SELECT 1 FROM tienda_origen t WHERE t.id = a.id_tienda_origen AND t.pertenece_al_grupo)
        AND NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id AND cb.activa AND cb.tipo = 'proveedor')
        LIMIT 1`,
    );
    const orden = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
      .send({
        idCliente: base[0]!.id_cliente, idArticulo: base[0]!.id,
        modalidad: MODALIDAD_SERVICIO.RUTA, tipoGarantiaElegida: 'proveedor', fallaReportada: 'Para probar el recorrido de la solicitud',
      }).expect(201);
    await peticion(entorno.aplicacion)
      .put(`${RAIZ}/ordenes/${orden.body.data.id}/tecnico`).set(jefatura)
      .send({ idTecnico: tecnicos[0]!.id }).expect(200);

    const { rows: repuestos } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM repuesto WHERE activo LIMIT 1',
    );
    // Aprobar reserva, y solo se aprueba lo disponible (migracion 0023): cada
    // solicitud de prueba trae su unidad a la bodega, para no depender de lo
    // que reservaron las anteriores.
    const { rows: central } = await entorno.piscina.query<{ id: string }>(
      "SELECT id FROM bodega WHERE tipo = 'central' AND surte_repuestos AND activa LIMIT 1",
    );
    await peticion(entorno.aplicacion).post(`${RAIZ}/movimientos`).set(bodeguero).send({
      tipo: TIPO_MOVIMIENTO.INGRESO, idRepuesto: repuestos[0]!.id,
      idBodegaDestino: central[0]!.id, cantidad: 1,
    }).expect(201);
    const creada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${orden.body.data.id}/solicitudes-repuesto`).set(bodeguero)
      .send({ idRepuesto: repuestos[0]!.id, cantidad: 1 }).expect(201);

    return {
      id: creada.body.data.id,
      idOrden: orden.body.data.id,
      nombreTecnico: tecnicos[0]!.nombre_usuario,
    };
  }

  /**
   * Un paso del recorrido.
   *
   * NO es `async`: devuelve la peticion de supertest sin esperarla, para que
   * quien llama pueda encadenarle `.expect(...)`. Envolverla en una promesa
   * ya resuelta pierde ese encadenado.
   */
  function paso(
    idSolicitud: string, cabecera: { Authorization: string }, cuerpo: Record<string, unknown>,
  ) {
    return peticion(entorno.aplicacion)
      .post(`${RAIZ}/solicitudes-repuesto/${idSolicitud}/pasos`).set(cabecera).send(cuerpo);
  }

  it('recorre los seis pasos y deja constancia de quien dio cada uno', async () => {
    const solicitud = await solicitudNueva();
    const tecnico = await (async () => {
      const respuesta = await peticion(entorno.aplicacion)
        .post(`${RAIZ}/autenticacion/sesion`)
        .send({ nombreUsuario: solicitud.nombreTecnico, contrasena: CONTRASENA_DE_PRUEBA })
        .expect(201);
      return { Authorization: `Bearer ${respuesta.body.data.tokenAcceso}` };
    })();

    await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.EN_REVISION }).expect(200);
    await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.APROBADA }).expect(200);
    await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.PREPARADA }).expect(200);

    const { rows: bodegas } = await entorno.piscina.query<{ id: string }>(
      "SELECT id FROM bodega WHERE tipo = 'central' AND surte_repuestos AND activa LIMIT 1",
    );
    await paso(solicitud.id, bodeguero, {
      hacia: ESTADO_SOLICITUD.ENTREGADA, idBodegaOrigen: bodegas[0]!.id,
    }).expect(200);

    const final = await paso(solicitud.id, tecnico, { hacia: ESTADO_SOLICITUD.RECIBIDA }).expect(200);

    expect(final.body.data.estado).toBe(ESTADO_SOLICITUD.RECIBIDA);
    expect(final.body.data.revisadaPor).not.toBeNull();
    expect(final.body.data.preparadaPor).not.toBeNull();
    expect(final.body.data.entregadaPor).not.toBeNull();
    expect(final.body.data.recibidaEn).not.toBeNull();
    // Recibir libera: si el tecnico la tiene, la orden dejo de esperarla.
    expect(final.body.data.liberada).toBe(true);
    expect(final.body.data.pasosPosibles).toEqual([]);
  });

  it('no se puede saltar un paso', async () => {
    const solicitud = await solicitudNueva();
    const respuesta = await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.ENTREGADA });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.code).toBe('PASO_INVALIDO');
  });

  it('un rechazo sin motivo escrito no se acepta', async () => {
    const solicitud = await solicitudNueva();
    await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.EN_REVISION }).expect(200);

    const sinMotivo = await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.RECHAZADA });
    expect(sinMotivo.status).toBe(400);

    const conMotivo = await paso(solicitud.id, bodeguero, {
      hacia: ESTADO_SOLICITUD.RECHAZADA, motivo: 'El tecnico pidio la pieza de otro modelo',
    });
    expect(conMotivo.status).toBe(200);
    expect(conMotivo.body.data.motivo).toMatch(/otro modelo/);
    // Un rechazo no es el final: se corrige y vuelve a revision.
    expect(conMotivo.body.data.pasosPosibles).toContain(ESTADO_SOLICITUD.EN_REVISION);
  });

  /**
   * SEPARACION DE FUNCIONES (§65).
   *
   * Quien aprueba no es quien confirma que la recibio. Si bodega pudiera
   * marcar «recibida», una pieza podria quedar declarada entregada sin que
   * ningun tecnico la tenga, y el faltante aparece meses despues sin dueño.
   */
  it('bodega no puede declarar que el tecnico recibio la pieza', async () => {
    const solicitud = await solicitudNueva();
    await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.EN_REVISION }).expect(200);
    await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.APROBADA }).expect(200);
    await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.PREPARADA }).expect(200);

    const { rows: bodegas } = await entorno.piscina.query<{ id: string }>(
      "SELECT id FROM bodega WHERE tipo = 'central' AND surte_repuestos AND activa LIMIT 1",
    );
    await paso(solicitud.id, bodeguero, {
      hacia: ESTADO_SOLICITUD.ENTREGADA, idBodegaOrigen: bodegas[0]!.id,
    }).expect(200);

    const respuesta = await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.RECIBIDA });
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.message).toMatch(/no es de una orden asignada a usted/i);
  });

  it('otro tecnico tampoco puede confirmarla', async () => {
    const solicitud = await solicitudNueva();
    await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.EN_REVISION }).expect(200);
    await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.APROBADA }).expect(200);
    await paso(solicitud.id, bodeguero, { hacia: ESTADO_SOLICITUD.PREPARADA }).expect(200);
    const { rows: bodegas } = await entorno.piscina.query<{ id: string }>(
      "SELECT id FROM bodega WHERE tipo = 'central' AND surte_repuestos AND activa LIMIT 1",
    );
    await paso(solicitud.id, bodeguero, {
      hacia: ESTADO_SOLICITUD.ENTREGADA, idBodegaOrigen: bodegas[0]!.id,
    }).expect(200);

    const { rows: otros } = await entorno.piscina.query<{ nombre_usuario: string }>(
      `SELECT u.nombre_usuario FROM usuario u JOIN rol r ON r.id = u.id_rol
        WHERE r.codigo = $1 AND u.activo AND u.nombre_usuario <> $2 LIMIT 1`,
      [CODIGO_ROL.TECNICO_RUTA, solicitud.nombreTecnico],
    );
    const sesion = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: otros[0]!.nombre_usuario, contrasena: CONTRASENA_DE_PRUEBA })
      .expect(201);

    const respuesta = await paso(solicitud.id,
      { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` },
      { hacia: ESTADO_SOLICITUD.RECIBIDA });
    expect(respuesta.status).toBe(403);
  });

  it('un tecnico solo ve en el recorrido las solicitudes de SUS ordenes', async () => {
    const solicitud = await solicitudNueva();
    const sesion = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: solicitud.nombreTecnico, contrasena: CONTRASENA_DE_PRUEBA })
      .expect(201);

    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/solicitudes-repuesto/recorrido?tamano=100`)
      .set({ Authorization: `Bearer ${sesion.body.data.tokenAcceso}` }).expect(200);

    const ordenes = (respuesta.body.data as { idOrden: string }[]).map((s) => s.idOrden);
    if (ordenes.length === 0) return;

    const { rows } = await entorno.piscina.query<{ ajenas: string }>(
      `SELECT count(*)::text AS ajenas FROM orden_servicio o
         JOIN tecnico t ON t.id = o.id_tecnico JOIN usuario u ON u.id = t.id_usuario
        WHERE o.id = ANY($1::uuid[]) AND u.nombre_usuario <> $2`,
      [ordenes, solicitud.nombreTecnico],
    );
    expect(Number(rows[0]!.ajenas)).toBe(0);
  });
});
