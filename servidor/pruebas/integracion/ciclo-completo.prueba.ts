/**
 * El ciclo completo de una orden de reparacion, de punta a punta, por la API.
 *
 * Es la verificacion que pide la reestructuracion: crear la orden, asignar
 * el tecnico, diagnosticar, pedir el repuesto, reservarlo, entregarlo,
 * consumirlo, devolver lo que sobro, ver el inventario y el kardex, adjuntar
 * evidencia, revisar, entregar el articulo y leer el historial. Todo sin
 * registrar un solo pago: el sistema gestiona ordenes e inventario, no
 * dinero (migracion 0023).
 *
 * Las pruebas de este archivo van en orden y comparten la orden: cada una es
 * un paso del mismo recorrido.
 */
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import {
  CODIGO_ROL, ESTADO_ORDEN, ESTADO_SOLICITUD, MODALIDAD_SERVICIO, TIPO_MOVIMIENTO,
} from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
type Cabecera = { Authorization: string };

let entorno: EntornoApi;
let agente: Cabecera;
let jefatura: Cabecera;
let jefeTecnicos: Cabecera;
let bodeguero: Cabecera;
let consulta: Cabecera;
let tecnico: Cabecera;
let otroTecnico: { id: string };
let idTecnico: string;

/** Lo que los pasos se van pasando. */
const ciclo = {
  idOrden: '',
  idRepuesto: '',
  idCentral: '',
  idBodegaTecnico: '',
  idSolicitud: '',
  idSolicitudSinStock: '',
};

async function iniciarSesion(nombreUsuario: string): Promise<Cabecera> {
  const sesion = await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}

async function sesionDe(codigoRol: string): Promise<Cabecera> {
  return iniciarSesion(await usuarioConRol(entorno.piscina, codigoRol));
}

function mover(cabecera: Cabecera, hacia: string, extra: Record<string, unknown> = {}) {
  return peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${ciclo.idOrden}/estado`)
    .set(cabecera).send({ hacia, ...extra });
}

function paso(cabecera: Cabecera, idSolicitud: string, cuerpo: Record<string, unknown>) {
  return peticion(entorno.aplicacion).post(`${RAIZ}/solicitudes-repuesto/${idSolicitud}/pasos`)
    .set(cabecera).send(cuerpo);
}

/** Carga por SQL la evidencia obligatoria de un momento (la carga real se prueba aparte). */
async function evidenciaObligatoria(momento: string): Promise<void> {
  await entorno.piscina.query(
    `INSERT INTO evidencia (id_orden, tipo, clave, ruta_archivo, momento_dispositivo, sincronizada)
     SELECT DISTINCT o.id,
            (CASE WHEN re.clave LIKE 'firma%' THEN 'firma' WHEN re.clave LIKE 'foto%' THEN 'foto'
                  WHEN re.clave LIKE 'medicion%' THEN 'medicion' ELSE 'documento' END)::tipo_evidencia,
            re.clave, 'pruebas/' || o.id || '/' || re.clave || '.jpg', now(), true
       FROM orden_servicio o
       JOIN articulo a ON a.id = o.id_articulo
       JOIN regla_evidencia re
         ON re.tipo = o.tipo_garantia AND re.activa AND re.obligatoria AND re.bloquea_avance
        AND re.momento = $2::momento_evidencia
        AND (re.id_categoria IS NULL OR re.id_categoria = a.id_categoria)
        AND (re.id_marca IS NULL OR re.id_marca = a.id_marca)
      WHERE o.id = $1
        AND NOT EXISTS (SELECT 1 FROM evidencia ev WHERE ev.id_orden = o.id AND ev.clave = re.clave)`,
    [ciclo.idOrden, momento],
  );
}

async function existencia(idBodega: string): Promise<number> {
  const { rows } = await entorno.piscina.query<{ cantidad: number }>(
    'SELECT cantidad FROM existencia WHERE id_bodega = $1 AND id_repuesto = $2',
    [idBodega, ciclo.idRepuesto],
  );
  return rows[0]?.cantidad ?? 0;
}

async function disponibilidad(): Promise<{ reservado: number; disponible: number; comprometido: number }> {
  const respuesta = await peticion(entorno.aplicacion)
    .get(`${RAIZ}/disponibilidad?idRepuesto=${ciclo.idRepuesto}`).set(bodeguero).expect(200);
  return respuesta.body.data[0];
}

beforeAll(async () => {
  entorno = await montarApi();
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
  jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
  jefeTecnicos = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);
  bodeguero = await sesionDe(CODIGO_ROL.BODEGUERO);
  consulta = await sesionDe(CODIGO_ROL.USUARIO_CONSULTA);

  const { rows: tecnicos } = await entorno.piscina.query<{ id: string; nombre_usuario: string }>(
    `SELECT t.id, u.nombre_usuario FROM tecnico t JOIN usuario u ON u.id = t.id_usuario
      WHERE t.tipo = 'planta' AND t.activo AND u.activo AND NOT u.bloqueado
      ORDER BY u.nombre_usuario LIMIT 2`,
  );
  idTecnico = tecnicos[0]!.id;
  otroTecnico = { id: tecnicos[1]!.id };
  tecnico = await iniciarSesion(tecnicos[0]!.nombre_usuario);

  const { rows: central } = await entorno.piscina.query<{ id: string }>(
    "SELECT id FROM bodega WHERE tipo = 'central' AND surte_repuestos AND activa ORDER BY nombre LIMIT 1",
  );
  ciclo.idCentral = central[0]!.id;
  const { rows: repuesto } = await entorno.piscina.query<{ id: string }>(
    'SELECT id FROM repuesto WHERE activo ORDER BY codigo DESC LIMIT 1',
  );
  ciclo.idRepuesto = repuesto[0]!.id;
});

afterAll(async () => { await entorno.cerrar(); });

describe('el ciclo completo de una orden, sin cobros ni pagos', () => {
  it('1. recepcion: el agente registra la orden', async () => {
    const { rows } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
      `SELECT a.id_cliente, a.id
         FROM articulo a JOIN tienda_origen t ON t.id = a.id_tienda_origen
         JOIN cliente c ON c.id = a.id_cliente
        WHERE t.pertenece_al_grupo AND a.fecha_compra > current_date - interval '6 months'
          AND c.activo AND c.id_cliente_principal IS NULL
          AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
        ORDER BY a.creado_en DESC LIMIT 1`,
    );
    const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
      .send({
        idCliente: rows[0]!.id_cliente, idArticulo: rows[0]!.id,
        modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'No enfria y hace ruido al arrancar',
      }).expect(201);
    ciclo.idOrden = creada.body.data.id;
    expect(creada.body.data.codigo).toMatch(/^OS-\d{4}-\d{6}$/);
    expect(creada.body.data.estado).toBe(ESTADO_ORDEN.REGISTRADA);
  });

  it('2. la recepcion adjunta una fotografia real, verificada por su huella', async () => {
    const foto = randomBytes(4_000);
    foto[0] = 0xff; foto[1] = 0xd8; foto[2] = 0xff; foto[3] = 0xe0;
    const huella = createHash('sha256').update(foto).digest('hex');

    const carga = await peticion(entorno.aplicacion).post(`${RAIZ}/evidencias/cargas`).set(jefatura)
      .send({
        idOrden: ciclo.idOrden, clave: 'foto_articulo', tipo: 'foto', bytes: foto.length,
        huellaDigital: huella, momentoDispositivo: new Date().toISOString(),
      }).expect(201);
    await peticion(entorno.aplicacion).patch(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}`)
      .set(jefatura).set('Content-Type', 'application/octet-stream').set('X-Desplazamiento', '0')
      .send(foto).expect(200);
    const cerrada = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/evidencias/cargas/${carga.body.data.idCarga}/cerrar`).set(jefatura)
      .send({ idEvidencia: carga.body.data.idEvidencia }).expect(200);
    expect(cerrada.body.data.sincronizada).toBe(true);
    expect(cerrada.body.data.huellaDigital).toBe(huella);
  });

  it('3. el gestor asigna el tecnico; reasignar exige motivo y queda en la bitacora', async () => {
    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${ciclo.idOrden}/tecnico`)
      .set(jefeTecnicos).send({ idTecnico: otroTecnico.id }).expect(200);

    const sinMotivo = await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${ciclo.idOrden}/tecnico`)
      .set(jefeTecnicos).send({ idTecnico });
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.body.error.fields.motivo).toBeDefined();

    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${ciclo.idOrden}/tecnico`)
      .set(jefeTecnicos).send({ idTecnico, motivo: 'El primer tecnico quedo con la agenda llena' })
      .expect(200);

    const { rows } = await entorno.piscina.query<{ valor_anterior: string | null; motivo: string }>(
      `SELECT valor_anterior, motivo FROM bitacora
        WHERE tabla = 'orden_servicio' AND id_registro = $1 AND campo = 'tecnico' ORDER BY momento`,
      [ciclo.idOrden],
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]!.valor_anterior).not.toBeNull();
    expect(rows[1]!.motivo).toMatch(/agenda llena/);
  });

  it('4. la orden avanza hasta el diagnostico', async () => {
    await evidenciaObligatoria('recepcion');
    await mover(agente, ESTADO_ORDEN.ASIGNADA).expect(200);
    await evidenciaObligatoria('validacion_garantia');
    await mover(jefeTecnicos, ESTADO_ORDEN.EN_COLA_TALLER).expect(200);
    await mover(jefeTecnicos, ESTADO_ORDEN.EN_DIAGNOSTICO).expect(200);

    // El diagnostico lo registra la aplicacion del tecnico por su cola; aqui
    // se inserta directo para no depender de un dispositivo vinculado.
    await entorno.piscina.query(
      `INSERT INTO diagnostico (id_orden, id_tecnico, falla_real, componente, momento_dispositivo)
       VALUES ($1, $2, 'Capacitor de arranque del compresor inflado', 'compresor', now())`,
      [ciclo.idOrden, idTecnico],
    );
    await evidenciaObligatoria('diagnostico');
  });

  it('5. el tecnico solicita el repuesto; no puede aprobarse su propia solicitud', async () => {
    // Que haya existencia para el recorrido: bodega ingresa 5.
    await peticion(entorno.aplicacion).post(`${RAIZ}/movimientos`).set(bodeguero).send({
      tipo: TIPO_MOVIMIENTO.INGRESO, idRepuesto: ciclo.idRepuesto,
      idBodegaDestino: ciclo.idCentral, cantidad: 5,
    }).expect(201);

    const solicitud = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${ciclo.idOrden}/solicitudes-repuesto`).set(tecnico)
      .send({ idRepuesto: ciclo.idRepuesto, cantidad: 2 }).expect(201);
    ciclo.idSolicitud = solicitud.body.data.id;

    // Separacion de funciones: el tecnico pide, bodega revisa.
    await paso(tecnico, ciclo.idSolicitud, { hacia: ESTADO_SOLICITUD.EN_REVISION }).expect(403);

    const antes = await disponibilidad();
    expect(antes.comprometido).toBeGreaterThanOrEqual(2);
  });

  it('6. bodega aprueba: aprobar es reservar', async () => {
    const antes = await disponibilidad();
    await paso(bodeguero, ciclo.idSolicitud, { hacia: ESTADO_SOLICITUD.EN_REVISION }).expect(200);
    await paso(bodeguero, ciclo.idSolicitud, { hacia: ESTADO_SOLICITUD.APROBADA }).expect(200);

    const despues = await disponibilidad();
    expect(despues.reservado).toBe(antes.reservado + 2);
    expect(despues.disponible).toBe(antes.disponible - 2);
  });

  it('7. sin disponibilidad no se aprueba: la solicitud queda pendiente con su historial', async () => {
    const { disponible } = await disponibilidad();
    const grande = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${ciclo.idOrden}/solicitudes-repuesto`).set(tecnico)
      .send({ idRepuesto: ciclo.idRepuesto, cantidad: disponible + 500 }).expect(201);
    ciclo.idSolicitudSinStock = grande.body.data.id;

    await paso(bodeguero, ciclo.idSolicitudSinStock, { hacia: ESTADO_SOLICITUD.EN_REVISION }).expect(200);
    const rechazo = await paso(bodeguero, ciclo.idSolicitudSinStock, { hacia: ESTADO_SOLICITUD.APROBADA });
    expect(rechazo.status).toBe(422);
    expect(rechazo.body.error.code).toBe('SIN_DISPONIBILIDAD');

    const { rows } = await entorno.piscina.query<{ estado: string }>(
      'SELECT estado::text FROM solicitud_repuesto WHERE id = $1', [ciclo.idSolicitudSinStock],
    );
    expect(rows[0]!.estado).toBe(ESTADO_SOLICITUD.EN_REVISION);
  });

  it('8. bodega prepara y entrega: la pieza pasa a la bodega del tecnico', async () => {
    await paso(bodeguero, ciclo.idSolicitud, { hacia: ESTADO_SOLICITUD.PREPARADA }).expect(200);
    const centralAntes = await existencia(ciclo.idCentral);

    await paso(bodeguero, ciclo.idSolicitud, {
      hacia: ESTADO_SOLICITUD.ENTREGADA, idBodegaOrigen: ciclo.idCentral,
    }).expect(200);

    const { rows } = await entorno.piscina.query<{ id: string }>(
      "SELECT id FROM bodega WHERE id_tecnico = $1 AND tipo = 'movil' AND activa", [idTecnico],
    );
    ciclo.idBodegaTecnico = rows[0]!.id;
    expect(await existencia(ciclo.idCentral)).toBe(centralAntes - 2);
    expect(await existencia(ciclo.idBodegaTecnico)).toBeGreaterThanOrEqual(2);

    await paso(tecnico, ciclo.idSolicitud, { hacia: ESTADO_SOLICITUD.RECIBIDA }).expect(200);
  });

  it('9. el tecnico no descuenta la bodega central directamente', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${ciclo.idOrden}/consumos`).set(tecnico)
      .send({ consumos: [{ idRepuesto: ciclo.idRepuesto, cantidad: 1, idBodegaOrigen: ciclo.idCentral }] });
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.message).toMatch(/propia bodega/);
  });

  it('10. repara, registra el consumo, y no puede finalizar con piezas sin conciliar', async () => {
    // La solicitud sin existencia sigue abierta: hay que anularla con motivo.
    await paso(bodeguero, ciclo.idSolicitudSinStock, {
      hacia: ESTADO_SOLICITUD.ANULADA, motivo: 'Se resolvio con la pieza ya entregada',
    }).expect(200);

    await mover(tecnico, ESTADO_ORDEN.EN_REPARACION).expect(200);

    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${ciclo.idOrden}/consumos`).set(tecnico)
      .send({ consumos: [{ idRepuesto: ciclo.idRepuesto, cantidad: 1, idBodegaOrigen: ciclo.idBodegaTecnico }] })
      .expect(201);

    await evidenciaObligatoria('reparacion');
    const bloqueada = await mover(tecnico, ESTADO_ORDEN.FINALIZADA);
    expect(bloqueada.status).toBe(422);
    expect(bloqueada.body.error.message).toMatch(/1 pieza\(s\) entregadas/);
  });

  it('11. devuelve lo que no uso, y entonces si finaliza', async () => {
    const centralAntes = await existencia(ciclo.idCentral);
    await peticion(entorno.aplicacion).post(`${RAIZ}/movimientos`).set(tecnico).send({
      tipo: TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL, idRepuesto: ciclo.idRepuesto,
      idBodegaOrigen: ciclo.idBodegaTecnico, idBodegaDestino: ciclo.idCentral, cantidad: 1,
      idOrden: ciclo.idOrden, justificacion: 'Repuesto no utilizado en la reparacion',
    }).expect(201);
    expect(await existencia(ciclo.idCentral)).toBe(centralAntes + 1);

    await mover(tecnico, ESTADO_ORDEN.FINALIZADA).expect(200);
  });

  it('12. el kardex cuenta el recorrido de la pieza', async () => {
    // El libro de la bodega del tecnico: entra la pieza, se instala una, se
    // devuelve la otra, y el saldo vuelve a cero.
    const delTecnico = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/repuestos/${ciclo.idRepuesto}/kardex?idBodega=${ciclo.idBodegaTecnico}&tamano=100`)
      .set(bodeguero);
    expect(delTecnico.status, JSON.stringify(delTecnico.body)).toBe(200);
    const tipos = (delTecnico.body.data.lineas as { tipo: string }[]).map((linea) => linea.tipo);
    expect(tipos).toEqual(expect.arrayContaining([
      TIPO_MOVIMIENTO.DESPACHO_A_MOVIL, TIPO_MOVIMIENTO.CONSUMO, TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL,
    ]));
    expect(delTecnico.body.data.saldoFinal).toBe(await existencia(ciclo.idBodegaTecnico));
  });

  it('13. revision tecnica y entrega del articulo, sin ningun pago', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${ciclo.idOrden}/validaciones`)
      .set(jefeTecnicos).send({
        resultado: 'aprobada', observacion: 'Arranca sin ruido y enfria dentro del rango.',
        revisoDiagnostico: true, revisoReparacion: true, revisoEvidencias: true, revisoRepuestos: true,
      }).expect(201);

    await evidenciaObligatoria('entrega');
    const verificacion = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${ciclo.idOrden}/entrega`).set(jefatura).expect(200);
    const claves = (verificacion.body.data.requisitos as { clave: string }[]).map((r) => r.clave);
    expect(claves).not.toContain('pago_confirmado');
    expect(verificacion.body.data.puedeEntregarse).toBe(true);

    const entrega = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${ciclo.idOrden}/entrega`)
      .set(jefatura).send({ recibidoPor: 'El titular de la orden', esElCliente: true });
    expect(entrega.status, JSON.stringify(entrega.body)).toBe(201);

    const ficha = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${ciclo.idOrden}`).set(agente).expect(200);
    expect(ficha.body.data.estado).toBe(ESTADO_ORDEN.ENTREGADA);
    const { rows } = await entorno.piscina.query('SELECT 1 FROM pago WHERE id_orden = $1', [ciclo.idOrden]);
    expect(rows).toHaveLength(0);
  });

  it('14. el historial cuenta todo lo que paso y quien lo hizo', async () => {
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${ciclo.idOrden}/historial`).set(jefatura).expect(200);
    const eventos = respuesta.body.data as {
      tipo: string; titulo: string; responsable: string | null; momento: string;
    }[];

    const tipos = new Set(eventos.map((evento) => evento.tipo));
    for (const tipo of [
      'estado', 'asignacion', 'evidencia', 'diagnostico', 'solicitud', 'movimiento',
      'validacion', 'entrega',
    ]) {
      expect(tipos.has(tipo), `falta un evento de tipo ${tipo}`).toBe(true);
    }
    expect(eventos.some((evento) => /Reasignada/.test(evento.titulo))).toBe(true);
    expect(eventos.some((evento) => /anulada/.test(evento.titulo))).toBe(true);
    // Cronologico, y cada accion de una persona dice quien fue.
    const momentos = eventos.map((evento) => evento.momento);
    expect([...momentos].sort()).toEqual(momentos);
    expect(eventos.filter((e) => e.tipo === 'estado').every((e) => e.responsable !== null)).toBe(true);
  });

  it('15. el historial no se puede reescribir, ni desde la base', async () => {
    await expect(entorno.piscina.query(
      "UPDATE evento_orden SET observacion = 'retocado' WHERE id_orden = $1", [ciclo.idOrden],
    )).rejects.toThrow(/no se modifican ni se borran/);
    await expect(entorno.piscina.query(
      'DELETE FROM movimiento_repuesto WHERE id_orden = $1', [ciclo.idOrden],
    )).rejects.toThrow(/no se modifican ni se borran/);
    await expect(entorno.piscina.query(
      "UPDATE bitacora SET motivo = 'otro' WHERE id_registro = $1", [ciclo.idOrden],
    )).rejects.toThrow(/no se modifican ni se borran/);
  });
});

describe('sin modulos financieros', () => {
  it('las rutas de cobros y pagos ya no existen', async () => {
    const admin = await sesionDe(CODIGO_ROL.ADMINISTRADOR);
    for (const ruta of ['/expedientes', '/pagos', '/cobros/indicadores']) {
      const respuesta = await peticion(entorno.aplicacion).get(`${RAIZ}${ruta}`).set(admin);
      expect(respuesta.status, ruta).toBe(404);
    }
  });

  it('ningun permiso ni rol activo es de cobros', async () => {
    const { rows: permisos } = await entorno.piscina.query(
      "SELECT 1 FROM permiso WHERE codigo LIKE 'cobros.%'",
    );
    expect(permisos).toHaveLength(0);
    const { rows: roles } = await entorno.piscina.query(
      "SELECT 1 FROM rol WHERE codigo IN ('gestor_cobros', 'jefe_cobros') AND activo",
    );
    expect(roles).toHaveLength(0);
  });

  it('el historico financiero queda de solo lectura', async () => {
    await expect(entorno.piscina.query(
      `INSERT INTO pago (id_orden, monto, forma_pago) VALUES ($1, 10, 'efectivo')`, [ciclo.idOrden],
    )).rejects.toThrow(/historica/);
  });

  it('el tablero no cuenta cobros', async () => {
    const admin = await sesionDe(CODIGO_ROL.ADMINISTRADOR);
    const tablero = await peticion(entorno.aplicacion).get(`${RAIZ}/tablero`).set(admin).expect(200);
    const claves = (tablero.body.data.cifras as { clave: string }[]).map((c) => c.clave);
    expect(claves).not.toContain('cobros_pendientes');
    expect(claves).toEqual(expect.arrayContaining([
      'sin_asignar', 'en_diagnostico', 'esperando_repuesto', 'por_entregar', 'ordenes_atrasadas',
      'dias_promedio_reparacion', 'unidades_disponibles', 'unidades_reservadas', 'stock_bajo',
    ]));
    expect(tablero.body.data.cargaPorTecnico.length).toBeGreaterThan(0);
  });
});

describe('permisos en el servidor', () => {
  it('quien solo consulta no mueve inventario ni ordenes', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/movimientos`).set(consulta).send({
      tipo: TIPO_MOVIMIENTO.INGRESO, idRepuesto: ciclo.idRepuesto,
      idBodegaDestino: ciclo.idCentral, cantidad: 1,
    }).expect(403);
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(consulta)
      .send({}).expect(403);
  });

  it('el agente no registra movimientos de inventario', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/movimientos`).set(agente).send({
      tipo: TIPO_MOVIMIENTO.AJUSTE, idRepuesto: ciclo.idRepuesto, idBodegaDestino: ciclo.idCentral,
      cantidad: 1, justificacion: 'Intento de ajuste sin permiso',
    }).expect(403);
  });

  it('bodega no asigna tecnicos', async () => {
    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${ciclo.idOrden}/tecnico`)
      .set(bodeguero).send({ idTecnico }).expect(403);
  });

  it('un tecnico no ve la orden de otro', async () => {
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM orden_servicio WHERE id_tecnico IS DISTINCT FROM $1 AND creado_por IS NOT NULL LIMIT 1',
      [idTecnico],
    );
    await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${rows[0]!.id}/historial`)
      .set(tecnico).expect(403);
  });
});
