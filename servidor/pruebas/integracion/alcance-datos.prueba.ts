/**
 * El alcance por datos: no QUE puede hacer el usuario, sino SOBRE QUE.
 *
 * Estas pruebas nacieron de dos agujeros reales, encontrados corriendo el
 * sistema y no leyendolo:
 *
 *  1. `POST /movimientos` estaba protegido con `inventario.consultar`, el
 *     permiso de LEER. Un usuario de solo consulta metio 99 unidades a la
 *     bodega central y la API respondio 200.
 *  2. Un tecnico con `ordenes.consultar` veia las treinta mil ordenes del
 *     taller y abria la de cualquier compañero, con el telefono y la
 *     direccion de casa del cliente dentro.
 *
 * Las dos son el mismo error: mirar el permiso y no mirar de quien es el
 * dato. Se prueban por HTTP, como las ataca cualquiera.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import peticion from 'supertest';
import { CODIGO_ROL, TIPO_MOVIMIENTO } from '@servitotal/compartido';
import { CONTRASENA_DE_PRUEBA, montarApi, usuarioConRol, type EntornoApi } from '../apoyo/entorno-api.js';

const RAIZ = '/api/v1';
let entorno: EntornoApi;

async function tokenDe(nombreUsuario: string): Promise<string> {
  const respuesta = await peticion(entorno.aplicacion)
    .post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return respuesta.body.data.tokenAcceso;
}

async function tokenDeRol(codigoRol: string): Promise<string> {
  return tokenDe(await usuarioConRol(entorno.piscina, codigoRol));
}

beforeAll(async () => { entorno = await montarApi(); });
afterAll(async () => { await entorno.cerrar(); });

describe('inventario: el permiso de leer no mueve existencia', () => {
  it('un usuario de solo consulta no puede ingresar repuestos', async () => {
    const token = await tokenDeRol(CODIGO_ROL.USUARIO_CONSULTA);
    const { rows } = await entorno.piscina.query<{ id_bodega: string; id_repuesto: string; cantidad: number }>(
      `SELECT e.id_bodega, e.id_repuesto, e.cantidad FROM existencia e
         JOIN bodega b ON b.id = e.id_bodega WHERE b.tipo = 'central' LIMIT 1`,
    );
    const antes = rows[0]!;

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/movimientos`).set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TIPO_MOVIMIENTO.INGRESO,
        idRepuesto: antes.id_repuesto,
        idBodegaDestino: antes.id_bodega,
        cantidad: 99,
        justificacion: 'intento de ingreso sin permiso de ingreso',
      });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.code).toBe('SIN_PERMISO');

    // Y la existencia no se movio: no basta con que responda 403.
    const { rows: despues } = await entorno.piscina.query<{ cantidad: number }>(
      'SELECT cantidad FROM existencia WHERE id_bodega = $1 AND id_repuesto = $2',
      [antes.id_bodega, antes.id_repuesto],
    );
    expect(despues[0]!.cantidad).toBe(antes.cantidad);
  });

  it('tampoco puede ajustar, que es la via por la que se cuadra un faltante', async () => {
    const token = await tokenDeRol(CODIGO_ROL.USUARIO_CONSULTA);
    const { rows } = await entorno.piscina.query<{ id_bodega: string; id_repuesto: string }>(
      'SELECT id_bodega, id_repuesto FROM existencia WHERE cantidad > 0 LIMIT 1',
    );

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/movimientos`).set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TIPO_MOVIMIENTO.AJUSTE,
        idRepuesto: rows[0]!.id_repuesto,
        idBodegaOrigen: rows[0]!.id_bodega,
        idBodegaDestino: rows[0]!.id_bodega,
        cantidad: 1,
        justificacion: 'intento de ajuste sin permiso de ajuste',
      });

    expect(respuesta.status).toBe(403);
  });

  it('el bodeguero si puede: el cerco no es un bloqueo general', async () => {
    const token = await tokenDeRol(CODIGO_ROL.BODEGUERO);
    const { rows } = await entorno.piscina.query<{ id_bodega: string; id_repuesto: string; cantidad: number }>(
      `SELECT e.id_bodega, e.id_repuesto, e.cantidad FROM existencia e
         JOIN bodega b ON b.id = e.id_bodega WHERE b.tipo = 'central' LIMIT 1`,
    );
    const antes = rows[0]!;

    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/movimientos`).set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TIPO_MOVIMIENTO.INGRESO,
        idRepuesto: antes.id_repuesto,
        idBodegaDestino: antes.id_bodega,
        cantidad: 5,
        justificacion: 'ingreso legitimo de bodega',
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.data.movimiento.cantidad).toBe(5);
  });
});

/** Devuelve el token del tecnico y una orden asignada a OTRO tecnico. */
async function tecnicoYOrdenAjena(): Promise<{ token: string; idAjena: string; nombre: string }> {
  const { rows } = await entorno.piscina.query<{ nombre_usuario: string; id_tecnico: string }>(
    `SELECT u.nombre_usuario, t.id AS id_tecnico
       FROM tecnico t JOIN usuario u ON u.id = t.id_usuario
       JOIN rol r ON r.id = u.id_rol
      WHERE r.codigo = $1 AND u.activo AND t.activo
        AND EXISTS (SELECT 1 FROM orden_servicio o WHERE o.id_tecnico = t.id)
      ORDER BY u.nombre_usuario LIMIT 1`,
    [CODIGO_ROL.TECNICO_RUTA],
  );
  const mio = rows[0]!;
  const { rows: ajenas } = await entorno.piscina.query<{ id: string }>(
    'SELECT id FROM orden_servicio WHERE id_tecnico IS NOT NULL AND id_tecnico <> $1 LIMIT 1',
    [mio.id_tecnico],
  );
  return {
    token: await tokenDe(mio.nombre_usuario),
    idAjena: ajenas[0]!.id,
    nombre: mio.nombre_usuario,
  };
}

describe('ordenes: un tecnico solo ve las suyas', () => {
  it('pedir por URL directa la orden de otro tecnico devuelve 403', async () => {
    const { token, idAjena } = await tecnicoYOrdenAjena();
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${idAjena}`).set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.data).toBeUndefined();
    // Y no se filtra nada del cliente en el mensaje de error.
    expect(JSON.stringify(respuesta.body)).not.toMatch(/\d{8}/);
  });

  it('las evidencias de la orden ajena tampoco se entregan', async () => {
    const { token, idAjena } = await tecnicoYOrdenAjena();
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${idAjena}/evidencias`).set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
  });

  it('mover la orden ajena tampoco', async () => {
    const { token, idAjena } = await tecnicoYOrdenAjena();
    const respuesta = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${idAjena}/estado`).set('Authorization', `Bearer ${token}`)
      .send({ hacia: 'en_diagnostico' });

    expect(respuesta.status).toBe(403);
  });

  it('el listado solo trae sus ordenes, y son menos que el total', async () => {
    const { token } = await tecnicoYOrdenAjena();
    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes?tamano=100`).set('Authorization', `Bearer ${token}`).expect(200);

    const { rows } = await entorno.piscina.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM orden_servicio',
    );
    const total = Number(rows[0]!.total);

    expect(respuesta.body.pagination.total).toBeGreaterThan(0);
    expect(respuesta.body.pagination.total).toBeLessThan(total);
  });

  it('pedir `?idTecnico=<otro>` no ensancha el cerco', async () => {
    const { token } = await tecnicoYOrdenAjena();
    const { rows } = await entorno.piscina.query<{ id: string }>(
      'SELECT DISTINCT id_tecnico AS id FROM orden_servicio WHERE id_tecnico IS NOT NULL LIMIT 5',
    );

    // Para CUALQUIER tecnico que pida, el resultado solo puede ser vacio o
    // sus propias ordenes. Nunca las de otro.
    const propias = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes?tamano=100`).set('Authorization', `Bearer ${token}`).expect(200);
    const mias = new Set<string>(propias.body.data.map((o: { id: string }) => o.id));

    for (const otro of rows) {
      const respuesta = await peticion(entorno.aplicacion)
        .get(`${RAIZ}/ordenes?tamano=100&idTecnico=${otro.id}`)
        .set('Authorization', `Bearer ${token}`).expect(200);
      for (const orden of respuesta.body.data as { id: string }[]) {
        expect(mias.has(orden.id)).toBe(true);
      }
    }
  });

  it('la bandeja de alertas tambien esta cercada', async () => {
    const { rows } = await entorno.piscina.query<{ nombre_usuario: string; id_tecnico: string }>(
      `SELECT u.nombre_usuario, t.id AS id_tecnico
         FROM tecnico t JOIN usuario u ON u.id = t.id_usuario JOIN rol r ON r.id = u.id_rol
        WHERE r.codigo = $1 AND u.activo AND t.activo
          AND EXISTS (SELECT 1 FROM orden_servicio o WHERE o.id_tecnico = t.id)
        ORDER BY u.nombre_usuario LIMIT 1`,
      [CODIGO_ROL.TECNICO_RUTA],
    );
    const token = await tokenDe(rows[0]!.nombre_usuario);

    const alertas = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/alertas?tamano=100`).set('Authorization', `Bearer ${token}`).expect(200);

    /*
     * Se comprueba contra la BASE y no contra la primera pagina de sus
     * ordenes. Un tecnico puede tener mas de cien ordenes, y entonces una
     * alerta legitima quedaria fuera de esa pagina y la prueba acusaria una
     * fuga que no existe. La pregunta real es a quien esta asignada cada
     * orden que la bandeja devuelve.
     */
    const devueltas = (alertas.body.data as { id: string }[]).map((o) => o.id);
    if (devueltas.length === 0) return;

    const { rows: duenos } = await entorno.piscina.query<{ id_tecnico: string | null }>(
      'SELECT DISTINCT id_tecnico FROM orden_servicio WHERE id = ANY($1::uuid[])',
      [devueltas],
    );
    expect(duenos.map((d) => d.id_tecnico)).toEqual([rows[0]!.id_tecnico]);
  });

  it('su propia orden si la abre, con todo el detalle', async () => {
    const { rows } = await entorno.piscina.query<{ nombre_usuario: string; id_orden: string }>(
      `SELECT u.nombre_usuario, o.id AS id_orden
         FROM orden_servicio o JOIN tecnico t ON t.id = o.id_tecnico
         JOIN usuario u ON u.id = t.id_usuario JOIN rol r ON r.id = u.id_rol
        WHERE r.codigo = $1 AND u.activo AND NOT u.bloqueado LIMIT 1`,
      [CODIGO_ROL.TECNICO_RUTA],
    );
    const token = await tokenDe(rows[0]!.nombre_usuario);

    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${rows[0]!.id_orden}`).set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.telefonoContacto).not.toBeNull();
  });
});

describe('ordenes: el usuario de tienda sigue cercado a su sucursal', () => {
  it('la orden de otra sucursal devuelve 403', async () => {
    const { rows } = await entorno.piscina.query<{ nombre_usuario: string; id_tienda: string }>(
      `SELECT u.nombre_usuario, u.id_tienda FROM usuario u JOIN rol r ON r.id = u.id_rol
        WHERE r.codigo = $1 AND u.id_tienda IS NOT NULL AND u.activo LIMIT 1`,
      [CODIGO_ROL.USUARIO_TIENDA],
    );
    if (rows[0] === undefined) return; // la siembra no dejo usuario de tienda
    const token = await tokenDe(rows[0].nombre_usuario);

    const { rows: ajenas } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM orden_servicio WHERE id_tienda IS NOT NULL AND id_tienda <> $1 LIMIT 1',
      [rows[0].id_tienda],
    );
    if (ajenas[0] === undefined) return;

    const respuesta = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${ajenas[0].id}`).set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
  });
});

/**
 * TODAS las puertas que llevan a una orden.
 *
 * Esta prueba existe porque el cerco se puso primero en la ficha, y despues
 * fueron apareciendo una a una las demas puertas: la bandeja de alertas, las
 * evidencias, las visitas, los consumos, las solicitudes, el expediente de
 * cobro, el pago, la entrega. Cada una era el mismo agujero por otro lado.
 *
 * Se escribe como una tabla y no como ocho pruebas sueltas a proposito:
 * agregar una ruta nueva que lleve a la orden y olvidarse de cercarla es el
 * error que se repite, y aqui se nota al leer la lista.
 */
describe('el cerco cubre todas las puertas a la orden', () => {
  interface Puerta {
    readonly nombre: string;
    readonly metodo: 'get' | 'post';
    readonly ruta: (idOrden: string) => string;
    readonly cuerpo?: Record<string, unknown>;
  }

  const PUERTAS: readonly Puerta[] = [
    { nombre: 'la ficha', metodo: 'get', ruta: (id) => `/ordenes/${id}` },
    { nombre: 'las evidencias', metodo: 'get', ruta: (id) => `/ordenes/${id}/evidencias` },
    { nombre: 'las visitas', metodo: 'get', ruta: (id) => `/ordenes/${id}/visitas` },
    {
      nombre: 'mover el estado',
      metodo: 'post',
      ruta: (id) => `/ordenes/${id}/estado`,
      cuerpo: { hacia: 'en_diagnostico' },
    },
    {
      nombre: 'consumir repuestos',
      metodo: 'post',
      ruta: (id) => `/ordenes/${id}/consumos`,
      cuerpo: {
        consumos: [{
          idRepuesto: '00000000-0000-0000-0000-000000000000',
          cantidad: 1,
          idBodegaOrigen: '00000000-0000-0000-0000-000000000000',
        }],
      },
    },
    {
      nombre: 'pedir un repuesto',
      metodo: 'post',
      ruta: (id) => `/ordenes/${id}/solicitudes-repuesto`,
      cuerpo: { idRepuesto: '00000000-0000-0000-0000-000000000000', cantidad: 1 },
    },
  ];

  it('un tecnico recibe 403 en cada una, para una orden ajena', async () => {
    const { token, idAjena } = await tecnicoYOrdenAjena();

    for (const puerta of PUERTAS) {
      const peticionBase = peticion(entorno.aplicacion)[puerta.metodo](`${RAIZ}${puerta.ruta(idAjena)}`)
        .set('Authorization', `Bearer ${token}`);
      const respuesta = puerta.cuerpo === undefined
        ? await peticionBase
        : await peticionBase.send(puerta.cuerpo);

      /*
       * Se admite 403 (el cerco) o 404 (no tiene ese permiso en absoluto, o
       * la ruta no aplica a esa orden). Lo que NO se admite es 200: eso
       * significaria que la puerta esta abierta.
       *
       * La comprobacion de verdad es la de abajo: nunca 2xx.
       */
      expect(respuesta.status, `${puerta.nombre} devolvio ${respuesta.status}`)
        .toBeGreaterThanOrEqual(400);
      expect(respuesta.body.data, `${puerta.nombre} entrego datos`).toBeUndefined();
    }
  });

  it('y el usuario de tienda tambien, en las que alcanza', async () => {
    const { rows } = await entorno.piscina.query<{ nombre_usuario: string; id_tienda: string }>(
      `SELECT u.nombre_usuario, u.id_tienda FROM usuario u JOIN rol r ON r.id = u.id_rol
        WHERE r.codigo = $1 AND u.id_tienda IS NOT NULL AND u.activo LIMIT 1`,
      [CODIGO_ROL.USUARIO_TIENDA],
    );
    if (rows[0] === undefined) return;
    const token = await tokenDe(rows[0].nombre_usuario);

    const { rows: ajenas } = await entorno.piscina.query<{ id: string }>(
      'SELECT id FROM orden_servicio WHERE id_tienda IS NOT NULL AND id_tienda <> $1 LIMIT 1',
      [rows[0].id_tienda],
    );
    if (ajenas[0] === undefined) return;
    const idAjena = ajenas[0].id;

    // El pago y la entrega son las dos que un usuario de tienda si alcanza
    // por permisos, y por tanto las dos que importan aqui.
    const pago = await peticion(entorno.aplicacion)
      .post(`${RAIZ}/ordenes/${idAjena}/pagos`).set('Authorization', `Bearer ${token}`)
      .send({ monto: 100, formaPago: 'efectivo' });
    expect(pago.status).toBeGreaterThanOrEqual(400);

    const entrega = await peticion(entorno.aplicacion)
      .get(`${RAIZ}/ordenes/${idAjena}/entrega`).set('Authorization', `Bearer ${token}`);
    expect(entrega.status).toBe(403);
  });
});
