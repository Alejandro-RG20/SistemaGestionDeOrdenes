/**
 * Articulos y estado de sus garantias contra la base real.
 *
 * El sistema ya no decide quien paga: informa la vigencia de cada garantia
 * y advierte. Lo que se comprueba aqui es que esa informacion sea correcta
 * y que cambiar un dato del articulo NO cambie en silencio la garantia de
 * las ordenes ya creadas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, TIPO_GARANTIA } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
const MOTIVO = 'Prueba automatizada de garantias';
let entorno: EntornoApi;
let jefatura: { Authorization: string };
let agente: { Authorization: string };

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
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
  return respuesta.body.data.id;
}

interface EstadoGarantia { vigencia: string; aplicable: boolean; motivo: string | null; origen: string | null }
async function consultar(idArticulo: string, extras: Record<string, unknown> = {}): Promise<{
  garantias: { proveedor: EstadoGarantia; adicional: EstadoGarantia };
  advertencias: string[];
  idReglaReferencia: string | null;
}> {
  const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/evaluar`)
    .set(jefatura).send({ idArticulo, ...extras }).expect(200);
  return respuesta.body.data;
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
    expect(creado.body.data.numeroSerie).toBe(serie.toUpperCase());

    const porSerie = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/articulos/serie/${serie}`).set(jefatura).expect(200);
    expect(porSerie.body.data.id).toBe(creado.body.data.id);
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
    expect(repetido.body.error.message).toMatch(/transfieralo/i);
    expect(repetido.body.error.message).not.toMatch(/constraint|duplicate/i);
  });

  it('exige serie o la marca de placa ilegible', async () => {
    const base = await catalogo();
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/articulos`).set(jefatura)
      .send({
        idCliente: base.idCliente, idMarca: base.idMarca,
        idCategoria: base.idCategoria, idTiendaOrigen: base.idTiendaGrupo,
      });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.fields.numeroSerie).toMatch(/placa no es legible/);
  });

  it('rechaza referencias inexistentes con un mensaje por campo', async () => {
    const base = await catalogo();
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/articulos`).set(jefatura)
      .send({
        idCliente: '00000000-0000-4000-8000-000000000000', idMarca: base.idMarca,
        idCategoria: base.idCategoria, idTiendaOrigen: base.idTiendaGrupo, numeroSerie: serieNueva(),
      });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.fields.idCliente).toMatch(/no existe/i);
  });
});

describe('la consulta informa con el articulo y no decide', () => {
  it('tienda del grupo y dentro de plazo: proveedor vigente y aplicable, sin advertencias', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, fechaCompra: haceMeses(6),
    });
    const consulta = await consultar(id);
    expect(consulta.garantias.proveedor).toMatchObject({ vigencia: 'vigente', aplicable: true, origen: 'regla' });
    expect(consulta.idReglaReferencia).toBeTypeOf('string');
    expect(consulta.advertencias).toEqual([]);
    // No hay veredicto: la garantia la elige una persona.
    expect(consulta).not.toHaveProperty('tipo');
  });

  it('comprado fuera del grupo: lo advierte', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaExterna, fechaCompra: haceMeses(2),
    });
    const consulta = await consultar(id);
    expect(consulta.garantias.proveedor.aplicable).toBe(false);
    expect(consulta.advertencias.join(' ')).toMatch(/tienda del grupo/);
  });

  it('fuera de plazo: vencida', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, fechaCompra: haceMeses(80),
    });
    const consulta = await consultar(id);
    expect(consulta.garantias.proveedor.vigencia).toBe('vencida');
    expect(consulta.advertencias.join(' ')).toMatch(/Vencio/);
  });

  it('la garantia no se traslada: para otro solicitante no aplica', async () => {
    const base = await catalogo();
    const id = await crearArticulo({
      idCliente: base.idCliente, idMarca: base.idMarca, idCategoria: base.idCategoria,
      idTiendaOrigen: base.idTiendaGrupo, fechaCompra: haceMeses(6),
    });
    expect((await consultar(id)).garantias.proveedor.aplicable).toBe(true);
    const deSegundaMano = await consultar(id, { idClienteSolicitante: base.idOtroCliente });
    expect(deSegundaMano.garantias.proveedor.aplicable).toBe(false);
    expect(deSegundaMano.advertencias.join(' ')).toMatch(/otra persona/i);
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

    expect((await consultar(id)).garantias.adicional).toMatchObject({ vigencia: 'vigente', aplicable: true });
    expect((await consultar(id, { idClienteSolicitante: base.idOtroCliente })).garantias.adicional.aplicable)
      .toBe(false);
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

    expect(nueva.body.data.version).toBeGreaterThan(1);
    expect(nueva.body.data.activa).toBe(true);

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
    expect(respuesta.body.error.fields.motivo).toBeTypeOf('string');
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
    const cambio = asientos.body.data.find((a: { campo: string }) => a.campo === 'fecha_compra');
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
    expect(respuesta.body.data.modelo).toBe('LG-GR-389');
  });
});

describe('cambios del articulo y ordenes abiertas', () => {
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

  it('cambiar la fecha de compra NO cambia la garantia de las ordenes abiertas: les deja una nota', async () => {
    const orden = await ordenAbiertaConArticuloPropio();

    const respuesta = await peticion(entorno.aplicacion)
      .put(`${RAIZ}/articulos/${orden.idArticulo}/datos-sensibles`).set(jefatura)
      .send({
        fechaCompra: haceMeses(90),
        motivo: `${MOTIVO}: la fecha estaba mal digitada, el aparato es de 2018`,
      }).expect(200);

    const abierta = respuesta.body.data.ordenesAbiertas
      .find((o: { numero: number }) => o.numero === orden.numero);
    expect(abierta).toBeDefined();
    expect(abierta.tipoGarantia).toBe(TIPO_GARANTIA.PROVEEDOR);
    expect(respuesta.body.data).not.toHaveProperty('ordenesReevaluadas');

    const { rows } = await entorno.piscina.query<{ tipo_garantia: string }>(
      'SELECT tipo_garantia FROM orden_servicio WHERE id = $1', [orden.idOrden],
    );
    expect(rows[0]!.tipo_garantia).toBe(TIPO_GARANTIA.PROVEEDOR);

    const { rows: notas } = await entorno.piscina.query<{ observacion: string }>(
      `SELECT observacion FROM evento_orden WHERE id_orden = $1 ORDER BY momento DESC LIMIT 1`, [orden.idOrden],
    );
    expect(notas[0]!.observacion).toMatch(/Cambio de datos del articulo/);
    expect(notas[0]!.observacion).toMatch(/no se modifico/);
  });

  it('ni la bitacora registra un cambio de garantia que nadie decidio', async () => {
    const orden = await ordenAbiertaConArticuloPropio();
    await peticion(entorno.aplicacion)
      .put(`${RAIZ}/articulos/${orden.idArticulo}/datos-sensibles`).set(jefatura)
      .send({ fechaCompra: haceMeses(100), motivo: `${MOTIVO}: otra correccion de fecha` }).expect(200);
    const { rows } = await entorno.piscina.query(
      `SELECT 1 FROM bitacora WHERE tabla = 'orden_servicio' AND id_registro = $1
          AND campo = 'tipo_garantia' AND accion = 'modificar'`, [orden.idOrden],
    );
    expect(rows).toHaveLength(0);
  });

  it('transferir el articulo tampoco cambia la garantia de las ordenes abiertas', async () => {
    const base = await catalogo();
    const orden = await ordenAbiertaConArticuloPropio();

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/articulos/${orden.idArticulo}/transferir`).set(jefatura)
      .send({
        idClienteNuevo: base.idOtroCliente === orden.idCliente ? base.idCliente : base.idOtroCliente,
        motivo: `${MOTIVO}: el cliente vendio el aparato`,
      }).expect(200);

    const abierta = respuesta.body.data.ordenesAbiertas
      .find((o: { numero: number }) => o.numero === orden.numero);
    expect(abierta.tipoGarantia).toBe(TIPO_GARANTIA.PROVEEDOR);
    const { rows } = await entorno.piscina.query<{ tipo_garantia: string }>(
      'SELECT tipo_garantia FROM orden_servicio WHERE id = $1', [orden.idOrden],
    );
    expect(rows[0]!.tipo_garantia).toBe(TIPO_GARANTIA.PROVEEDOR);
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

  it('si algo falla, ni el articulo cambia ni se anota nada', async () => {
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

    expect(ficha.body.data.historial.length).toBeGreaterThan(1);
    expect(ficha.body.data.historial[0].numero).toBeTypeOf('number');
    // El historial no filtra costos internos hacia el portal, pero si los
    // muestra al personal: aqui basta con que la falla y el estado esten.
    expect(ficha.body.data.historial[0].fallaReportada).toBeTypeOf('string');
  });
});
