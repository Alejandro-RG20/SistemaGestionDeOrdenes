/**
 * Articulos y motor de garantias contra la base real.
 *
 * Lo que se comprueba aqui es la regla mas cara de equivocar: quien paga la
 * reparacion, y que cambiar un dato del articulo recalcule las ordenes
 * abiertas sin tocar las cerradas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, TIPO_GARANTIA } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
const MOTIVO = 'Prueba automatizada del motor de garantias';
let entorno: EntornoApi;
let jefatura: { Authorization: string };
let agente: { Authorization: string };

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.datos.tokenAcceso}` };
}

/** Catalogos de la siembra, para armar articulos verosimiles. */
async function catalogo(): Promise<{
  idCliente: string; idOtroCliente: string; idMarca: string; idCategoria: string;
  idTiendaGrupo: string; idTiendaExterna: string;
}> {
  const { rows: clientes } = await entorno.piscina.query<{ id: string }>(
    'SELECT id FROM cliente WHERE activo AND id_cliente_principal IS NULL ORDER BY creado_en LIMIT 2',
  );
  const { rows: marcas } = await entorno.piscina.query<{ id: string }>(
    "SELECT id FROM marca WHERE nombre = 'LG'",
  );
  const { rows: categorias } = await entorno.piscina.query<{ id: string }>(
    "SELECT id FROM categoria_articulo WHERE nombre = 'refrigeracion'",
  );
  const { rows: grupo } = await entorno.piscina.query<{ id: string }>(
    "SELECT id FROM tienda_origen WHERE nombre = 'La Curacao'",
  );
  const { rows: externa } = await entorno.piscina.query<{ id: string }>(
    "SELECT id FROM tienda_origen WHERE nombre = 'Externa'",
  );
  return {
    idCliente: clientes[0]!.id, idOtroCliente: clientes[1]!.id,
    idMarca: marcas[0]!.id, idCategoria: categorias[0]!.id,
    idTiendaGrupo: grupo[0]!.id, idTiendaExterna: externa[0]!.id,
  };
}

function haceMeses(meses: number): string {
  const fecha = new Date();
  fecha.setUTCMonth(fecha.getUTCMonth() - meses);
  return fecha.toISOString().slice(0, 10);
}

let serieContador = 0;
const serieNueva = (): string => `PRUEBA-ETAPA3-${(serieContador += 1).toString().padStart(4, '0')}`;

async function crearArticulo(datos: Record<string, unknown>): Promise<string> {
  const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/articulos`).set(jefatura)
    .send({ numeroSerie: serieNueva(), ...datos }).expect(201);
  return respuesta.body.datos.id;
}

async function evaluar(idArticulo: string, extras: Record<string, unknown> = {}): Promise<{
  tipo: string; motivo: string; detieneLaOrden: boolean; idReglaCobertura: string;
}> {
  const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/evaluar`)
    .set(jefatura).send({ idArticulo, ...extras }).expect(200);
  return respuesta.body.datos;
}

beforeAll(async () => {
  entorno = await montarApi();
  jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
});

afterAll(async () => { await entorno.cerrar(); });

describe('alta de articulos', () => {
  it('registra un articulo y lo encuentra por su numero de serie', async () => {
    const base = await catalogo();
    const serie = serieNueva();
    const creado = await peticion(entorno.aplicacion).post(`${RAIZ}/articulos`).set(jefatura)
      .send({
        idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
        idTiendaOrigen: base.idTiendaGrupo, modelo: 'LG-9000',
        numeroSerie: serie.toLowerCase(), fechaCompra: haceMeses(6),
      }).expect(201);

    // La serie se normaliza a mayusculas: es como se identifica el aparato.
    expect(creado.body.datos.numeroSerie).toBe(serie.toUpperCase());

    const porSerie = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/articulos/serie/${serie}`).set(jefatura).expect(200);
    expect(porSerie.body.datos.id).toBe(creado.body.datos.id);
  });

  it('no admite dos articulos con la misma serie y lo explica', async () => {
    const base = await catalogo();
    const serie = serieNueva();
    const comun = {
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, numeroSerie: serie,
    };
    await peticion(entorno.aplicacion).post(`${RAIZ}/articulos`).set(jefatura).send(comun).expect(201);

    const repetido = await peticion(entorno.aplicacion).post(`${RAIZ}/articulos`).set(jefatura).send(comun);
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.mensaje).toMatch(/transfieralo/i);
    expect(repetido.body.error.mensaje).not.toMatch(/constraint|duplicate/i);
  });

  it('exige serie o la marca de placa ilegible', async () => {
    const base = await catalogo();
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/articulos`).set(jefatura)
      .send({
        idCliente: base.idCliente, idMarca: base.idMarca,
        idCategoria: base.idCategoria, idTiendaOrigen: base.idTiendaGrupo,
      });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campos.numeroSerie).toMatch(/placa no es legible/);
  });

  it('rechaza referencias inexistentes con un mensaje por campo', async () => {
    const base = await catalogo();
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/articulos`).set(jefatura)
      .send({
        idCliente: '00000000-0000-4000-8000-000000000000', idMarca: base.idMarca,
        idCategoria: base.idCategoria, idTiendaOrigen: base.idTiendaGrupo, numeroSerie: serieNueva(),
      });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campos.idCliente).toMatch(/no existe/i);
  });
});

describe('el motor decide con el articulo, no con el cliente', () => {
  it('tienda del grupo y dentro de plazo: la cubre el fabricante', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, fechaCompra: haceMeses(6),
    });
    const evaluacion = await evaluar(id);
    expect(evaluacion.tipo).toBe(TIPO_GARANTIA.PROVEEDOR);
    expect(evaluacion.idReglaCobertura).toBeTypeOf('string');
  });

  it('comprado fuera del grupo: lo paga el cliente', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaExterna, fechaCompra: haceMeses(2),
    });
    const evaluacion = await evaluar(id);
    expect(evaluacion.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(evaluacion.motivo).toMatch(/tienda del grupo/);
  });

  it('fuera de plazo: lo paga el cliente', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, fechaCompra: haceMeses(80),
    });
    expect((await evaluar(id)).tipo).toBe(TIPO_GARANTIA.PARTICULAR);
  });

  it('la garantia no se traslada: otro solicitante pierde la cobertura', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, fechaCompra: haceMeses(6),
    });

    expect((await evaluar(id)).tipo).toBe(TIPO_GARANTIA.PROVEEDOR);

    const deSegundaMano = await evaluar(id, { idClienteSolicitante: base.idOtroCliente });
    expect(deSegundaMano.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(deSegundaMano.motivo).toMatch(/cambia de dueno/i);
  });

  it('la poliza extendida tampoco se traslada', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaExterna, fechaCompra: haceMeses(40),
    });

    await peticion(entorno.aplicacion).post(`${RAIZ}/articulos/${id}/coberturas`).set(jefatura)
      .send({
        tipo: TIPO_GARANTIA.ADICIONAL,
        vigenteDesde: haceMeses(12), vigenteHasta: haceMeses(-12),
        documentoRespaldo: 'POL-999888',
      }).expect(201);

    expect((await evaluar(id)).tipo).toBe(TIPO_GARANTIA.ADICIONAL);
    expect((await evaluar(id, { idClienteSolicitante: base.idOtroCliente })).tipo)
      .toBe(TIPO_GARANTIA.PARTICULAR);
  });

  it('una falla excluida degrada la cobertura y detiene la orden', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, fechaCompra: haceMeses(3),
    });

    // Se fija una regla con exclusion conocida para no depender del azar de la siembra.
    await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/reglas`).set(jefatura)
      .send({
        idMarca: base.idMarca, idCategoria: base.idCategoria, mesesCobertura: 24,
        exigeTiendaGrupo: true, fallasExcluidas: ['sobrecarga_electrica', 'golpe'],
        motivo: `${MOTIVO}: se fija la exclusion por sobrecarga`,
      }).expect(201);

    expect((await evaluar(id)).tipo).toBe(TIPO_GARANTIA.PROVEEDOR);

    const tras = await evaluar(id, { fallaReal: 'Tarjeta quemada por sobrecarga electrica' });
    expect(tras.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(tras.detieneLaOrden).toBe(true);
    expect(tras.motivo).toMatch(/detenida/);
  });
});

describe('reglas de cobertura versionadas', () => {
  it('crear una version cierra la anterior en lugar de editarla', async () => {
    const base = await catalogo();
    const nueva = await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/reglas`).set(jefatura)
      .send({
        idMarca: base.idMarca, idCategoria: base.idCategoria, mesesCobertura: 36,
        exigeTiendaGrupo: true, fallasExcluidas: ['humedad'],
        motivo: `${MOTIVO}: el fabricante amplio la cobertura a 36 meses`,
      }).expect(201);

    expect(nueva.body.datos.version).toBeGreaterThan(1);
    expect(nueva.body.datos.activa).toBe(true);

    const { rows } = await entorno.piscina.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM regla_cobertura
        WHERE id_marca = $1 AND id_categoria = $2 AND activa`,
      [base.idMarca, base.idCategoria],
    );
    expect(Number(rows[0]!.total)).toBe(1);
  });

  it('un agente puede consultar las reglas pero no crear versiones', async () => {
    await peticion(entorno.aplicacion).get(`${RAIZ}/coberturas/reglas?tamano=5`).set(agente).expect(200);
    await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/reglas`).set(agente)
      .send({ mesesCobertura: 12, exigeTiendaGrupo: true, fallasExcluidas: [], motivo: MOTIVO })
      .expect(403);
  });

  it('exige motivo escrito para versionar una regla', async () => {
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/reglas`).set(jefatura)
      .send({ mesesCobertura: 12, exigeTiendaGrupo: true, fallasExcluidas: [], motivo: 'corto' });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campos.motivo).toBeTypeOf('string');
  });
});

describe('datos sensibles del articulo', () => {
  it('solo la jefatura los cambia, y exige motivo escrito', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, fechaCompra: haceMeses(6),
    });

    await peticion(entorno.aplicacion).put(`${RAIZ}/articulos/${id}/datos-sensibles`).set(agente)
      .send({ fechaCompra: haceMeses(3), motivo: MOTIVO }).expect(403);

    const sinMotivo = await peticion(entorno.aplicacion)
      .put(`${RAIZ}/articulos/${id}/datos-sensibles`).set(jefatura)
      .send({ fechaCompra: haceMeses(3), motivo: 'ya' });
    expect(sinMotivo.status).toBe(400);

    await peticion(entorno.aplicacion).put(`${RAIZ}/articulos/${id}/datos-sensibles`).set(jefatura)
      .send({ fechaCompra: haceMeses(3), motivo: `${MOTIVO}: el cliente trajo la factura` }).expect(200);

    const asientos = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/bitacora?tabla=articulo&idRegistro=${id}`).set(jefatura).expect(200);
    const cambio = asientos.body.datos.find((a: { campo: string }) => a.campo === 'fecha_compra');
    expect(cambio.motivo).toMatch(/trajo la factura/);
    expect(cambio.valorNuevo).toBe(haceMeses(3));
  });

  it('el agente si puede corregir el modelo, que no afecta la cobertura', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, fechaCompra: haceMeses(6), modelo: 'MAL-ESCRITO',
    });
    const respuesta = await peticion(entorno.aplicacion).patch(`${RAIZ}/articulos/${id}`).set(agente)
      .send({ modelo: 'LG-GR-389' }).expect(200);
    expect(respuesta.body.datos.modelo).toBe('LG-GR-389');
  });
});

describe('reevaluacion de las ordenes abiertas', () => {
  /** Toma una orden abierta de la siembra y la deja en un estado conocido. */
  async function ordenAbiertaConArticuloPropio(): Promise<{
    idOrden: string; idArticulo: string; numero: number; idCliente: string;
  }> {
    const { rows } = await entorno.piscina.query<{
      id: string; id_articulo: string; numero: number; id_cliente: string;
    }>(
      `SELECT o.id, o.id_articulo, o.numero, o.id_cliente
         FROM orden_servicio o
         JOIN articulo a ON a.id = o.id_articulo
         JOIN tienda_origen t ON t.id = a.id_tienda_origen
        WHERE o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
          AND o.id_cliente = a.id_cliente
          AND t.pertenece_al_grupo
          AND a.fecha_compra IS NOT NULL
        LIMIT 1`,
    );
    const orden = rows[0]!;
    // Se la deja cubierta por fabricante, con compra reciente.
    await entorno.piscina.query(
      "UPDATE articulo SET fecha_compra = current_date - interval '3 months' WHERE id = $1",
      [orden.id_articulo],
    );
    await entorno.piscina.query(
      "UPDATE orden_servicio SET tipo_garantia = 'proveedor' WHERE id = $1", [orden.id],
    );
    return {
      idOrden: orden.id, idArticulo: orden.id_articulo,
      numero: orden.numero, idCliente: orden.id_cliente,
    };
  }

  it('cambiar la fecha de compra recalcula la cobertura de las ordenes abiertas', async () => {
    const orden = await ordenAbiertaConArticuloPropio();

    const respuesta = await peticion(entorno.aplicacion)
      .put(`${RAIZ}/articulos/${orden.idArticulo}/datos-sensibles`).set(jefatura)
      .send({
        fechaCompra: haceMeses(90),
        motivo: `${MOTIVO}: la fecha estaba mal digitada, el aparato es de 2018`,
      }).expect(200);

    const reevaluada = respuesta.body.datos.ordenesReevaluadas
      .find((o: { numero: number }) => o.numero === orden.numero);
    expect(reevaluada).toBeDefined();
    expect(reevaluada.tipoAnterior).toBe(TIPO_GARANTIA.PROVEEDOR);
    expect(reevaluada.tipoNuevo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(reevaluada.detenida).toBe(true);

    const { rows } = await entorno.piscina.query<{ tipo_garantia: string; id_regla_cobertura: string }>(
      'SELECT tipo_garantia, id_regla_cobertura FROM orden_servicio WHERE id = $1', [orden.idOrden],
    );
    expect(rows[0]!.tipo_garantia).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(rows[0]!.id_regla_cobertura).toBeTypeOf('string');
  });

  it('deja el cambio en la bitacora inmutable de la orden', async () => {
    const { rows } = await entorno.piscina.query<{ observacion: string }>(
      `SELECT observacion FROM evento_orden
        WHERE observacion LIKE 'Cobertura reevaluada%' ORDER BY momento DESC LIMIT 1`,
    );
    expect(rows[0]!.observacion).toMatch(/de proveedor a particular/);
  });

  it('transferir el articulo deja sin garantia a las ordenes abiertas', async () => {
    const base = await catalogo();
    const orden = await ordenAbiertaConArticuloPropio();

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/articulos/${orden.idArticulo}/transferir`).set(jefatura)
      .send({
        idClienteNuevo: base.idOtroCliente === orden.idCliente ? base.idCliente : base.idOtroCliente,
        motivo: `${MOTIVO}: el cliente vendio el aparato`,
      }).expect(200);

    const reevaluada = respuesta.body.datos.ordenesReevaluadas
      .find((o: { numero: number }) => o.numero === orden.numero);
    expect(reevaluada.tipoNuevo).toBe(TIPO_GARANTIA.PARTICULAR);
  });

  it('las ordenes ya entregadas no se tocan', async () => {
    const { rows } = await entorno.piscina.query<{
      id: string; id_articulo: string; tipo_garantia: string;
    }>(
      `SELECT o.id, o.id_articulo, o.tipo_garantia
         FROM orden_servicio o
        WHERE o.estado = 'entregada' AND o.tipo_garantia = 'proveedor'
        LIMIT 1`,
    );
    const entregada = rows[0]!;

    await peticion(entorno.aplicacion)
      .put(`${RAIZ}/articulos/${entregada.id_articulo}/datos-sensibles`).set(jefatura)
      .send({ fechaCompra: haceMeses(120), motivo: `${MOTIVO}: correccion sobre articulo entregado` })
      .expect(200);

    const { rows: despues } = await entorno.piscina.query<{ tipo_garantia: string }>(
      'SELECT tipo_garantia FROM orden_servicio WHERE id = $1', [entregada.id],
    );
    expect(despues[0]!.tipo_garantia).toBe(entregada.tipo_garantia);
  });

  it('si algo falla, ni el articulo cambia ni se reevalua nada', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, fechaCompra: haceMeses(6),
    });

    const respuesta = await peticion(entorno.aplicacion)
      .put(`${RAIZ}/articulos/${id}/datos-sensibles`).set(jefatura)
      .send({
        fechaCompra: haceMeses(1),
        idTiendaOrigen: '00000000-0000-4000-8000-000000000000',
        motivo: `${MOTIVO}: tienda inexistente`,
      });
    expect(respuesta.status).toBe(400);

    const { rows } = await entorno.piscina.query<{ fecha_compra: Date }>(
      'SELECT fecha_compra FROM articulo WHERE id = $1', [id],
    );
    expect(rows[0]!.fecha_compra.toISOString().slice(0, 10)).toBe(haceMeses(6));
  });
});

describe('historial del articulo', () => {
  it('acumula sus ordenes con independencia de quien sea el dueno', async () => {
    const { rows } = await entorno.piscina.query<{ id_articulo: string; total: string }>(
      `SELECT id_articulo, count(*)::text AS total FROM orden_servicio
        GROUP BY id_articulo HAVING count(*) > 1 LIMIT 1`,
    );
    const ficha = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/articulos/${rows[0]!.id_articulo}`).set(jefatura).expect(200);

    expect(ficha.body.datos.historial.length).toBeGreaterThan(1);
    expect(ficha.body.datos.historial[0].numero).toBeTypeOf('number');
    // El historial no filtra costos internos hacia el portal, pero si los
    // muestra al personal: aqui basta con que la falla y el estado esten.
    expect(ficha.body.datos.historial[0].fallaReportada).toBeTypeOf('string');
  });
});
