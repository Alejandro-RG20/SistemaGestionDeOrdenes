/**
 * Asignacion, despacho, estado «autorizada», bitacora y garantias por
 * articulo, contra la API y la base reales.
 *
 * Cada bloque prepara su propia orden. Los numeros de cada prueba (P-nn)
 * remiten a la lista de pruebas obligatorias del documento de auditoria.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, MODALIDAD_SERVICIO } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
type Cabecera = { Authorization: string };

let entorno: EntornoApi;
let agente: Cabecera;
let jefatura: Cabecera;
let gestor: Cabecera;
let consulta: Cabecera;
let tecnico: Cabecera;
let idTecnico = '';
let nombreTecnico = '';
let otroTecnico = { id: '', nombre: '' };

async function iniciarSesion(nombreUsuario: string): Promise<Cabecera> {
  const sesion = await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}
const sesionDe = async (rol: string): Promise<Cabecera> => iniciarSesion(await usuarioConRol(entorno.piscina, rol));

function mover(cabecera: Cabecera, idOrden: string, hacia: string, extra: Record<string, unknown> = {}) {
  return peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${idOrden}/estado`).set(cabecera).send({ hacia, ...extra });
}
const ficha = async (cabecera: Cabecera, idOrden: string) =>
  (await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${idOrden}`).set(cabecera).expect(200)).body.data;
const historial = async (cabecera: Cabecera, idOrden: string) =>
  (await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${idOrden}/historial`).set(cabecera).expect(200)).body.data as
    Array<{ tipo: string; titulo: string; detalle: string | null; responsable: string | null; momento: string }>;

/** Evidencia obligatoria de un momento, por SQL (la carga real se prueba aparte). */
async function evidencia(idOrden: string, momento: string): Promise<void> {
  await entorno.piscina.query(
    `INSERT INTO evidencia (id_orden, tipo, clave, ruta_archivo, momento_dispositivo, sincronizada)
     SELECT DISTINCT o.id,
            (CASE WHEN re.clave LIKE 'firma%' THEN 'firma' WHEN re.clave LIKE 'foto%' THEN 'foto'
                  WHEN re.clave LIKE 'medicion%' THEN 'medicion' ELSE 'documento' END)::tipo_evidencia,
            re.clave, 'pruebas/' || o.id || '/' || re.clave || '.jpg', now(), true
       FROM orden_servicio o JOIN articulo a ON a.id = o.id_articulo
       JOIN regla_evidencia re ON re.tipo = o.tipo_garantia AND re.activa AND re.obligatoria AND re.bloquea_avance
        AND re.momento = $2::momento_evidencia
        AND (re.id_categoria IS NULL OR re.id_categoria = a.id_categoria)
        AND (re.id_marca IS NULL OR re.id_marca = a.id_marca)
      WHERE o.id = $1 AND NOT EXISTS (SELECT 1 FROM evidencia ev WHERE ev.id_orden = o.id AND ev.clave = re.clave)`,
    [idOrden, momento],
  );
}

/** Articulo de un cliente activo con telefono. `filtro` acota el articulo. */
async function articulo(filtro = 'true'): Promise<{ idCliente: string; idArticulo: string }> {
  const { rows } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
    `SELECT a.id_cliente, a.id FROM articulo a
       JOIN cliente c ON c.id = a.id_cliente JOIN tienda_origen t ON t.id = a.id_tienda_origen
      WHERE a.activo AND c.activo AND c.id_cliente_principal IS NULL
        AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
        AND NOT EXISTS (SELECT 1 FROM orden_servicio o WHERE o.id_articulo = a.id
                         AND o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada'))
        AND ${filtro}
      ORDER BY random() LIMIT 1`,
  );
  return { idCliente: rows[0]!.id_cliente, idArticulo: rows[0]!.id };
}

async function ordenDeTaller(tipoGarantiaElegida = 'particular', filtro = 'true'): Promise<string> {
  const base = await articulo(filtro);
  const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente).send({
    ...base, modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'No enciende desde hace dos dias', tipoGarantiaElegida,
  }).expect(201);
  return creada.body.data.id as string;
}

/** Lleva una orden de taller hasta «en diagnostico», despachada por el gestor de tecnicos. */
async function hastaDiagnostico(idOrden: string): Promise<void> {
  await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${idOrden}/tecnico`).set(gestor).send({ idTecnico }).expect(200);
  await evidencia(idOrden, 'recepcion');
  await mover(gestor, idOrden, 'asignada').expect(200);
  await evidencia(idOrden, 'validacion_garantia');
  await mover(gestor, idOrden, 'en_cola_taller').expect(200);
  await mover(gestor, idOrden, 'en_diagnostico').expect(200);
}

beforeAll(async () => {
  entorno = await montarApi();
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
  jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
  gestor = await sesionDe(CODIGO_ROL.GESTOR_TECNICOS);
  consulta = await sesionDe(CODIGO_ROL.USUARIO_CONSULTA);
  const { rows } = await entorno.piscina.query<{ id: string; nombre_usuario: string; nombres: string }>(
    `SELECT t.id, u.nombre_usuario, trim(u.nombres) AS nombres FROM tecnico t JOIN usuario u ON u.id = t.id_usuario
      WHERE t.tipo = 'planta' AND t.activo AND u.activo AND NOT u.bloqueado ORDER BY u.nombre_usuario LIMIT 2`,
  );
  idTecnico = rows[0]!.id;
  nombreTecnico = rows[0]!.nombres;
  otroTecnico = { id: rows[1]!.id, nombre: rows[1]!.nombres };
  tecnico = await iniciarSesion(rows[0]!.nombre_usuario);
});

afterAll(async () => { await entorno.cerrar(); });

describe('asignacion y reasignacion (P-10 a P-12)', () => {
  let idOrden = '';
  beforeAll(async () => { idOrden = await ordenDeTaller(); });

  it('la ficha muestra el tecnico guardado y el estado no cambia al asignar', async () => {
    const respuesta = await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${idOrden}/tecnico`).set(gestor)
      .send({ idTecnico }).expect(200);
    expect(respuesta.body.data.tecnico).toBe(nombreTecnico);
    const orden = await ficha(gestor, idOrden);
    expect(orden.idTecnico).toBe(idTecnico);
    expect(orden.tecnico).toBe(nombreTecnico);
    expect(orden.estado).toBe('registrada');
  });

  it('reasignar exige motivo y conserva el historial con quien y cuando', async () => {
    const sinMotivo = await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${idOrden}/tecnico`).set(gestor)
      .send({ idTecnico: otroTecnico.id });
    expect(sinMotivo.status).toBe(400);

    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${idOrden}/tecnico`).set(gestor)
      .send({ idTecnico: otroTecnico.id, motivo: 'Carga de trabajo del primer tecnico' }).expect(200);
    expect((await ficha(gestor, idOrden)).idTecnico).toBe(otroTecnico.id);

    const eventos = await historial(gestor, idOrden);
    const asignaciones = eventos.filter((e) => e.tipo === 'asignacion');
    expect(asignaciones.map((e) => e.titulo)).toEqual(expect.arrayContaining([
      `Tecnico asignado: ${nombreTecnico}`,
      `Reasignada: ${nombreTecnico} → ${otroTecnico.nombre}`,
    ]));
    const reasignada = asignaciones.find((e) => e.titulo.startsWith('Reasignada'))!;
    expect(reasignada.detalle).toBe('Carga de trabajo del primer tecnico');
    expect(reasignada.responsable).toBeTypeOf('string');
  });

  it('al reasignar en un estado del tecnico, el responsable pasa al nuevo', async () => {
    const id = await ordenDeTaller();
    await hastaDiagnostico(id);
    const { rows: antes } = await entorno.piscina.query<{ id_responsable_actual: string }>(
      'SELECT id_responsable_actual FROM orden_servicio WHERE id = $1', [id]);
    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${id}/tecnico`).set(gestor)
      .send({ idTecnico: otroTecnico.id, motivo: 'El primer tecnico salio de vacaciones' }).expect(200);
    const { rows: despues } = await entorno.piscina.query<{ id_responsable_actual: string; usuario_nuevo: string }>(
      `SELECT o.id_responsable_actual, t.id_usuario AS usuario_nuevo
         FROM orden_servicio o JOIN tecnico t ON t.id = $2 WHERE o.id = $1`, [id, otroTecnico.id]);
    expect(despues[0]!.id_responsable_actual).not.toBe(antes[0]!.id_responsable_actual);
    expect(despues[0]!.id_responsable_actual).toBe(despues[0]!.usuario_nuevo);
    // El tecnico al que se le quito ya no puede moverla.
    const quitado = await mover(tecnico, id, 'cerrada_sin_reparar');
    expect(quitado.status).not.toBe(200);
  });
});

describe('despacho y transiciones (P-13 a P-15)', () => {
  it('quien asigna puede despachar; el agente sigue bloqueado; las acciones coinciden', async () => {
    const id = await ordenDeTaller();
    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${id}/tecnico`).set(gestor).send({ idTecnico }).expect(200);
    await evidencia(id, 'recepcion');
    await mover(gestor, id, 'asignada').expect(200);

    // Lo que el panel ofrece es lo que el servidor acepta.
    await evidencia(id, 'validacion_garantia');
    const accionesAgente = (await ficha(agente, id)).acciones as Array<{ hacia: string; permitida: boolean; motivo: string | null }>;
    const delAgente = accionesAgente.find((a) => a.hacia === 'en_cola_taller')!;
    expect(delAgente.permitida).toBe(false);
    expect(delAgente.motivo).not.toMatch(/jefe_tecnicos/);
    const rechazo = await mover(agente, id, 'en_cola_taller');
    expect(rechazo.status).toBe(422);
    expect(rechazo.body.error.code).toBe('NO_ES_RESPONSABLE');

    expect(((await ficha(gestor, id)).acciones as Array<{ hacia: string; permitida: boolean }>)
      .find((a) => a.hacia === 'en_cola_taller')!.permitida).toBe(true);
    await mover(gestor, id, 'en_cola_taller').expect(200);
    await mover(gestor, id, 'en_diagnostico').expect(200);
    // El despacho no le da al gestor los pasos del tecnico.
    expect((await mover(gestor, id, 'cotizada')).body.error.code).toBe('NO_ES_RESPONSABLE');
  });

  it('el administrador mueve cualquier paso, pero cumpliendo los requisitos', async () => {
    const admin = await sesionDe(CODIGO_ROL.ADMINISTRADOR);
    const id = await ordenDeTaller();
    const sinTecnico = await mover(admin, id, 'asignada');
    expect(sinTecnico.status).toBe(422);
    expect(sinTecnico.body.error.code).toBe('REQUISITO_INCUMPLIDO');
    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${id}/tecnico`).set(admin).send({ idTecnico }).expect(200);
    await evidencia(id, 'recepcion');
    await mover(admin, id, 'asignada').expect(200);
  });
});

describe('reparacion particular: cotizacion, autorizacion y «autorizada» (P-20 a P-24)', () => {
  let id = '';
  beforeAll(async () => {
    id = await ordenDeTaller('particular');
    await hastaDiagnostico(id);
  });

  it('diagnostica y cotiza desde el panel; sin cotizacion aceptada no se autoriza', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/diagnostico`).set(tecnico)
      .send({ fallaReal: 'Tarjeta principal danada por humedad', componente: 'tarjeta' }).expect(201);
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/cotizaciones`).set(tecnico)
      .send({ manoObra: 800, totalRepuestos: 2400 }).expect(201);
    await evidencia(id, 'diagnostico');
    await mover(tecnico, id, 'cotizada').expect(200);

    // Una particular no salta de cotizada a reparacion.
    const atajo = await mover(tecnico, id, 'en_reparacion');
    expect(atajo.status).toBe(422);
    await mover(tecnico, id, 'esperando_autorizacion').expect(200);

    const sinAceptar = await mover(jefatura, id, 'autorizada');
    expect(sinAceptar.status).toBe(422);
    expect(sinAceptar.body.error.message).toMatch(/no acepta la cotizacion/);
  });

  it('un comentario de bitacora no autoriza nada', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/bitacora`).set(agente)
      .send({ texto: 'El cliente dice que acepta y que confirma; autorizado.' }).expect(201);
    expect((await ficha(jefatura, id)).estado).toBe('esperando_autorizacion');
    expect((await mover(jefatura, id, 'autorizada')).status).toBe(422);
  });

  it('con la aceptacion registrada, autoriza solo quien tiene el permiso, y no inicia la reparacion', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/cotizaciones/decision`).set(jefatura)
      .send({ aceptada: true, forma: 'llamada', observacion: 'Acepto por telefono' }).expect(200);

    const tecnicoIntenta = await mover(tecnico, id, 'autorizada');
    expect(tecnicoIntenta.status).toBe(422);
    expect(tecnicoIntenta.body.error.code).toBe('NO_ES_RESPONSABLE');

    const { rows: visitasAntes } = await entorno.piscina.query('SELECT 1 FROM visita WHERE id_orden = $1', [id]);
    await mover(jefatura, id, 'autorizada', { observacion: 'Revisado con el cliente' }).expect(200);
    const orden = await ficha(jefatura, id);
    expect(orden.estado).toBe('autorizada');
    const { rows: visitasDespues } = await entorno.piscina.query('SELECT 1 FROM visita WHERE id_orden = $1', [id]);
    expect(visitasDespues.length).toBe(visitasAntes.length);

    const eventos = await historial(jefatura, id);
    const autorizacion = eventos.find((e) => e.tipo === 'estado' && e.titulo.endsWith('→ autorizada'))!;
    expect(autorizacion.detalle).toMatch(/acepto la cotizacion/);
    expect(autorizacion.detalle).toMatch(/Revisado con el cliente/);
    expect(autorizacion.responsable).toBeTypeOf('string');

    // Sigue el tecnico, con una transicion explicita.
    await mover(tecnico, id, 'en_reparacion').expect(200);
  });
});

describe('garantia del proveedor y exclusion por daño (P-16 a P-18, P-24)', () => {
  const recienteDelGrupo = `t.pertenece_al_grupo AND a.fecha_compra > current_date - interval '4 months'
    AND NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id)`;

  it('muestra el estado de cada garantia y rechaza elegir una que no aplica', async () => {
    const base = await articulo(`t.pertenece_al_grupo AND a.fecha_compra < current_date - interval '37 months'
      AND NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id)`);
    const evaluacion = await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/evaluar`).set(agente)
      .send({ idArticulo: base.idArticulo, idClienteSolicitante: base.idCliente }).expect(200);
    expect(evaluacion.body.data.garantias.proveedor.vigencia).toBe('vencida');
    expect(evaluacion.body.data.garantias.proveedor.aplicable).toBe(false);
    expect(evaluacion.body.data.garantias.adicional.vigencia).toBe('no_registrada');

    const vencida = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente).send({
      ...base, modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'No enciende desde ayer', tipoGarantiaElegida: 'proveedor',
    });
    expect(vencida.status).toBe(422);
    expect(vencida.body.error.code).toBe('GARANTIA_NO_APLICABLE');

    // Particular siempre se puede, aunque haya garantia.
    const particular = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente).send({
      ...base, modalidad: MODALIDAD_SERVICIO.RUTA, fallaReportada: 'Servicio particular a domicilio', tipoGarantiaElegida: 'particular',
    }).expect(201);
    expect(particular.body.data.tipoGarantia).toBe('particular');
    expect(particular.body.data.modalidad).toBe('ruta');
  });

  it('las fechas registradas en el articulo mandan sobre la regla y no cambian ordenes cerradas', async () => {
    const jefeTecnicos = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);
    const base = await articulo(`t.pertenece_al_grupo AND a.fecha_compra < current_date - interval '37 months'
      AND NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id)`);
    const { rows: cerradas } = await entorno.piscina.query<{ id: string; tipo_garantia: string }>(
      `SELECT id, tipo_garantia::text FROM orden_servicio WHERE id_articulo = $1
        AND estado IN ('entregada','cerrada_sin_reparar','anulada')`, [base.idArticulo]);

    const hoy = new Date();
    const desde = new Date(hoy.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const hasta = new Date(hoy.getTime() + 365 * 86_400_000).toISOString().slice(0, 10);
    await peticion(entorno.aplicacion).post(`${RAIZ}/articulos/${base.idArticulo}/coberturas`).set(jefeTecnicos)
      .send({ tipo: 'proveedor', vigenteDesde: desde, vigenteHasta: hasta, documentoRespaldo: 'Carta del fabricante' })
      .expect(201);

    const evaluacion = await peticion(entorno.aplicacion).post(`${RAIZ}/coberturas/evaluar`).set(agente)
      .send({ idArticulo: base.idArticulo, idClienteSolicitante: base.idCliente }).expect(200);
    expect(evaluacion.body.data.garantias.proveedor).toMatchObject({ vigencia: 'vigente', origen: 'registrada', venceEl: hasta });

    for (const cerrada of cerradas) {
      const { rows } = await entorno.piscina.query<{ tipo_garantia: string }>(
        'SELECT tipo_garantia::text FROM orden_servicio WHERE id = $1', [cerrada.id]);
      expect(rows[0]!.tipo_garantia).toBe(cerrada.tipo_garantia);
    }
  });

  it('un golpe constatado en el diagnostico pasa la orden a cargo del cliente sin cambiar su modalidad', async () => {
    const id = await ordenDeTaller('proveedor', recienteDelGrupo);
    expect((await ficha(agente, id)).tipoGarantia).toBe('proveedor');
    await hastaDiagnostico(id);
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/diagnostico`).set(tecnico)
      .send({ fallaReal: 'Carcasa partida y tarjeta danada', exclusion: 'Golpe fuerte en la parte trasera' }).expect(201);

    const orden = await ficha(agente, id);
    expect(orden.tipoGarantia).toBe('particular');
    expect(orden.modalidad).toBe('taller');
    const eventos = await historial(agente, id);
    expect(eventos.some((e) => (e.detalle ?? '').includes('de proveedor a particular')
      && (e.detalle ?? '').includes('Golpe fuerte'))).toBe(true);
  });
});

describe('visita particular con pago previo (P-19, P-21, P-23, P-32, P-33)', () => {
  let id = '';
  beforeAll(async () => {
    const base = await articulo(`EXISTS (SELECT 1 FROM cliente_direccion d JOIN zona z ON z.id = d.id_zona
      WHERE d.id_cliente = c.id AND d.vigente AND z.cargo_visita > 0)`);
    const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente).send({
      ...base, modalidad: MODALIDAD_SERVICIO.RUTA, fallaReportada: 'No enfria; visita a domicilio', tipoGarantiaElegida: 'particular',
    }).expect(201);
    id = creada.body.data.id;
    expect(creada.body.data.cargoVisita).toBeGreaterThan(0);
  });

  it('espera autorizacion y no se autoriza sin pago registrado y confirmado por otra persona', async () => {
    await mover(agente, id, 'esperando_autorizacion').expect(200);
    const sinPago = await mover(jefatura, id, 'autorizada');
    expect(sinPago.status).toBe(422);
    expect(sinPago.body.error.message).toMatch(/pago previo/);

    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/bitacora`).set(agente)
      .send({ texto: 'El cliente realizo el pago de la visita a domicilio', tipo: 'pago_registrado' }).expect(201);
    // Quien lo registro no lo puede confirmar.
    const propia = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/bitacora`).set(agente)
      .send({ texto: 'Confirmo el pago', tipo: 'pago_confirmado' });
    expect(propia.status).toBe(422);
    expect(propia.body.error.code).toBe('CONFIRMACION_PROPIA');
    expect((await mover(jefatura, id, 'autorizada')).status).toBe(422);

    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/bitacora`).set(jefatura)
      .send({ texto: 'Confirmo que el pago fue realizado correctamente', tipo: 'pago_confirmado' }).expect(201);
    expect((await ficha(jefatura, id)).estado).toBe('esperando_autorizacion');

    await mover(jefatura, id, 'autorizada').expect(200);
    const { rows } = await entorno.piscina.query('SELECT 1 FROM visita WHERE id_orden = $1', [id]);
    expect(rows).toHaveLength(0);
    expect((await ficha(jefatura, id)).estado).toBe('autorizada');
  });

  it('autorizada vuelve al despacho con una transicion explicita', async () => {
    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${id}/tecnico`).set(gestor).send({ idTecnico: otroTecnico.id }).expect(200);
    await mover(gestor, id, 'asignada').expect(200);
  });

  it('una orden sin pago previo no queda retenida esperando autorizacion', async () => {
    // Particular de taller: no hay visita que pagar, asi que no se le ofrece
    // ni se le exige pasar por autorizacion antes de despacharse.
    const id2 = await ordenDeTaller('particular');
    const accion = ((await ficha(agente, id2)).acciones as Array<{ hacia: string; permitida: boolean }>)
      .find((a) => a.hacia === 'esperando_autorizacion')!;
    expect(accion.permitida).toBe(false);
    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${id2}/tecnico`).set(gestor).send({ idTecnico }).expect(200);
    await evidencia(id2, 'recepcion');
    await mover(gestor, id2, 'asignada').expect(200);
  });
});

describe('bitacora de la orden (P-25 a P-31)', () => {
  let id = '';
  beforeAll(async () => { id = await ordenDeTaller(); });

  it('guarda el comentario con el autor de la sesion y la hora del servidor, y no cambia el estado', async () => {
    const antes = Date.now();
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/bitacora`).set(gestor)
      .send({ texto: 'El cliente pidio que lo llamen despues de las 3 pm.', autor: 'Otra Persona', momento: '2001-01-01T00:00:00Z' })
      .expect(201);
    const { rows } = await entorno.piscina.query<{ nombres: string }>(
      "SELECT trim(u.nombres) AS nombres FROM usuario u JOIN rol r ON r.id = u.id_rol WHERE r.codigo = 'gestor_tecnicos' AND u.id = $1",
      [respuesta.body.data.idAutor]);
    expect(respuesta.body.data.autor).toBe(rows[0]!.nombres);
    expect(new Date(respuesta.body.data.momento).getTime()).toBeGreaterThanOrEqual(antes - 5_000);
    expect(respuesta.body.data.tipo).toBe('comentario');

    const entrada = (await historial(agente, id)).find((e) => e.tipo === 'bitacora')!;
    expect(entrada.titulo).toBe('El cliente pidio que lo llamen despues de las 3 pm.');
    expect(entrada.responsable).toBe(rows[0]!.nombres);
    expect((await ficha(agente, id)).estado).toBe('registrada');
  });

  it('rechaza el comentario vacio y a quien solo consulta', async () => {
    const vacio = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/bitacora`).set(agente).send({ texto: '   ' });
    expect(vacio.status).toBe(400);
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/bitacora`).set(consulta)
      .send({ texto: 'Intento de quien solo consulta' }).expect(403);
  });

  it('las entradas no se editan ni se borran; se corrigen con otra entrada', async () => {
    const original = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/bitacora`).set(agente)
      .send({ texto: 'El cliente vive en el km 9' }).expect(201);
    await expect(entorno.piscina.query("UPDATE bitacora SET valor_nuevo = 'cambiado' WHERE id = $1", [original.body.data.id]))
      .rejects.toThrow(/no se modifican/);
    await expect(entorno.piscina.query('DELETE FROM bitacora WHERE id = $1', [original.body.data.id]))
      .rejects.toThrow(/no se modifican/);

    const correccion = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/bitacora`).set(agente)
      .send({ texto: 'Era el km 19, no el 9', tipo: 'correccion', idEntradaCorregida: original.body.data.id }).expect(201);
    expect(correccion.body.data.idEntradaCorregida).toBe(original.body.data.id);
    const eventos = (await historial(agente, id)).filter((e) => e.tipo === 'bitacora');
    expect(eventos.map((e) => e.titulo)).toEqual(expect.arrayContaining(['El cliente vive en el km 9', 'Era el km 19, no el 9']));
  });
});

describe('gestion de tecnicos (P-8, P-9)', () => {
  let administrador: Cabecera;
  beforeAll(async () => { administrador = await sesionDe(CODIGO_ROL.ADMINISTRADOR); });

  it('registra un tecnico con cuenta nueva y su bodega, sin duplicar', async () => {
    const creado = await peticion(entorno.aplicacion).post(`${RAIZ}/tecnicos`).set(jefatura).send({
      tipo: 'planta', especialidad: 'lavado',
      cuentaNueva: { nombreUsuario: 'tecnico.nuevo', nombres: 'Tecnico Nuevo De Prueba', contrasena: 'contrasena-larga-9' },
    }).expect(201);
    expect(creado.body.data).toMatchObject({ tipo: 'planta', especialidad: 'lavado', activo: true, cuentaActiva: true });
    expect(creado.body.data.bodega).toMatch(/Banco de taller/);

    const duplicado = await peticion(entorno.aplicacion).post(`${RAIZ}/tecnicos`).set(jefatura)
      .send({ tipo: 'planta', especialidad: 'lavado', idUsuario: creado.body.data.idUsuario });
    expect(duplicado.status).toBe(409);
    expect(duplicado.body.error.code).toBe('TECNICO_DUPLICADO');

    const malaEspecialidad = await peticion(entorno.aplicacion).post(`${RAIZ}/tecnicos`).set(jefatura).send({
      tipo: 'ruta', especialidad: 'astronautica',
      cuentaNueva: { nombreUsuario: 'otro.tecnico', nombres: 'Otro Tecnico', contrasena: 'contrasena-larga-9' },
    });
    expect(malaEspecialidad.status).toBe(400);

    // El nuevo puede entrar con su cuenta.
    const sesion = await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: 'tecnico.nuevo', contrasena: 'contrasena-larga-9' });
    expect(sesion.status).toBe(201);
  });

  it('solo administra quien gestiona al personal; quien despacha consulta', async () => {
    await peticion(entorno.aplicacion).get(`${RAIZ}/tecnicos?estado=todos`).set(gestor).expect(200);
    await peticion(entorno.aplicacion).post(`${RAIZ}/tecnicos`).set(gestor)
      .send({ tipo: 'ruta', especialidad: 'lavado', idUsuario: '00000000-0000-4000-8000-000000000000' }).expect(403);
    await peticion(entorno.aplicacion).get(`${RAIZ}/tecnicos`).set(consulta).expect(403);
  });

  it('edita, no se da de baja con trabajo pendiente sin reemplazo, y al darse de baja reasigna con historial', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      `SELECT t.id FROM tecnico t JOIN usuario u ON u.id = t.id_usuario
        WHERE t.activo AND t.tipo = 'planta' AND t.id NOT IN ($1, $2)
          AND NOT EXISTS (SELECT 1 FROM bodega b JOIN existencia e ON e.id_bodega = b.id
                           WHERE b.id_tecnico = t.id AND e.cantidad > 0)
        LIMIT 1`, [idTecnico, otroTecnico.id]);
    const id = rows[0]!.id;

    const editado = await peticion(entorno.aplicacion).patch(`${RAIZ}/tecnicos/${id}`).set(jefatura)
      .send({ disponible: false }).expect(200);
    expect(editado.body.data.disponible).toBe(false);

    const idOrden = await ordenDeTaller();
    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${idOrden}/tecnico`).set(gestor).send({ idTecnico: id }).expect(200);

    const sinReemplazo = await peticion(entorno.aplicacion).post(`${RAIZ}/tecnicos/${id}/desactivar`).set(administrador)
      .send({ motivo: 'Finalizo su contrato laboral' });
    expect(sinReemplazo.status).toBe(409);
    expect(sinReemplazo.body.error.code).toBe('TECNICO_CON_ORDENES');

    const baja = await peticion(entorno.aplicacion).post(`${RAIZ}/tecnicos/${id}/desactivar`).set(administrador)
      .send({ motivo: 'Finalizo su contrato laboral', idTecnicoReemplazo: otroTecnico.id }).expect(200);
    expect(baja.body.data.activo).toBe(false);
    expect(baja.body.data.ordenesAbiertas).toBe(0);
    // La cuenta de usuario no se toca: son estados distintos.
    expect(baja.body.data.cuentaActiva).toBe(true);

    const orden = await ficha(gestor, idOrden);
    expect(orden.idTecnico).toBe(otroTecnico.id);
    const reasignada = (await historial(gestor, idOrden)).find((e) => e.titulo.startsWith('Reasignada'))!;
    expect(reasignada.detalle).toMatch(/Finalizo su contrato laboral/);

    const inactivos = await peticion(entorno.aplicacion).get(`${RAIZ}/tecnicos?estado=inactivos&tamano=100`).set(gestor).expect(200);
    expect(inactivos.body.data.map((t: { id: string }) => t.id)).toContain(id);

    const alta = await peticion(entorno.aplicacion).post(`${RAIZ}/tecnicos/${id}/activar`).set(jefatura)
      .send({ motivo: 'Fue recontratado por temporada' }).expect(200);
    expect(alta.body.data.activo).toBe(true);
  });
});
