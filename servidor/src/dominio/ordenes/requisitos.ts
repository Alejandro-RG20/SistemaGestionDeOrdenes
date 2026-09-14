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
