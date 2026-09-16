/**
 * Servicio de cobros.
 *
 * El taller repara miles de articulos al ano que el cliente no paga. Lo
 * que decide si eso es un servicio o una sangria es cuanto de ello se le
 * recupera al fabricante y a la aseguradora. Este modulo es esa cobranza.
 *
 * Dos reglas gobiernan todo lo que sigue:
 *
 *  1. RF-57: UN EXPEDIENTE CON EVIDENCIA INCOMPLETA NO SE ENVIA. Y no se
 *     consulta una bandera cacheada para saberlo: se vuelve a preguntar a
 *     `v_evidencia_faltante` en cada paso, porque entre que se conformo y
 *     que se envia pudo subir una foto —o caerse una.
 *  2. EL MONTO SALE DE LOS DATOS, NO DE UN SUPUESTO. Repuestos al precio
 *     congelado del movimiento, mano de obra de la cotizacion, cargo de
 *     visita solo si hubo visita.
 *
 * Por lo segundo NO se admite teclear la mano de obra al conformar: el
 * expediente se recalcula solo en cada paso, y un valor escrito a mano que
 * ninguna tabla guarda se perderia en el primer recalculo. Una casilla que
 * borra lo que uno escribe es peor que no tenerla. Si hay que reclamar mano
 * de obra, o se registra la cotizacion de la orden o se parametriza una
 * tarifa, y eso ultimo es una decision del negocio.
 */
import {
  ESTADO_EXPEDIENTE, ESTADO_ORDEN, type EstadoExpediente, type Paginacion,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { ErrorConflicto, ErrorDominio, ErrorNoEncontrado } from '../../comun/errores.js';
import { bitacora } from '../../comun/bitacora.js';
import { construirPaginacion, type ParametrosPagina } from '../../comun/paginacion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import {
  calcularReclamo, destinatarioDe, destinosPosibles, estadoSegunEvidencia, evaluarTransicion,
} from '../../dominio/cobros/indice.js';
import type {
  FichaExpediente, IndicadoresDeCobro, PeticionMoverExpediente, PeticionRegistrarPago,
  ResumenExpediente, ResumenPago,
} from '@servitotal/compartido';
import * as dto from './dto.js';
import * as repositorio from './repositorio.js';

export async function listar(
  filtro: repositorio.FiltroExpedientes, parametros: ParametrosPagina,
): Promise<{ datos: readonly ResumenExpediente[]; paginacion: Paginacion }> {
  // Sin Promise.all: van sobre la misma conexion del pool y el cliente de
  // pg no admite consultas simultaneas.
  const total = await repositorio.contar(filtro);
  const filas = await repositorio.listar(filtro, parametros.tamano, parametros.desplazamiento);
  return {
    datos: filas.map(dto.comoResumenExpediente),
    paginacion: construirPaginacion(parametros, total),
  };
}

export async function obtener(id: string): Promise<FichaExpediente> {
  const fila = await repositorio.buscar(id);
  if (fila === null) throw new ErrorNoEncontrado('No existe ese expediente de cobro.');
  return armarFicha(fila);
}

async function armarFicha(fila: dto.FilaExpediente): Promise<FichaExpediente> {
  const orden = await repositorio.desgloseDeOrden(fila.id_orden);
  if (orden === null) throw new ErrorNoEncontrado('El expediente apunta a una orden que ya no existe.');

  const renglones = await repositorio.renglonesDeOrden(fila.id_orden);
  const faltante = await repositorio.evidenciaFaltante(fila.id_orden);

  const desglose = calcularReclamo({
    modalidad: orden.modalidad,
    totalRepuestos: renglones.reduce((suma, renglon) => suma + Number(renglon.importe), 0),
    manoObra: Number(orden.mano_obra),
    cargoVisita: Number(orden.cargo_visita),
  });

  return {
    ...dto.comoResumenExpediente(fila),
    modalidad: orden.modalidad,
    fallaReportada: orden.falla_reportada,
    fechaRecepcion: orden.fecha_recepcion.toISOString(),
    fechaEntrega: orden.fecha_entrega?.toISOString() ?? null,
    renglones: renglones.map(dto.comoRenglon),
    desglose,
    evidenciaPendiente: faltante.map(dto.comoEvidenciaPendiente),
    estadosPosibles: destinosPosibles(fila.estado),
  };
}

/**
 * Conforma el expediente de una orden.
 *
 * Solo se conforma sobre una orden ENTREGADA: mientras el articulo sigue
 * en el taller la reparacion puede cambiar, y reclamar sobre un costo que
 * despues se mueve es como se pierde la credibilidad ante una marca.
 */
export async function conformar(actor: Actor, idOrden: string): Promise<FichaExpediente> {
  const existente = await repositorio.buscarPorOrden(idOrden);
  if (existente !== null) {
    throw new ErrorConflicto(
      `La orden ${existente.numero_orden} ya tiene un expediente de cobro. ` +
      'Abralo en vez de crear otro; una orden se le reclama a un solo tercero.',
    );
  }

  const orden = await repositorio.desgloseDeOrden(idOrden);
  if (orden === null) throw new ErrorNoEncontrado('No existe esa orden de servicio.');

  if (orden.estado !== ESTADO_ORDEN.ENTREGADA) {
    throw new ErrorDominio(
      'ORDEN_NO_ENTREGADA',
      `La orden ${orden.numero} esta en ${orden.estado}. El expediente se conforma cuando el ` +
      'articulo ya se entrego: antes, el costo de la reparacion todavia puede cambiar.',
    );
  }

  const veredicto = destinatarioDe(orden.tipo_garantia);
  if (!veredicto.reclamable) {
    throw new ErrorDominio('GARANTIA_NO_RECLAMABLE', veredicto.motivo!);
  }

  const renglones = await repositorio.renglonesDeOrden(idOrden);
  const faltante = await repositorio.evidenciaFaltante(idOrden);
  const evidenciaCompleta = faltante.length === 0;

  const desglose = calcularReclamo({
    modalidad: orden.modalidad,
    totalRepuestos: renglones.reduce((suma, renglon) => suma + Number(renglon.importe), 0),
    manoObra: Number(orden.mano_obra),
    cargoVisita: Number(orden.cargo_visita),
  });

  const id = await enTransaccion(async (cliente) => repositorio.insertar(cliente, {
    idOrden,
    destinatario: veredicto.destinatario!,
    // La poliza no tiene marca: el reclamo va a la aseguradora.
    idMarca: veredicto.destinatario === 'proveedor' ? orden.id_marca : null,
    montoReclamado: desglose.total,
    estado: estadoSegunEvidencia(ESTADO_EXPEDIENTE.EN_CONFORMACION, evidenciaCompleta),
    evidenciaCompleta,
    idUsuario: actor.id,
  }));

  bitacora.informacion('Expediente de cobro conformado', {
    idExpediente: id, numeroOrden: orden.numero, destinatario: veredicto.destinatario,
    monto: desglose.total, evidenciaCompleta,
  });

  return obtener(id);
}

/**
 * Recalcula monto y evidencia contra los datos de hoy.
 *
 * Se llama sola antes de cualquier movimiento de estado. Un expediente
 * conformado en enero y enviado en marzo con el monto de enero es una
 * diferencia que el fabricante devuelve.
 */
export async function verificar(actor: Actor, id: string): Promise<FichaExpediente> {
  const fila = await repositorio.buscar(id);
  if (fila === null) throw new ErrorNoEncontrado('No existe ese expediente de cobro.');

  const ficha = await armarFicha(fila);
  const evidenciaCompleta = ficha.evidenciaPendiente.length === 0;
  const estado = estadoSegunEvidencia(fila.estado, evidenciaCompleta);

  await enTransaccion(async (cliente) => repositorio.actualizarMonto(cliente, {
    id,
    montoReclamado: ficha.desglose.total,
    evidenciaCompleta,
    estado,
    idUsuario: actor.id,
  }));

  return obtener(id);
}

/** Momentos que el cambio de estado sella con fecha. */
function fechasDe(hacia: EstadoExpediente): { envio: Date | null; resultado: Date | null } {
  const ahora = new Date();
  if (hacia === ESTADO_EXPEDIENTE.ENVIADO) return { envio: ahora, resultado: null };
  const conResultado: readonly EstadoExpediente[] = [
    ESTADO_EXPEDIENTE.ACEPTADO, ESTADO_EXPEDIENTE.RECHAZADO, ESTADO_EXPEDIENTE.PAGADO,
  ];
  if (conResultado.includes(hacia)) return { envio: null, resultado: ahora };
  return { envio: null, resultado: null };
}

export async function mover(
  actor: Actor, id: string, peticion: PeticionMoverExpediente,
): Promise<FichaExpediente> {
  const fila = await repositorio.buscar(id);
  if (fila === null) throw new ErrorNoEncontrado('No existe ese expediente de cobro.');

  // Se vuelve a mirar la evidencia AHORA. La bandera guardada puede tener
  // semanas y RF-57 se comprueba contra la realidad, no contra una copia.
  const ficha = await armarFicha(fila);
  const evidenciaCompleta = ficha.evidenciaPendiente.length === 0;

  const veredicto = evaluarTransicion({
    estado: fila.estado,
    hacia: peticion.hacia,
    evidenciaCompleta,
    montoReclamado: ficha.desglose.total,
    montoCobrado: peticion.montoCobrado ?? null,
    motivoRechazo: peticion.motivoRechazo ?? null,
  });

  if (!veredicto.permitida) {
    const detalle = veredicto.codigo === 'EXPEDIENTE_EVIDENCIA_INCOMPLETA'
      ? ` Falta: ${ficha.evidenciaPendiente.map((una) => una.etiqueta).join(', ')}.`
      : '';
    throw new ErrorDominio(veredicto.codigo!, `${veredicto.motivo!}${detalle}`);
  }

  const fechas = fechasDe(peticion.hacia);

  await enTransaccion(async (cliente) => {
    // El monto que sale es el de hoy, no el del dia en que se conformo.
    await repositorio.actualizarMonto(cliente, {
      id,
      montoReclamado: ficha.desglose.total,
      evidenciaCompleta,
      estado: fila.estado,
      idUsuario: actor.id,
    });
    await repositorio.actualizarEstado(cliente, {
      id,
      estado: peticion.hacia,
      fechaEnvio: fechas.envio,
      fechaResultado: fechas.resultado,
      // Se limpia al volver a conformacion: el motivo viejo ya no aplica.
      motivoRechazo: peticion.hacia === ESTADO_EXPEDIENTE.RECHAZADO
        ? peticion.motivoRechazo!.trim()
        : null,
      montoCobrado: peticion.montoCobrado ?? null,
      idUsuario: actor.id,
    });
  });

  bitacora.informacion('Expediente de cobro movido', {
    idExpediente: id, desde: fila.estado, hacia: peticion.hacia, responsable: actor.nombreUsuario,
  });

  return obtener(id);
}

// ── pagos del cliente ───────────────────────────────────────────────────

export async function listarPagos(
  idOrden: string | undefined, parametros: ParametrosPagina,
): Promise<{ datos: readonly ResumenPago[]; paginacion: Paginacion }> {
  const total = await repositorio.contarPagos(idOrden);
  const filas = await repositorio.listarPagos(idOrden, parametros.tamano, parametros.desplazamiento);
  return {
    datos: filas.map(dto.comoResumenPago),
    paginacion: construirPaginacion(parametros, total),
  };
}

/**
 * Registra lo que el cliente pago.
 *
 * Se admite en cualquier tipo de garantia a proposito: aunque la
 * reparacion la cubra la marca, el cliente puede pagar el cargo de visita
 * o un repuesto excluido de la cobertura. Negarlo obligaria a cobrar por
 * fuera del sistema, que es justo lo que no se quiere.
 */
export async function registrarPago(
  actor: Actor, idOrden: string, peticion: PeticionRegistrarPago,
): Promise<ResumenPago> {
  const orden = await repositorio.desgloseDeOrden(idOrden);
  if (orden === null) throw new ErrorNoEncontrado('No existe esa orden de servicio.');

  const id = await enTransaccion(async (cliente) => repositorio.insertarPago(cliente, {
    idOrden,
    monto: peticion.monto,
    formaPago: peticion.formaPago,
    referencia: peticion.referencia ?? null,
    idEvidencia: peticion.idEvidencia ?? null,
    idUsuario: actor.id,
  }));

  const pagina = await listarPagos(idOrden, { pagina: 1, tamano: 50, desplazamiento: 0 });
  const registrado = pagina.datos.find((pago: ResumenPago) => pago.id === id);
  if (registrado === undefined) {
    throw new ErrorNoEncontrado('El pago se registro pero no se pudo releer.');
  }
  return registrado;
}

// ── indicadores ─────────────────────────────────────────────────────────

/**
 * Lo que la jefatura mira para decidir.
 *
 * `tasaRecuperacion` por marca no es una curiosidad: una marca que paga el
 * 40% de lo que se le reclama esta trasladando su garantia al taller, y esa
 * conversacion se tiene con el numero delante.
 */
export async function indicadores(): Promise<IndicadoresDeCobro> {
  const totales = await repositorio.totales();
  const porMarca = await repositorio.recuperacionPorMarca();

  const reclamado = Number(totales.total_reclamado);
  const cobrado = Number(totales.total_cobrado);

  return {
    expedientes: Number(totales.expedientes),
    bloqueadosPorEvidencia: Number(totales.bloqueados),
    enviadosSinRespuesta: Number(totales.enviados_sin_respuesta),
    totalReclamado: reclamado,
    totalCobrado: cobrado,
    tasaRecuperacion: reclamado === 0 ? 0 : Math.round((cobrado / reclamado) * 1000) / 10,
    expuesto: Number(totales.expuesto),
    porMarca: porMarca.map(dto.comoRecuperacion),
  };
}
