/**
 * Modalidad de servicio (domicilio o taller), visitas con horas reales y
 * garantia adicional por meses, contra la API y la base reales.
 * Los numeros (V-nn) remiten a la lista de verificacion del documento.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, MODALIDAD_SERVICIO } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
type Cabecera = { Authorization: string };

let entorno: EntornoApi;
let agente: Cabecera;
let admin: Cabecera;
let gestor: Cabecera;
let tecnicoRuta: Cabecera;
let otroTecnicoRuta: Cabecera;
let idTecnicoRuta = '';
let idOtroTecnicoRuta = '';

async function iniciarSesion(nombreUsuario: string): Promise<Cabecera> {
  const sesion = await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}
const sesionDe = async (rol: string): Promise<Cabecera> => iniciarSesion(await usuarioConRol(entorno.piscina, rol));

/** Una fecha futura distinta por llamada, para no chocar franjas entre pruebas. */
let dias = 400;
function fechaFutura(): string {
  dias += 1;
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
}

async function articulo(): Promise<{ idCliente: string; idArticulo: string }> {
  const { rows } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
    `SELECT a.id_cliente, a.id FROM articulo a JOIN cliente c ON c.id = a.id_cliente
      WHERE a.activo AND c.activo AND c.id_cliente_principal IS NULL
        AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
      ORDER BY random() LIMIT 1`,
  );
  return { idCliente: rows[0]!.id_cliente, idArticulo: rows[0]!.id };
}

function crearOrden(cabecera: Cabecera, cuerpo: Record<string, unknown>) {
  return peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(cabecera)
    .send({ fallaReportada: 'No funciona desde la semana pasada', tipoGarantiaElegida: 'particular', ...cuerpo });
}

beforeAll(async () => {
  entorno = await montarApi();
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
  admin = await sesionDe(CODIGO_ROL.ADMINISTRADOR);
  gestor = await sesionDe(CODIGO_ROL.GESTOR_TECNICOS);
  const { rows } = await entorno.piscina.query<{ id: string; nombre_usuario: string }>(
    `SELECT t.id, u.nombre_usuario FROM tecnico t JOIN usuario u ON u.id = t.id_usuario
      WHERE t.tipo = 'ruta' AND t.activo AND u.activo AND NOT u.bloqueado ORDER BY u.nombre_usuario LIMIT 2`,
  );
  idTecnicoRuta = rows[0]!.id;
  idOtroTecnicoRuta = rows[1]!.id;
  tecnicoRuta = await iniciarSesion(rows[0]!.nombre_usuario);
  otroTecnicoRuta = await iniciarSesion(rows[1]!.nombre_usuario);
});

afterAll(async () => { await entorno.cerrar(); });

describe('modalidad de servicio al crear la orden (V-1 a V-3, V-13)', () => {
  it('visita a domicilio con fecha, franja y tecnico: queda de ruta, asignada y en la agenda', async () => {
    const fecha = fechaFutura();
    const creada = await crearOrden(admin, {
      ...(await articulo()), modalidad: MODALIDAD_SERVICIO.RUTA,
      visita: { fechaProgramada: fecha, franjaHoraria: '09:00-11:00', idTecnico: idTecnicoRuta },
    }).expect(201);
    expect(creada.body.data.modalidad).toBe('ruta');
    expect(creada.body.data.idTecnico).toBe(idTecnicoRuta);
    expect(creada.body.data.direccionServicio).toBeTypeOf('string');

    const visitas = await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${creada.body.data.id}/visitas`).set(admin).expect(200);
    expect(visitas.body.data).toHaveLength(1);
    expect(visitas.body.data[0]).toMatchObject({
      idTecnico: idTecnicoRuta, fechaProgramada: fecha, franjaHoraria: '09:00-11:00', resultado: 'programada',
      horaLlegada: null, horaSalida: null,
    });
  });

  it('quien no despacha registra la fecha que pide el cliente, sin programar ni asignar', async () => {
    const conTecnico = await crearOrden(agente, {
      ...(await articulo()), modalidad: MODALIDAD_SERVICIO.RUTA,
      visita: { fechaProgramada: fechaFutura(), franjaHoraria: '13:00-15:00', idTecnico: idTecnicoRuta },
    });
    expect(conTecnico.status).toBe(403);

    const fecha = fechaFutura();
    const creada = await crearOrden(agente, {
      ...(await articulo()), modalidad: MODALIDAD_SERVICIO.RUTA,
      visita: { fechaProgramada: fecha, franjaHoraria: '13:00-15:00' },
    }).expect(201);
    expect(creada.body.data.idTecnico).toBeNull();
    const { rows } = await entorno.piscina.query('SELECT 1 FROM visita WHERE id_orden = $1', [creada.body.data.id]);
    expect(rows).toHaveLength(0);
    expect(creada.body.data.eventos[0].observacion).toContain(`Visita solicitada por el cliente para el ${fecha}`);
  });

  it('taller: sin direccion ni franja, y no admite visita', async () => {
    const base = await articulo();
    const creada = await crearOrden(agente, { ...base, modalidad: MODALIDAD_SERVICIO.TALLER }).expect(201);
    expect(creada.body.data.modalidad).toBe('taller');
    expect(creada.body.data.direccionServicio).toBeNull();
    expect(creada.body.data.eventos[0].observacion).toMatch(/lleva el articulo al taller/);

    const conVisita = await crearOrden(agente, {
      ...base, modalidad: MODALIDAD_SERVICIO.TALLER,
      visita: { fechaProgramada: fechaFutura(), franjaHoraria: '09:00-11:00' },
    });
    expect(conVisita.status).toBe(400);

    // Tampoco se le programa visita despues.
    const programar = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${creada.body.data.id}/visitas`).set(gestor)
      .send({ idTecnico: idTecnicoRuta, fechaProgramada: fechaFutura(), franjaHoraria: '09:00-11:00' });
    expect(programar.status).toBe(422);
    expect(programar.body.error.code).toBe('ORDEN_DE_TALLER');
  });

  it('modalidad de servicio y garantia son independientes', async () => {
    const ruta = await crearOrden(agente, { ...(await articulo()), modalidad: MODALIDAD_SERVICIO.RUTA }).expect(201);
    const taller = await crearOrden(agente, { ...(await articulo()), modalidad: MODALIDAD_SERVICIO.TALLER }).expect(201);
    expect([ruta.body.data.modalidad, ruta.body.data.tipoGarantia]).toEqual(['ruta', 'particular']);
    expect([taller.body.data.modalidad, taller.body.data.tipoGarantia]).toEqual(['taller', 'particular']);
  });

  it('una fecha de visita pasada se rechaza', async () => {
    const respuesta = await crearOrden(agente, {
      ...(await articulo()), modalidad: MODALIDAD_SERVICIO.RUTA,
      visita: { fechaProgramada: '2020-01-01', franjaHoraria: '09:00-11:00' },
    });
    expect(respuesta.status).toBe(400);
  });
});

describe('visitas con horas reales (V-4 a V-7)', () => {
  let idOrden = '';
  let idVisita = '';

  beforeAll(async () => {
    const creada = await crearOrden(admin, {
      ...(await articulo()), modalidad: MODALIDAD_SERVICIO.RUTA,
      visita: { fechaProgramada: fechaFutura(), franjaHoraria: '11:00-13:00', idTecnico: idTecnicoRuta },
    }).expect(201);
    idOrden = creada.body.data.id;
    const visitas = await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${idOrden}/visitas`).set(admin).expect(200);
    idVisita = visitas.body.data[0].id;
  });

  it('solo el tecnico de la visita (o quien programa) registra; la salida exige la llegada', async () => {
    const ajeno = await peticion(entorno.aplicacion).post(`${RAIZ}/visitas/${idVisita}/llegada`).set(otroTecnicoRuta);
    expect(ajeno.status).not.toBe(200);

    const sinLlegada = await peticion(entorno.aplicacion).post(`${RAIZ}/visitas/${idVisita}/salida`).set(tecnicoRuta)
      .send({ resultado: 'resuelta_en_sitio' });
    expect(sinLlegada.status).toBe(422);
    expect(sinLlegada.body.error.code).toBe('SIN_LLEGADA');
  });

  it('registra llegada y salida con la hora del servidor, sin sobrescribir', async () => {
    const antes = Date.now();
    const llegada = await peticion(entorno.aplicacion).post(`${RAIZ}/visitas/${idVisita}/llegada`).set(tecnicoRuta).expect(200);
    const horaLlegada = new Date(llegada.body.data.horaLlegada).getTime();
    expect(horaLlegada).toBeGreaterThanOrEqual(antes - 5_000);
    // La franja programada no cambia: son datos distintos.
    expect(llegada.body.data.franjaHoraria).toBe('11:00-13:00');

    const otraVez = await peticion(entorno.aplicacion).post(`${RAIZ}/visitas/${idVisita}/llegada`).set(tecnicoRuta);
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error.code).toBe('LLEGADA_YA_REGISTRADA');

    const sinResultado = await peticion(entorno.aplicacion).post(`${RAIZ}/visitas/${idVisita}/salida`).set(tecnicoRuta).send({});
    expect(sinResultado.status).toBe(400);

    const salida = await peticion(entorno.aplicacion).post(`${RAIZ}/visitas/${idVisita}/salida`).set(tecnicoRuta)
      .send({ resultado: 'requiere_traslado_taller', observaciones: 'Compresor danado, hay que llevarlo al taller' })
      .expect(200);
    expect(salida.body.data.resultado).toBe('requiere_traslado_taller');
    expect(salida.body.data.motivo).toBe('Compresor danado, hay que llevarlo al taller');
    expect(new Date(salida.body.data.horaSalida).getTime()).toBeGreaterThanOrEqual(horaLlegada);
    expect(salida.body.data.horaLlegada).toBe(llegada.body.data.horaLlegada);

    const cerrada = await peticion(entorno.aplicacion).post(`${RAIZ}/visitas/${idVisita}/salida`).set(tecnicoRuta)
      .send({ resultado: 'resuelta_en_sitio' });
    expect(cerrada.status).toBe(422);
    expect(cerrada.body.error.code).toBe('VISITA_YA_REGISTRADA');
  });

  it('una segunda visita conserva la primera intacta, cada una con su tecnico', async () => {
    const segunda = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${idOrden}/visitas`).set(gestor)
      .send({ idTecnico: idOtroTecnicoRuta, fechaProgramada: fechaFutura(), franjaHoraria: '15:00-17:00' })
      .expect(201);
    expect(segunda.body.data.idTecnico).toBe(idOtroTecnicoRuta);

    const visitas = await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${idOrden}/visitas`).set(gestor).expect(200);
    expect(visitas.body.data).toHaveLength(2);
    const primera = visitas.body.data.find((v: { id: string }) => v.id === idVisita);
    expect(primera).toMatchObject({ idTecnico: idTecnicoRuta, resultado: 'requiere_traslado_taller' });
    expect(primera.horaLlegada).not.toBeNull();
    expect(primera.horaSalida).not.toBeNull();

    // El historial muestra llegada y resultado de la primera.
    const historial = await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${idOrden}/historial`).set(gestor).expect(200);
    const titulos = historial.body.data.map((e: { titulo: string }) => e.titulo);
    expect(titulos.some((t: string) => t.startsWith('Llegada al domicilio'))).toBe(true);
    expect(titulos).toContain('Resultado de la visita: requiere traslado taller');
  });

  it('la agenda filtra por fecha y tecnico, cuenta por resultado, y el tecnico solo ve las suyas', async () => {
    const desde = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
    const hasta = new Date(Date.now() + 500 * 86_400_000).toISOString().slice(0, 10);
    const resumen = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/agenda/resumen?desde=${desde}&hasta=${hasta}&idTecnico=${idTecnicoRuta}`).set(gestor).expect(200);
    expect(resumen.body.data.realizadas).toBeGreaterThanOrEqual(1);
    expect(resumen.body.data.requiereTrasladoTaller).toBeGreaterThanOrEqual(1);
    expect(resumen.body.data.programadas).toBeGreaterThanOrEqual(1);

    const delTecnico = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/agenda?desde=${desde}&hasta=${hasta}&tamano=100`).set(tecnicoRuta).expect(200);
    expect(delTecnico.body.data.length).toBeGreaterThan(0);
    expect(delTecnico.body.data.every((v: { idTecnico: string }) => v.idTecnico === idTecnicoRuta)).toBe(true);
  });
});

describe('garantia adicional por meses (V-8 a V-12)', () => {
  let r = { id_cliente: '', id_marca: '', id_categoria: '', id_tienda: '' };
  beforeAll(async () => {
    const { rows } = await entorno.piscina.query<typeof r>(
      `SELECT (SELECT id FROM cliente WHERE activo AND id_cliente_principal IS NULL LIMIT 1) AS id_cliente,
              (SELECT id FROM marca LIMIT 1) AS id_marca,
              (SELECT id FROM categoria_articulo WHERE activa LIMIT 1) AS id_categoria,
              (SELECT id FROM tienda_origen WHERE pertenece_al_grupo LIMIT 1) AS id_tienda`,
    );
    r = rows[0]!;
  });

  function nuevoArticulo(extra: Record<string, unknown>) {
    return peticion(entorno.aplicacion).post(`${RAIZ}/articulos`).set(agente).send({
      idCliente: r.id_cliente, idMarca: r.id_marca, idCategoria: r.id_categoria, idTiendaOrigen: r.id_tienda,
      modelo: 'Prueba', numeroSerie: `GA-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, ...extra,
    });
  }

  it('sin garantia adicional: no pide fechas y queda no registrada', async () => {
    const creado = await nuevoArticulo({ fechaCompra: '2026-01-10' }).expect(201);
    expect(creado.body.data.coberturas).toHaveLength(0);
    const evaluacion = await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/evaluar`).set(agente)
      .send({ idArticulo: creado.body.data.id }).expect(200);
    expect(evaluacion.body.data.garantias.adicional.vigencia).toBe('no_registrada');
    expect(evaluacion.body.data.garantias.proveedor.desde).toBe('2026-01-10');
  });

  it('con garantia adicional: el servidor calcula el vencimiento, tambien a fin de mes', async () => {
    const fin = await nuevoArticulo({
      fechaCompra: '2025-01-31', garantiaAdicional: { fechaContratacion: '2025-01-31', meses: 13 },
    }).expect(201);
    expect(fin.body.data.coberturas[0]).toMatchObject({
      tipo: 'adicional', vigenteDesde: '2025-01-31', vigenteHasta: '2026-02-28', meses: 13,
    });

    const hoy = new Date();
    const contratacion = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 2, 15)).toISOString().slice(0, 10);
    const vigente = await nuevoArticulo({
      fechaCompra: contratacion, garantiaAdicional: { fechaContratacion: contratacion, meses: 24 },
    }).expect(201);
    const evaluacion = await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/evaluar`).set(agente)
      .send({ idArticulo: vigente.body.data.id }).expect(200);
    // Proveedor y adicional, por separado y con sus propias fechas.
    expect(evaluacion.body.data.garantias.adicional).toMatchObject({ vigencia: 'vigente', desde: contratacion, meses: 24 });
    expect(evaluacion.body.data.garantias.proveedor.desde).toBe(contratacion);
    expect(evaluacion.body.data.garantias.proveedor.origen).toBe('regla');
  });

  it('valida meses, fechas futuras y contratacion anterior a la compra', async () => {
    expect((await nuevoArticulo({ fechaCompra: '2026-01-10', garantiaAdicional: { fechaContratacion: '2026-01-10', meses: 0 } })).status).toBe(400);
    expect((await nuevoArticulo({ fechaCompra: '2026-01-10', garantiaAdicional: { fechaContratacion: '2099-01-10', meses: 12 } })).status).toBe(400);
    expect((await nuevoArticulo({ fechaCompra: '2026-01-10', garantiaAdicional: { fechaContratacion: '2025-12-01', meses: 12 } })).status).toBe(400);
    expect((await nuevoArticulo({ fechaCompra: '2026-02-30' })).status).toBe(400);
  });

  it('registrar una garantia en la ficha por meses tambien la calcula el servidor', async () => {
    const jefeTecnicos = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);
    const creado = await nuevoArticulo({ fechaCompra: '2025-08-31' }).expect(201);
    const ficha = await peticion(entorno.aplicacion).post(`${RAIZ}/articulos/${creado.body.data.id}/coberturas`).set(jefeTecnicos)
      .send({ tipo: 'adicional', vigenteDesde: '2025-08-31', meses: 6 }).expect(201);
    expect(ficha.body.data.coberturas[0]).toMatchObject({ vigenteHasta: '2026-02-28', meses: 6 });

    const ambas = await peticion(entorno.aplicacion).post(`${RAIZ}/articulos/${creado.body.data.id}/coberturas`).set(jefeTecnicos)
      .send({ tipo: 'adicional', vigenteDesde: '2025-08-31', meses: 6, vigenteHasta: '2026-03-01' });
    expect(ambas.status).toBe(400);
  });
});
