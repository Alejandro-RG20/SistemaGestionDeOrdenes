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
