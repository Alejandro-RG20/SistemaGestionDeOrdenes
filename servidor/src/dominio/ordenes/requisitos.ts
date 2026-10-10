/**
 * Requisitos de una transicion.
 *
 * Cada uno sabe comprobarse y sabe explicarse. El mensaje lo lee el
 * asistente del taller: dice que falta y quien lo tiene que hacer, no que
 * fallo una precondicion.
 */
import { MODALIDAD_SERVICIO, TIPO_GARANTIA } from '@servitotal/compartido';
import type { ContextoTransicion } from './contexto-transicion.js';

export interface Requisito {
  readonly nombre: string;
  seCumple(contexto: ContextoTransicion): boolean;
  mensaje(contexto: ContextoTransicion): string;
}

function requisito(
  nombre: string,
  seCumple: (contexto: ContextoTransicion) => boolean,
  mensaje: (contexto: ContextoTransicion) => string,
): Requisito {
  return { nombre, seCumple, mensaje };
}

export const tieneTecnicoAsignado = requisito(
  'la orden tiene un tecnico asignado',
  (contexto) => contexto.orden.idTecnico !== null,
  () => 'Primero hay que asignarle un tecnico a la orden.',
);

export const tieneVisitaProgramada = requisito(
  'la orden tiene una visita vigente programada',
  (contexto) => contexto.tieneVisitaVigente,
  () => 'La orden no tiene visita programada. Programela en la agenda antes de mandar al tecnico.',
);

export const tieneDiagnosticoRegistrado = requisito(
  'el tecnico registro el diagnostico',
  (contexto) => contexto.tieneDiagnostico,
  () => 'Falta registrar el diagnostico con la falla real encontrada.',
);

export const tieneCotizacionRegistrada = requisito(
  'la orden tiene cotizacion',
  (contexto) => contexto.tieneCotizacion,
  () => 'Falta elaborar la cotizacion.',
);

export const cotizacionFueAceptada = requisito(
  'el cliente acepto la cotizacion',
  (contexto) => contexto.cotizacionAceptada,
  () => 'El cliente todavia no acepta la cotizacion. Sin su autorizacion la reparacion no empieza.',
);

export const repuestosLiberados = requisito(
  'todos los repuestos pedidos ya ingresaron',
  (contexto) => contexto.solicitudesSinLiberar === 0,
  (contexto) => `Faltan ${contexto.solicitudesSinLiberar} repuesto(s) por ingresar. ` +
    'La orden se libera sola en cuanto bodega los reciba.',
);

/**
 * Ninguna orden avanza de estado sin la evidencia obligatoria que le
 * corresponde. El mensaje nombra lo que falta, una por una.
 */
export const evidenciaObligatoriaCompleta = requisito(
  'la evidencia obligatoria del estado esta cargada',
  (contexto) => contexto.evidenciasFaltantes.length === 0,
  (contexto) => {
    const faltantes = contexto.evidenciasFaltantes.map((evidencia) => evidencia.etiqueta).join('; ');
    return `No se puede avanzar sin la evidencia obligatoria. Falta: ${faltantes}.`;
  },
);

export const esOrdenDeRuta = requisito(
  'la orden es de modalidad ruta',
  (contexto) => contexto.orden.modalidad === MODALIDAD_SERVICIO.RUTA,
  () => 'Solo una orden de ruta puede salir a domicilio. Esta orden es de taller.',
);

export const tieneMotivoEscrito = requisito(
  'se escribio el motivo',
  (contexto) => (contexto.motivo ?? '').trim().length >= 10,
  () => 'Escriba el motivo de la anulacion: queda registrado y el cliente puede preguntarlo.',
);

/**
 * Una orden cubierta por garantia no pasa por la autorizacion del cliente:
 * no hay nada que autorizar porque no paga el.
 */
export const laPagaElCliente = requisito(
  'la reparacion corre por cuenta del cliente',
  (contexto) => contexto.orden.tipoGarantia === TIPO_GARANTIA.PARTICULAR,
  () => 'Esta orden esta cubierta por garantia; no hace falta que el cliente autorice el gasto.',
);

/**
 * Una reparacion particular no empieza sin que el cliente la autorice.
 *
 * Antes se podia ir de diagnostico —o de cotizada— directo a reparacion, y
 * una orden particular se reparaba sin que nadie le preguntara al cliente.
 * Una orden cubierta por garantia no necesita autorizacion.
 */
export const autorizadaSiLaPagaElCliente = requisito(
  'si la reparacion es particular, el cliente la autorizo',
  (contexto) => contexto.orden.tipoGarantia !== TIPO_GARANTIA.PARTICULAR || contexto.cotizacionAceptada,
  () => 'Esta reparacion es particular y el cliente todavia no la autorizo. '
    + 'Registre la cotizacion y la autorizacion del cliente antes de reparar.',
);

/** No se termina una reparacion con repuestos pedidos que siguen en camino. */
export const sinSolicitudesAbiertas = requisito(
  'no quedan solicitudes de repuesto abiertas',
  (contexto) => contexto.solicitudesAbiertas === 0,
  (contexto) => `Hay ${contexto.solicitudesAbiertas} solicitud(es) de repuesto sin cerrar. `
    + 'Confirme la recepcion de lo entregado, o anule lo que ya no se necesita, antes de finalizar.',
);

/**
 * Lo que bodega entrego para la orden tiene que quedar instalado o devuelto.
 * Si no, la pieza queda en el limbo: ni en el articulo ni en la bodega.
 */
export const repuestosConciliados = requisito(
  'todo repuesto entregado para la orden se uso o se devolvio',
  (contexto) => contexto.piezasSinConciliar === 0,
  (contexto) => `Hay ${contexto.piezasSinConciliar} pieza(s) entregadas para esta orden sin uso ni `
    + 'devolucion registrados. Registre el consumo de lo instalado y devuelva lo que no se uso.',
);

/**
 * Entregar es un acto, con acta: a quien, quien lo entrego y cuando. Mover
 * el estado a «entregada» sin el acta era la puerta de atras que se saltaba
 * la revision tecnica y la autorizacion del cliente.
 */
export const tieneActaDeEntrega = requisito(
  'se registro el acta de entrega',
  (contexto) => contexto.tieneEntrega,
  () => 'La entrega se registra desde «Entregar el articulo», con el nombre de quien retira. '
    + 'Ahi se comprueba que la revision y la autorizacion esten completas.',
);

/**
 * Una orden cubierta por garantia sigue sin pasar por autorizacion. Una
 * particular, desde la migracion 0024, pasa SIEMPRE por «esperando
 * autorizacion» y «autorizada»: el atajo de cotizada a reparacion queda
 * solo para lo que no paga el cliente.
 */
export const cubiertaPorGarantia = requisito(
  'la reparacion esta cubierta por una garantia',
  (contexto) => contexto.orden.tipoGarantia !== TIPO_GARANTIA.PARTICULAR,
  () => 'Esta reparacion la paga el cliente: pasela a «esperando autorizacion» y, cuando el '
    + 'cliente acepte la cotizacion, autorice la orden.',
);

/**
 * La orden es una visita particular a domicilio con cargo de visita y aun
 * no se diagnostico: el cliente paga la visita antes de que se despache.
 */
export const requierePagoDeVisita = (contexto: ContextoTransicion): boolean =>
  contexto.orden.modalidad === MODALIDAD_SERVICIO.RUTA
  && contexto.orden.tipoGarantia === TIPO_GARANTIA.PARTICULAR
  && contexto.orden.cargoVisita > 0
  && !contexto.tieneDiagnostico;

export const esVisitaParticularConPagoPrevio = requisito(
  'es una visita particular a domicilio con cargo de visita, antes del diagnostico',
  requierePagoDeVisita,
  () => 'Solo una visita particular a domicilio con cargo de visita espera autorizacion antes de '
    + 'despacharse. Las demas ordenes llegan a «esperando autorizacion» desde la cotizacion.',
);

/**
 * Autorizar despues de cotizar exige que el cliente haya aceptado la
 * cotizacion. Si ya hay diagnostico de una reparacion particular, tiene que
 * haber cotizacion aceptada; sin diagnostico (visita previa) no aplica.
 */
export const cotizacionAceptadaSiCorresponde = requisito(
  'si hay cotizacion o diagnostico, el cliente acepto la cotizacion',
  (contexto) => (!contexto.tieneCotizacion && !contexto.tieneDiagnostico) || contexto.cotizacionAceptada,
  (contexto) => (contexto.tieneCotizacion
    ? 'El cliente todavia no acepta la cotizacion. Registre su decision antes de autorizar.'
    : 'La orden ya tiene diagnostico pero no tiene cotizacion. Registre la cotizacion y la '
      + 'aceptacion del cliente antes de autorizar.'),
);

/**
 * Para la visita particular con pago previo: alguien registro el pago en
 * la bitacora y OTRA persona autorizada lo confirmo despues. Se lee de
 * entradas de bitacora marcadas como tales al escribirlas; un comentario
 * comun que diga «pago» no cuenta.
 */
export const pagoDeVisitaConfirmado = requisito(
  'el pago de la visita fue registrado y confirmado por otra persona',
  (contexto) => !requierePagoDeVisita(contexto) || contexto.pagoVisita.confirmadoPorOtraPersona,
  (contexto) => (contexto.pagoVisita.registrado
    ? 'El pago de la visita esta registrado pero falta que otra persona autorizada lo confirme '
      + 'en la bitacora («Confirmo el pago»).'
    : 'Esta visita particular exige pago previo. Registre el pago en la bitacora y pida a otra '
      + 'persona autorizada que lo confirme.'),
);

/** Volver a despachar una orden autorizada antes del diagnostico. */
export const sinDiagnosticoTodavia = requisito(
  'la orden todavia no tiene diagnostico',
  (contexto) => !contexto.tieneDiagnostico,
  () => 'La orden ya tiene diagnostico: continua hacia la reparacion o el repuesto, no a una nueva asignacion.',
);
