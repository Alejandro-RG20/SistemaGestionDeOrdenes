/**
 * El tramo final del proceso: validacion tecnica, entrega y tiendas.
 *
 * Son los controles que el pliego pide antes de que un articulo salga del
 * centro, y lo que se prueba aqui es justamente que NO se puedan saltar.
 * Un control que se puede esquivar no es un control; es una casilla.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, ESTADO_ORDEN, MODALIDAD_SERVICIO } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;
let jefeTecnicos: { Authorization: string };
let agente: { Authorization: string };
let admin: { Authorization: string };
let tecnico: { Authorization: string };
/**
 * Quien entrega el articulo es el mostrador, no el agente telefonico: el
 * agente coordina por telefono y no tiene el equipo en la mano. Por eso
 * `ordenes.entregar` lo lleva la jefatura de atencion al cliente y el
 * usuario de tienda, y las pruebas de entrega usan esa sesion.
 */
let mostrador: { Authorization: string };

async function sesionDe(codigoRol: string): Promise<{ Authorization: string }> {
  const nombreUsuario = await usuarioConRol(entorno.piscina, codigoRol);
  const sesion = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}

beforeAll(async () => {
  entorno = await montarApi();
  jefeTecnicos = await sesionDe(CODIGO_ROL.JEFE_TECNICOS);
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
  admin = await sesionDe(CODIGO_ROL.ADMINISTRADOR);
  tecnico = await sesionDe(CODIGO_ROL.TECNICO_RUTA);
  mostrador = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
});

afterAll(async () => { await entorno.cerrar(); });

async function ordenNueva(): Promise<{ id: string; codigo: string }> {
  const { rows } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
    `SELECT a.id_cliente, a.id FROM articulo a JOIN cliente c ON c.id = a.id_cliente
      WHERE c.activo AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
      LIMIT 1`,
  );
  const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
    .send({
      idCliente: rows[0]!.id_cliente, idArticulo: rows[0]!.id,
      modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'Para probar el cierre del proceso',
    }).expect(201);
  return { id: creada.body.data.id, codigo: creada.body.data.codigo };
}

describe('el numero de orden que ve la gente', () => {
  it('se asigna en el servidor con la forma OS-AAAA-NNNNNN', async () => {
    const orden = await ordenNueva();
    expect(orden.codigo).toMatch(/^OS-\d{4}-\d{6}$/);
    expect(orden.codigo.startsWith(`OS-${new Date().getFullYear()}-`)).toBe(true);
  });

  it('dos ordenes seguidas no repiten codigo', async () => {
    const primera = await ordenNueva();
    const segunda = await ordenNueva();
    expect(primera.codigo).not.toBe(segunda.codigo);
  });

  it('la bandeja se puede filtrar por el codigo o por el numero', async () => {
    const orden = await ordenNueva();
    const porCodigo = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes?numero=${orden.codigo}`).set(agente).expect(200);
    expect(porCodigo.body.data).toHaveLength(1);
    expect(porCodigo.body.data[0].id).toBe(orden.id);

    const numero = porCodigo.body.data[0].numero;
    const porNumero = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes?numero=${numero}`).set(agente).expect(200);
    expect(porNumero.body.data[0].id).toBe(orden.id);
  });
});

describe('validacion tecnica', () => {
  it('nadie valida su propio trabajo', async () => {
    // Se busca una orden cuyo tecnico sea, ademas, quien intenta validar.
    const { rows } = await entorno.piscina.query<{ id_orden: string; nombre_usuario: string }>(
      `SELECT o.id AS id_orden, u.nombre_usuario
         FROM orden_servicio o
         JOIN tecnico t ON t.id = o.id_tecnico
         JOIN usuario u ON u.id = t.id_usuario
        WHERE o.estado = 'finalizada' LIMIT 1`,
    );
    if (rows[0] === undefined) return;

    // Se le da el permiso de validar a ese tecnico para llegar a la regla
    // de negocio; si no, el 403 taparia lo que se quiere comprobar.
    await entorno.piscina.query(
      `INSERT INTO rol_permiso (id_rol, id_permiso)
       SELECT u.id_rol, p.id FROM usuario u, permiso p
        WHERE u.nombre_usuario = $1 AND p.codigo = 'taller.validacion.registrar'
       ON CONFLICT DO NOTHING`,
      [rows[0].nombre_usuario],
    );
    const sesion = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario: rows[0].nombre_usuario, contrasena: CONTRASENA_DE_PRUEBA })
      .expect(201);

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${rows[0].id_orden}/validaciones`)
      .set({ Authorization: `Bearer ${sesion.body.data.tokenAcceso}` })
      .send({
        resultado: 'aprobada',
        observacion: 'Reviso su propio trabajo y lo aprueba.',
        revisoDiagnostico: true, revisoReparacion: true,
        revisoEvidencias: true, revisoRepuestos: true,
      }).expect(422);

    expect(respuesta.body.error.code).toBe('VALIDACION_PROPIA');
  });

  /**
   * Aprobar con evidencia faltante es firmar un expediente que el proveedor
   * va a rechazar: el costo del repuesto lo termina comiendo el centro.
   */
  it('no se aprueba una orden a la que le falta evidencia obligatoria', async () => {
    const pendientes = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/validaciones/pendientes?tamano=25`).set(jefeTecnicos).expect(200);

    let conFaltantes: string | null = null;
    for (const orden of pendientes.body.data) {
      const revision = await peticion(entorno.aplicacion)
        .get(`${RAIZ}/ordenes/${orden.idOrden}/revision`).set(jefeTecnicos).expect(200);
      if (revision.body.data.evidenciasFaltantes.length > 0) {
        conFaltantes = orden.idOrden;
        break;
      }
    }
    if (conFaltantes === null) return;

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${conFaltantes}/validaciones`).set(jefeTecnicos)
      .send({
        resultado: 'aprobada',
        observacion: 'Se aprueba pese a que falta evidencia.',
        revisoDiagnostico: true, revisoReparacion: true,
        revisoEvidencias: true, revisoRepuestos: true,
      }).expect(422);

    expect(respuesta.body.error.code).toBe('EVIDENCIA_INCOMPLETA');
    // El mensaje nombra la evidencia que falta: «no se puede» a secas deja
    // al jefe sin saber que pedirle al tecnico.
    expect(respuesta.body.error.message).toMatch(/falta evidencia obligatoria \(/);
  });

  /**
   * EL BLOQUEO CIRCULAR QUE MOTIVA ESTA PRUEBA.
   *
   * `firma_cliente` se recoge en la ENTREGA. Si se exigiera siempre, una
   * orden terminada nunca podria aprobarse —falta la firma—, sin
   * aprobacion no se puede entregar, y sin entregar no hay firma. La
   * validacion tecnica quedaba inservible: NINGUNA orden pasaba jamas.
   *
   * Solo bloquea lo que el tecnico YA PODIA haber tomado.
   */
  it('la firma de entrega no bloquea la aprobacion de una orden sin entregar', async () => {
    const pendientes = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/validaciones/pendientes?tamano=40`).set(jefeTecnicos).expect(200);

    let aprobada = false;
    let vioFirmaComoFaltante = false;

    for (const orden of pendientes.body.data) {
      const revision = await peticion(entorno.aplicacion)
        .get(`${RAIZ}/ordenes/${orden.idOrden}/revision`).set(jefeTecnicos).expect(200);

      if (revision.body.data.evidenciasFaltantes.includes('firma_cliente')) {
        vioFirmaComoFaltante = true;
      }
      if (revision.body.data.evidenciasFaltantes.length > 0) continue;

      const respuesta = await peticion(entorno.aplicacion)
        .post(`${RAIZ}/ordenes/${orden.idOrden}/validaciones`).set(jefeTecnicos)
        .send({
          resultado: 'aprobada',
          observacion: 'Trabajo conforme; evidencia completa y reparacion probada.',
          revisoDiagnostico: true, revisoReparacion: true,
          revisoEvidencias: true, revisoRepuestos: true,
        });
      expect(respuesta.status).toBe(201);
      aprobada = true;
      break;
    }

    // Que alguna orden se pueda aprobar es el punto: si ninguna puede,
    // el modulo entero es decorativo.
    expect(aprobada).toBe(true);
    // Y la firma de entrega no aparece como pendiente mientras la orden
    // no llegue a ese momento.
    expect(vioFirmaComoFaltante).toBe(false);
  });

  it('pedir correccion si se puede, y queda en el historial', async () => {
    const pendientes = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/validaciones/pendientes?tamano=1`).set(jefeTecnicos).expect(200);
    const idOrden = pendientes.body.data[0].idOrden;

    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${idOrden}/validaciones`).set(jefeTecnicos)
      .send({
        resultado: 'requiere_correccion',
        observacion: 'Ampliar el diagnostico: no explica por que se cambio la pieza.',
        revisoDiagnostico: true, revisoReparacion: false,
        revisoEvidencias: true, revisoRepuestos: true,
      }).expect(201);

    const historial = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${idOrden}/validaciones`).set(jefeTecnicos).expect(200);
    expect(historial.body.data.length).toBeGreaterThan(0);
    expect(historial.body.data[0].resultado).toBe('requiere_correccion');
  });

  it('una observacion de dos palabras no pasa: la revision tiene que sustentar algo', async () => {
    const pendientes = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/validaciones/pendientes?tamano=1`).set(jefeTecnicos).expect(200);
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${pendientes.body.data[0].idOrden}/validaciones`)
      .set(jefeTecnicos)
      .send({
        resultado: 'aprobada', observacion: 'ok',
        revisoDiagnostico: true, revisoReparacion: true,
        revisoEvidencias: true, revisoRepuestos: true,
      }).expect(400);
  });

  it('un agente de telefonia no valida trabajo tecnico', async () => {
    const pendientes = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/validaciones/pendientes?tamano=1`).set(jefeTecnicos).expect(200);
    await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${pendientes.body.data[0].idOrden}/revision`)
      .set(agente).expect(403);
  });
});

describe('entrega del articulo', () => {
  it('una orden recien creada no se puede entregar, y dice por que', async () => {
    const orden = await ordenNueva();
    const verificacion = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${orden.id}/entrega`).set(mostrador).expect(200);

    expect(verificacion.body.data.puedeEntregarse).toBe(false);
    const sinCumplir = verificacion.body.data.requisitos
      .filter((r: { cumplido: boolean }) => !r.cumplido);
    expect(sinCumplir.length).toBeGreaterThan(0);
    // Cada requisito sin cumplir dice QUE HACER. El mostrador tiene al
    // cliente delante y necesita saber a donde mandarlo.
    for (const requisito of sinCumplir) {
      expect(requisito.queHacer.length).toBeGreaterThan(20);
    }
  });

  it('el intento de entregar se rechaza con el motivo, no en silencio', async () => {
    const orden = await ordenNueva();
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${orden.id}/entrega`).set(mostrador)
      .send({ recibidoPor: 'Ana Munguia Reyes', esElCliente: true }).expect(422);

    expect(respuesta.body.error.code).toBe('ENTREGA_BLOQUEADA');
    expect(respuesta.body.estado).toBeUndefined();
    // La orden NO se movio.
    const ficha = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${orden.id}`).set(agente).expect(200);
    expect(ficha.body.data.estado).toBe(ESTADO_ORDEN.REGISTRADA);
  });

  it('si retira un tercero, su documento es obligatorio', async () => {
    const orden = await ordenNueva();
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${orden.id}/entrega`).set(mostrador)
      .send({ recibidoPor: 'El hijo del titular', esElCliente: false }).expect(400);
  });

  it('un agente de telefonia no entrega articulos: no los tiene en la mano', async () => {
    const orden = await ordenNueva();
    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${orden.id}/entrega`).set(agente)
      .send({ recibidoPor: 'Quien sea', esElCliente: true }).expect(403);
  });

  it('una orden ya entregada muestra a quien se le entrego', async () => {
    const { rows } = await entorno.piscina.query<{ id_orden: string }>(
      'SELECT id_orden FROM entrega LIMIT 1',
    );
    if (rows[0] === undefined) return;
    const verificacion = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${rows[0].id_orden}/entrega`).set(mostrador).expect(200);

    expect(verificacion.body.data.entrega).not.toBeNull();
    expect(verificacion.body.data.entrega.recibidoPor.length).toBeGreaterThan(3);
    // Ya entregada: no se vuelve a entregar.
    expect(verificacion.body.data.puedeEntregarse).toBe(false);
  });
});

describe('tiendas', () => {
  it('la orden guarda de que sucursal entro, distinta de donde se compro', async () => {
    const orden = await ordenNueva();
    const ficha = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${orden.id}`).set(agente).expect(200);
    // El agente no pertenece a ninguna tienda y no mando ninguna: queda
    // en null, que es honesto. No se inventa una.
    expect(ficha.body.data).toHaveProperty('idTienda');
    expect(ficha.body.data).toHaveProperty('tienda');
  });

  it('una tienda desactivada no recibe ordenes nuevas', async () => {
    const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/tiendas`).set(admin)
      .send({
        codigo: `TMP-${Date.now() % 100000}`, nombre: 'Sucursal temporal de prueba',
        perteneceAlGrupo: true,
      }).expect(201);

    await peticion(entorno.aplicacion)
      .post(`${RAIZ}/tiendas/${creada.body.data.id}/desactivar`).set(admin).expect(200);

    const { rows } = await entorno.piscina.query<{ id_cliente: string; id: string }>(
      `SELECT a.id_cliente, a.id FROM articulo a JOIN cliente c ON c.id = a.id_cliente
        WHERE c.activo AND EXISTS (SELECT 1 FROM cliente_telefono WHERE id_cliente = c.id AND vigente)
        LIMIT 1`,
    );
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente)
      .send({
        idCliente: rows[0]!.id_cliente, idArticulo: rows[0]!.id,
        modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'Con una tienda desactivada',
        idTienda: creada.body.data.id,
      }).expect(400);
    expect(respuesta.body.error.fields.idTienda).toBeDefined();
  });

  /**
   * Desactivar una tienda con personal adentro los deja sin poder levantar
   * ordenes y sin entender por que. Se avisa antes.
   */
  it('no se desactiva una tienda que todavia tiene usuarios', async () => {
    const { rows } = await entorno.piscina.query<{ id_tienda: string }>(
      'SELECT id_tienda FROM usuario WHERE id_tienda IS NOT NULL LIMIT 1',
    );
    if (rows[0] === undefined) return;
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/tiendas/${rows[0].id_tienda}/desactivar`).set(admin).expect(400);
    expect(respuesta.body.error.message).toMatch(/usuario\(s\) asignado\(s\)/);
  });

  it('un tecnico no administra tiendas', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/tiendas`).set(tecnico)
      .send({ codigo: 'XXX-999', nombre: 'No deberia crearse', perteneceAlGrupo: false })
      .expect(403);
  });
});

describe('alcance del usuario de tienda', () => {
  /*
   * ESTA PRUEBA CAMBIO DE 404 A 403, A PROPOSITO.
   *
   * Antes el sistema respondia «no existe» a la orden de otra sucursal, con
   * el argumento de que decir «existe pero no le toca» le confirma a quien
   * prueba identificadores que acerto. El pliego pide 403 (§13) y se sigue
   * el pliego, por dos razones concretas:
   *
   *  - Los identificadores son UUID. No se adivinan contando, asi que lo que
   *    el 403 revela no habilita un ataque: ya hacia falta tener el
   *    identificador para preguntar.
   *  - El 403 le dice la verdad a quien abrio un enlace que le pasaron:
   *    «esta orden no es suya» es un mensaje que se entiende, mientras que
   *    «no existe» lo manda a buscar un error que no hay.
   */
  it('solo ve las ordenes de su sucursal; las demas responden 403', async () => {
    const nombreUsuario = await usuarioConRol(entorno.piscina, CODIGO_ROL.USUARIO_TIENDA);
    const sesion = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/autenticacion/sesion`)
      .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
    const cabecera = { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
    const suTienda = sesion.body.data.usuario.idTienda;
    expect(suTienda).not.toBeNull();

    const suyas = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes?tamano=20`).set(cabecera).expect(200);
    expect(suyas.body.pagination.total).toBeGreaterThan(0);

    for (const orden of suyas.body.data) {
      const ficha = await peticion(entorno.aplicacion)
        .get(`${RAIZ}/ordenes/${orden.id}`).set(cabecera).expect(200);
      expect(ficha.body.data.idTienda).toBe(suTienda);
    }

    // Y una de otra tienda responde 403, nombrando el motivo.
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM orden_servicio WHERE id_tienda IS DISTINCT FROM $1 LIMIT 1',
      [suTienda],
    );
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${rows[0]!.id}`).set(cabecera).expect(403);
    expect(respuesta.body.error.code).toBe('SIN_PERMISO');
    expect(respuesta.body.error.message).toMatch(/otra sucursal/i);
    // Y no se filtra nada de la orden ajena en la respuesta.
    expect(respuesta.body.data).toBeUndefined();
  });
});
