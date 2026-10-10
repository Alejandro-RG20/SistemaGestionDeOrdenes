/**
 * Diagnostico y cotizacion, responsable de pago, ajustes y exclusion de
 * garantia, contra la API y la base reales. Los numeros (E-n) remiten a la
 * lista de pruebas obligatorias de la sexta etapa.
 */
import { randomUUID } from 'node:crypto';
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
let tecnico: Cabecera;
let idTecnico = '';

async function iniciarSesion(nombreUsuario: string): Promise<Cabecera> {
  const sesion = await peticion(entorno.aplicacion).post(`${RAIZ}/autenticacion/sesion`)
    .send({ nombreUsuario, contrasena: CONTRASENA_DE_PRUEBA }).expect(201);
  return { Authorization: `Bearer ${sesion.body.data.tokenAcceso}` };
}
const sesionDe = async (rol: string): Promise<Cabecera> => iniciarSesion(await usuarioConRol(entorno.piscina, rol));

const mover = (cabecera: Cabecera, idOrden: string, hacia: string, extra: Record<string, unknown> = {}) =>
  peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${idOrden}/estado`).set(cabecera).send({ hacia, ...extra });
const ficha = async (cabecera: Cabecera, idOrden: string) =>
  (await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${idOrden}`).set(cabecera).expect(200)).body.data;
const taller = async (cabecera: Cabecera, idOrden: string) =>
  (await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${idOrden}/taller`).set(cabecera).expect(200)).body.data;
const cotizar = (cabecera: Cabecera, idOrden: string, cuerpo: Record<string, unknown>) =>
  peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${idOrden}/cotizaciones`).set(cabecera).send(cuerpo);
const decidir = (cabecera: Cabecera, idOrden: string, aceptada: boolean, observacion = 'Respuesta del cliente') =>
  peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${idOrden}/cotizaciones/decision`).set(cabecera)
    .send({ aceptada, forma: 'llamada', observacion });

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

const PROVEEDOR_APLICA = `t.pertenece_al_grupo AND a.fecha_compra > current_date - interval '3 months'
  AND NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id AND cb.activa)`;
const SIN_GARANTIA = `NOT t.pertenece_al_grupo AND NOT EXISTS (SELECT 1 FROM cobertura cb WHERE cb.id_articulo = a.id)`;

async function articulo(filtro: string): Promise<{ idCliente: string; idArticulo: string }> {
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

async function ordenDeTaller(tipo: string, filtro: string): Promise<string> {
  const base = await articulo(filtro);
  const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente).send({
    ...base, modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'No enciende desde hace dos dias', tipoGarantiaElegida: tipo,
  }).expect(201);
  return creada.body.data.id as string;
}

/** Hasta «en diagnostico», con el diagnostico registrado. */
async function diagnosticada(tipo: string, filtro: string): Promise<string> {
  const id = await ordenDeTaller(tipo, filtro);
  await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${id}/tecnico`).set(gestor).send({ idTecnico }).expect(200);
  await evidencia(id, 'recepcion');
  await mover(gestor, id, 'asignada').expect(200);
  await evidencia(id, 'validacion_garantia');
  await mover(gestor, id, 'en_cola_taller').expect(200);
  await mover(gestor, id, 'en_diagnostico').expect(200);
  await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/diagnostico`).set(tecnico)
    .send({ fallaReal: 'Compresor sin arranque', componente: 'compresor', observaciones: 'Se midio 0 ohm en el devanado' })
    .expect(201);
  return id;
}

/** Un repuesto propio de la prueba, con precio conocido (o sin precio). */
async function repuesto(precio: number): Promise<{ id: string; codigo: string }> {
  const codigo = `PRUEBA-${randomUUID().slice(0, 8).toUpperCase()}`;
  const { rows } = await entorno.piscina.query<{ id: string }>(
    `INSERT INTO repuesto (codigo, descripcion, precio) VALUES ($1, $2, $3) RETURNING id`,
    [codigo, `Repuesto de prueba ${codigo}`, precio],
  );
  return { id: rows[0]!.id, codigo };
}

/** Pide un repuesto para la orden (la solicitud, no un consumo). */
async function pedir(idOrden: string, idRepuesto: string, cantidad: number, estado = 'solicitada'): Promise<void> {
  await entorno.piscina.query(
    `INSERT INTO solicitud_repuesto (id_orden, id_repuesto, cantidad, via, estado)
     VALUES ($1, $2, $3, 'compra_local', $4::estado_solicitud_repuesto)`,
    [idOrden, idRepuesto, cantidad, estado],
  );
}

async function movimientos(idOrden: string): Promise<number> {
  const { rows } = await entorno.piscina.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM movimiento_repuesto WHERE id_orden = $1', [idOrden],
  );
  return rows[0]!.n;
}

beforeAll(async () => {
  entorno = await montarApi();
  agente = await sesionDe(CODIGO_ROL.AGENTE_TELEFONIA);
  jefatura = await sesionDe(CODIGO_ROL.JEFE_ATENCION_CLIENTE);
  gestor = await sesionDe(CODIGO_ROL.GESTOR_TECNICOS);
  const { rows } = await entorno.piscina.query<{ id: string; nombre_usuario: string }>(
    `SELECT t.id, u.nombre_usuario FROM tecnico t JOIN usuario u ON u.id = t.id_usuario
      WHERE t.tipo = 'planta' AND t.activo AND u.activo AND NOT u.bloqueado ORDER BY u.nombre_usuario LIMIT 1`,
  );
  idTecnico = rows[0]!.id;
  tecnico = await iniciarSesion(rows[0]!.nombre_usuario);
});

afterAll(async () => { await entorno.cerrar(); });

describe('ordenes cubiertas por garantia (E-1, E-2)', () => {
  it('E-1. proveedor: la cotizacion la paga el proveedor, el cliente paga 0 y no tiene que aceptar', async () => {
    const id = await diagnosticada('proveedor', PROVEEDOR_APLICA);
    const pieza = await repuesto(250);
    await pedir(id, pieza.id, 2);
    const cotizada = await cotizar(tecnico, id, { manoObra: 600 }).expect(201);
    const vigente = cotizada.body.data.cotizaciones.at(-1);
    expect(vigente.detalle.responsablePago).toBe('proveedor');
    expect(vigente.detalle.totalFinal).toBe(1100);
    expect(vigente.detalle.pagaCliente).toBe(0);
    expect(vigente.estado).toBe('no_requiere');
    expect(cotizada.body.data.puede.decidir).toBe(false);

    // No se le pide aceptar al cliente, y la reparacion sigue sin autorizacion.
    const decision = await decidir(jefatura, id, true);
    expect(decision.status).toBe(422);
    expect(decision.body.error.code).toBe('NO_REQUIERE_AUTORIZACION');
    await evidencia(id, 'diagnostico');
    await mover(tecnico, id, 'cotizada').expect(200);
    expect((await mover(tecnico, id, 'esperando_autorizacion')).status).toBe(422);
    await mover(tecnico, id, 'en_reparacion').expect(200);
  });

  it('E-2. garantia adicional: la paga la cobertura adicional; descuentos no aplican', async () => {
    const base = await articulo(SIN_GARANTIA);
    await peticion(entorno.aplicacion).post(`${RAIZ}/articulos/${base.idArticulo}/coberturas`).set(jefatura)
      .send({ tipo: 'adicional', vigenteDesde: new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10), meses: 12 })
      .expect(201);
    const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente).send({
      ...base, modalidad: MODALIDAD_SERVICIO.TALLER, fallaReportada: 'No enfria', tipoGarantiaElegida: 'adicional',
    }).expect(201);
    const id = creada.body.data.id as string;
    await peticion(entorno.aplicacion).put(`${RAIZ}/ordenes/${id}/tecnico`).set(gestor).send({ idTecnico }).expect(200);
    await evidencia(id, 'recepcion');
    await mover(gestor, id, 'asignada').expect(200);
    await evidencia(id, 'validacion_garantia');
    await mover(gestor, id, 'en_cola_taller').expect(200);
    await mover(gestor, id, 'en_diagnostico').expect(200);
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${id}/diagnostico`).set(tecnico)
      .send({ fallaReal: 'Termostato abierto' }).expect(201);

    const conDescuento = await cotizar(jefatura, id, {
      manoObra: 500, ajustes: { manoObra: { tipo: 'porcentaje', valor: 10 } }, motivo: 'Intento de descuento en garantia',
    });
    expect(conDescuento.status).toBe(422);
    expect(conDescuento.body.error.code).toBe('AJUSTE_NO_APLICA');

    const cotizada = await cotizar(tecnico, id, { manoObra: 500 }).expect(201);
    const vigente = cotizada.body.data.cotizaciones.at(-1);
    expect(vigente.detalle.responsablePago).toBe('garantia_adicional');
    expect(vigente.detalle.pagaCliente).toBe(0);
  });
});

describe('garantia que deja de aplicar (E-4, E-5, E-16)', () => {
  let original = '';
  let nueva = '';

  it('E-4. el diagnostico anota la exclusion pero no cierra ni cambia nada por si solo', async () => {
    original = await diagnosticada('proveedor', PROVEEDOR_APLICA);
    const pieza = await repuesto(90);
    await pedir(original, pieza.id, 1, 'aprobada');
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${original}/diagnostico`).set(tecnico)
      .send({ fallaReal: 'Carcasa partida', exclusion: 'Golpe en la parte trasera' }).expect(201);
    const orden = await ficha(agente, original);
    expect(orden.estado).toBe('en_diagnostico');
    expect(orden.tipoGarantia).toBe('proveedor');
  });

  it('solo un usuario autorizado confirma la exclusion, y con motivo', async () => {
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${original}/exclusion`).set(agente)
      .send({ motivo: 'El agente intenta cerrar la garantia' }).expect(403);
    await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${original}/exclusion`).set(tecnico)
      .send({ motivo: 'El tecnico intenta cerrar la garantia' }).expect(403);
    const sinMotivo = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${original}/exclusion`).set(jefatura)
      .send({ motivo: 'corto' });
    expect(sinMotivo.status).toBe(400);
    expect((await ficha(agente, original)).estado).toBe('en_diagnostico');
  });

  it('E-5. la confirmacion cierra la original sin reparar (no anulada) y abre una particular vinculada', async () => {
    const movimientosAntes = await movimientos(original);
    const respuesta = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${original}/exclusion`).set(jefatura)
      .send({ motivo: 'Golpe constatado: la garantia del proveedor no cubre danos fisicos' }).expect(201);
    nueva = respuesta.body.data.idOrdenNueva;
    expect(nueva).toBeTypeOf('string');

    const cerrada = await ficha(agente, original);
    expect(cerrada.estado).toBe('cerrada_sin_reparar');
    expect(cerrada.tipoGarantia).toBe('proveedor');
    const abierta = await ficha(agente, nueva);
    expect(abierta.estado).toBe('registrada');
    expect(abierta.tipoGarantia).toBe('particular');
    expect(abierta.idCliente ?? abierta.cliente).toBeDefined();

    // Vinculo en las dos, con antecedentes consultables.
    const garantiaOriginal = (await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${original}/garantia`).set(agente)
      .expect(200)).body.data;
    expect(garantiaOriginal.relacionadas).toEqual([expect.objectContaining({ relacion: 'continuacion', id: nueva })]);
    expect(garantiaOriginal.exclusion.motivo).toMatch(/Golpe constatado/);
    const garantiaNueva = (await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${nueva}/garantia`).set(agente)
      .expect(200)).body.data;
    expect(garantiaNueva.relacionadas).toEqual([expect.objectContaining({ relacion: 'origen', id: original })]);
    const datosNueva = await taller(agente, nueva);
    expect(datosNueva.antecedentes.idOrden).toBe(original);
    expect(datosNueva.antecedentes.diagnosticos.length).toBeGreaterThanOrEqual(2);

    // E-16. La original conserva diagnostico, repuestos e historial; no se
    // duplican solicitudes, consumos ni movimientos en la nueva.
    const datosOriginal = await taller(agente, original);
    expect(datosOriginal.diagnosticos.length).toBeGreaterThanOrEqual(2);
    expect(datosOriginal.repuestos).toHaveLength(1);
    expect(datosNueva.repuestos).toHaveLength(0);
    expect(datosNueva.cotizaciones).toHaveLength(0);
    expect(await movimientos(original)).toBe(movimientosAntes);
    expect(await movimientos(nueva)).toBe(0);
    const eventos = (await peticion(entorno.aplicacion).get(`${RAIZ}/ordenes/${original}/historial`).set(agente)
      .expect(200)).body.data as Array<{ titulo: string }>;
    expect(eventos.some((e) => e.titulo.startsWith('Exclusion de garantia confirmada'))).toBe(true);
    expect(eventos.some((e) => e.titulo.endsWith('→ cerrada sin reparar'))).toBe(true);
  });

  it('una orden ya cerrada o particular no admite otra exclusion', async () => {
    expect((await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${original}/exclusion`).set(jefatura)
      .send({ motivo: 'Segunda exclusion sobre la misma orden' })).status).toBe(422);
    expect((await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes/${nueva}/exclusion`).set(jefatura)
      .send({ motivo: 'Exclusion sobre una orden particular' })).status).toBe(422);
  });
});

describe('repuestos y precios en la cotizacion (E-6, E-7, E-8)', () => {
  let id = '';
  let pieza = { id: '', codigo: '' };
  let otra = { id: '', codigo: '' };

  beforeAll(async () => {
    id = await diagnosticada('particular', PROVEEDOR_APLICA);
    pieza = await repuesto(125.5);
    otra = await repuesto(33.33);
    await pedir(id, pieza.id, 2, 'aprobada');
    await pedir(id, otra.id, 3);
    // Una rechazada no cuenta.
    await entorno.piscina.query(
      `INSERT INTO solicitud_repuesto (id_orden, id_repuesto, cantidad, via, estado, motivo)
       VALUES ($1, $2, 5, 'compra_local', 'rechazada', 'Sin existencia')`, [id, otra.id],
    );
  });

  it('E-6/E-7. el precio sale del inventario y los subtotales y totales cuadran', async () => {
    const datos = await taller(agente, id);
    const fila = datos.repuestos.find((r: { codigo: string }) => r.codigo === otra.codigo);
    expect(fila.cantidad).toBe(3);
    expect(fila.porEstado).toMatchObject({ solicitada: 3, rechazada: 5 });
    expect(fila.utilizada).toBe(0);

    // totalRepuestos que mande el usuario se ignora: no se escribe a mano.
    const respuesta = await cotizar(tecnico, id, { manoObra: 400, totalRepuestos: 1 }).expect(201);
    const detalle = respuesta.body.data.cotizaciones.at(-1).detalle;
    const lineas = Object.fromEntries(detalle.repuestos.lineas.map((l: { codigo: string }) => [l.codigo, l]));
    expect(lineas[pieza.codigo]).toMatchObject({ cantidad: 2, precioUnitario: 125.5, subtotal: 251 });
    expect(lineas[otra.codigo]).toMatchObject({ cantidad: 3, precioUnitario: 33.33, subtotal: 99.99 });
    expect(detalle.repuestos.final).toBe(350.99);
    expect(detalle.totalFinal).toBe(750.99);
    expect(respuesta.body.data.cotizaciones.at(-1).totalRepuestos).toBe(350.99);
  });

  it('E-8. cambiar el precio del inventario no altera la cotizacion registrada', async () => {
    await entorno.piscina.query('UPDATE repuesto SET precio = 999 WHERE id = $1', [pieza.id]);
    const datos = await taller(agente, id);
    const vigente = datos.cotizaciones.at(-1);
    expect(vigente.total).toBe(750.99);
    expect(vigente.detalle.repuestos.lineas.find((l: { codigo: string }) => l.codigo === pieza.codigo).precioUnitario).toBe(125.5);
    // El precio de hoy se ve en la tabla de repuestos de la orden.
    expect(datos.repuestos.find((r: { codigo: string }) => r.codigo === pieza.codigo).precioInventario).toBe(999);
  });

  it('un repuesto sin precio queda pendiente y la cotizacion no se registra con un importe inventado', async () => {
    const sinPrecio = await repuesto(0);
    await pedir(id, sinPrecio.id, 1);
    const datos = await taller(agente, id);
    expect(datos.repuestos.find((r: { codigo: string }) => r.codigo === sinPrecio.codigo).precioInventario).toBeNull();
    const respuesta = await cotizar(tecnico, id, { manoObra: 400, motivo: 'Nueva version con el repuesto nuevo' });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.code).toBe('PRECIO_PENDIENTE');
    expect(respuesta.body.error.message).toContain(sinPrecio.codigo);

    // Con permiso, se puede cotizar ese precio con motivo; queda el de inventario y el cotizado.
    const conPrecio = await cotizar(jefatura, id, {
      manoObra: 400, preciosRepuestos: [{ idRepuesto: sinPrecio.id, precioUnitario: 80 }],
      motivo: 'Precio del proveedor local segun factura proforma',
    }).expect(201);
    const linea = conPrecio.body.data.cotizaciones.at(-1).detalle.repuestos.lineas
      .find((l: { codigo: string }) => l.codigo === sinPrecio.codigo);
    expect(linea).toMatchObject({ precioInventario: null, precioUnitario: 80, subtotal: 80 });
    expect(linea.motivoPrecio).toMatch(/proforma/);
  });
});

describe('ordenes particulares: precio completo, exoneraciones y descuentos (E-9 a E-12, E-15)', () => {
  let id = '';
  beforeAll(async () => {
    id = await diagnosticada('particular', PROVEEDOR_APLICA);
    await pedir(id, (await repuesto(100)).id, 2);
  });

  it('E-9. precio completo: el cliente paga todo', async () => {
    const respuesta = await cotizar(tecnico, id, { manoObra: 500 }).expect(201);
    const detalle = respuesta.body.data.cotizaciones.at(-1).detalle;
    expect(detalle).toMatchObject({ totalOriginal: 700, totalFinal: 700, pagaCliente: 700, responsablePago: 'cliente' });
  });

  it('E-15. sin permiso no se descuenta, no se exonera ni se cambia un precio', async () => {
    const descuento = await cotizar(tecnico, id, {
      manoObra: 500, ajustes: { manoObra: { tipo: 'exoneracion_total' } }, motivo: 'El tecnico quiere exonerar',
    });
    expect(descuento.status).toBe(403);
    const visita = await cotizar(tecnico, id, { manoObra: 500, cargoVisita: 50, motivo: 'El tecnico cambia la visita' });
    expect(visita.status).toBe(403);
    const agenteIntenta = await cotizar(agente, id, { manoObra: 500 });
    expect(agenteIntenta.status).toBe(403);
    expect((await taller(agente, id)).cotizaciones).toHaveLength(1);
  });

  it('una version nueva exige motivo', async () => {
    const sinMotivo = await cotizar(jefatura, id, { manoObra: 500, ajustes: { manoObra: { tipo: 'exoneracion_total' } } });
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.body.error.fields).toHaveProperty('motivo');
  });

  it('E-10. mano de obra exonerada', async () => {
    const respuesta = await cotizar(jefatura, id, {
      manoObra: 500, ajustes: { manoObra: { tipo: 'exoneracion_total' } }, motivo: 'Cortesia por garantia adicional no aplicable',
    }).expect(201);
    const vigente = respuesta.body.data.cotizaciones.at(-1);
    expect(vigente.detalle.manoObra).toMatchObject({ original: 500, descuento: 500, final: 0 });
    expect(vigente.detalle).toMatchObject({ totalOriginal: 700, totalFinal: 200 });
    expect(vigente.manoObra).toBe(0);
    expect(vigente.total).toBe(200);
    expect(vigente.motivo).toMatch(/Cortesia/);
  });

  it('E-11. visita tecnica exonerada (orden de ruta con cargo)', async () => {
    const base = await articulo(`${PROVEEDOR_APLICA} AND EXISTS (SELECT 1 FROM cliente_direccion d JOIN zona z ON z.id = d.id_zona
      WHERE d.id_cliente = c.id AND d.vigente AND z.cargo_visita > 0)`);
    const creada = await peticion(entorno.aplicacion).post(`${RAIZ}/ordenes`).set(agente).send({
      ...base, modalidad: MODALIDAD_SERVICIO.RUTA, fallaReportada: 'No enfria', tipoGarantiaElegida: 'particular',
    }).expect(201);
    const cargo = creada.body.data.cargoVisita as number;
    expect(cargo).toBeGreaterThan(0);
    const respuesta = await cotizar(jefatura, creada.body.data.id, {
      manoObra: 0, ajustes: { visita: { tipo: 'exoneracion_total' } }, motivo: 'Se exonera la visita por reincidencia',
    }).expect(201);
    const detalle = respuesta.body.data.cotizaciones.at(-1).detalle;
    expect(detalle.visita).toMatchObject({ original: cargo, final: 0 });
    expect(detalle.totalFinal).toBe(0);
  });

  it('E-12. descuentos parciales; nunca mayores que el concepto ni negativos', async () => {
    const respuesta = await cotizar(jefatura, id, {
      manoObra: 500,
      ajustes: { manoObra: { tipo: 'porcentaje', valor: 20 }, repuestos: { tipo: 'importe', valor: 50 } },
      motivo: 'Descuento comercial autorizado por jefatura',
    }).expect(201);
    expect(respuesta.body.data.cotizaciones.at(-1).detalle).toMatchObject({ totalOriginal: 700, totalFinal: 550 });

    const excesivo = await cotizar(jefatura, id, {
      manoObra: 500, ajustes: { repuestos: { tipo: 'importe', valor: 900 } }, motivo: 'Descuento mayor que los repuestos',
    });
    expect(excesivo.status).toBe(400);
    const negativo = await cotizar(jefatura, id, { manoObra: -10, motivo: 'Mano de obra negativa' });
    expect(negativo.status).toBe(400);
  });

  it('cada version conserva su importe, con el anterior, el motivo, quien y cuando', async () => {
    const datos = await taller(agente, id);
    expect(datos.cotizaciones.map((c: { total: number }) => c.total)).toEqual([700, 200, 550]);
    expect(datos.cotizaciones.map((c: { estado: string }) => c.estado)).toEqual(['reemplazada', 'reemplazada', 'pendiente']);
    const { rows } = await entorno.piscina.query<{ valor_anterior: string | null; motivo: string | null; id_usuario: string }>(
      `SELECT b.valor_anterior, b.motivo, b.id_usuario FROM bitacora b JOIN cotizacion c ON c.id = b.id_registro
        WHERE b.tabla = 'cotizacion' AND b.campo = 'detalle' AND c.id_orden = $1 ORDER BY b.momento`, [id],
    );
    expect(rows.map((r) => r.valor_anterior)).toEqual([null, '700', '200']);
    expect(rows[2]!.motivo).toMatch(/Descuento comercial/);
    expect(rows.every((r) => typeof r.id_usuario === 'string')).toBe(true);
  });
});

describe('autorizacion del cliente (E-13, E-14)', () => {
  it('E-13. rechazo: queda registrado con canal y observacion, y se cierra sin reparar', async () => {
    const id = await diagnosticada('particular', PROVEEDOR_APLICA);
    await cotizar(tecnico, id, { manoObra: 300 }).expect(201);
    await evidencia(id, 'diagnostico');
    await mover(tecnico, id, 'cotizada').expect(200);
    await mover(tecnico, id, 'esperando_autorizacion').expect(200);
    await decidir(agente, id, false, 'Le parece caro').expect(200);
    const vigente = (await taller(agente, id)).cotizaciones.at(-1);
    expect(vigente.estado).toBe('rechazada');
    expect(vigente.observacionDecision).toMatch(/llamada: Le parece caro/);
    expect((await mover(jefatura, id, 'autorizada')).status).toBe(422);
    await mover(jefatura, id, 'cerrada_sin_reparar').expect(200);
  });

  it('E-13/E-14. aceptacion; si despues cambia el precio, hace falta una nueva aceptacion', async () => {
    const id = await diagnosticada('particular', PROVEEDOR_APLICA);
    // Sin cotizacion no se pide autorizacion.
    await evidencia(id, 'diagnostico');
    await mover(tecnico, id, 'cotizada').expect(200);
    const sinCotizacion = await mover(tecnico, id, 'esperando_autorizacion');
    expect(sinCotizacion.status).toBe(422);
    expect(sinCotizacion.body.error.message).toMatch(/cotizacion valida/);

    await cotizar(tecnico, id, { manoObra: 300 }).expect(201);
    await mover(tecnico, id, 'esperando_autorizacion').expect(200);
    await decidir(agente, id, true, 'Acepta').expect(200);

    // Cambia el precio: version nueva, la aceptacion anterior se conserva.
    await cotizar(jefatura, id, {
      manoObra: 300, ajustes: { manoObra: { tipo: 'importe', valor: 100 } }, motivo: 'Se aplica descuento despues de aceptar',
    }).expect(201);
    const datos = await taller(agente, id);
    expect(datos.cotizaciones.map((c: { estado: string }) => c.estado)).toEqual(['aceptada', 'pendiente']);
    const sinNuevaAceptacion = await mover(jefatura, id, 'autorizada');
    expect(sinNuevaAceptacion.status).toBe(422);
    expect(sinNuevaAceptacion.body.error.message).toMatch(/no acepta la cotizacion/);

    await decidir(agente, id, true, 'Acepta el nuevo importe').expect(200);
    await mover(jefatura, id, 'autorizada').expect(200);

    // Ya autorizada, la cotizacion no se cambia.
    const tarde = await cotizar(jefatura, id, { manoObra: 200, motivo: 'Cambio despues de autorizar la orden' });
    expect(tarde.status).toBe(422);
  });
});
