/**
 * Como se le cuenta a un cliente en que va su articulo.
 *
 * Los nombres internos de los estados son del taller, no del cliente.
 * "en_cola_taller" no le dice nada a quien dejo su refrigeradora y quiere
 * saber si ya la vieron; y "esperando_autorizacion" suena a tramite cuando
 * en realidad significa que estan esperando que EL conteste.
 *
 * Trece estados internos se cuentan como cinco etapas, que es como la gente
 * entiende un servicio: lo recibimos, lo revisamos, esperamos algo,
 * lo reparamos, esta listo.
 */
import { ESTADO_ORDEN, type EstadoOrden } from '@servitotal/compartido';

export interface EtapaPublica {
  readonly clave: string;
  readonly etiqueta: string;
}

export const ETAPAS_PUBLICAS: readonly EtapaPublica[] = [
  { clave: 'recibido', etiqueta: 'Recibido' },
  { clave: 'revision', etiqueta: 'En revision' },
  { clave: 'espera', etiqueta: 'En espera' },
  { clave: 'reparacion', etiqueta: 'En reparacion' },
  { clave: 'listo', etiqueta: 'Listo' },
];

const ETAPA_DE_ESTADO: Readonly<Record<EstadoOrden, string>> = {
  [ESTADO_ORDEN.REGISTRADA]: 'recibido',
  [ESTADO_ORDEN.ASIGNADA]: 'recibido',
  [ESTADO_ORDEN.EN_RUTA]: 'revision',
  [ESTADO_ORDEN.EN_COLA_TALLER]: 'revision',
  [ESTADO_ORDEN.EN_DIAGNOSTICO]: 'revision',
  [ESTADO_ORDEN.COTIZADA]: 'espera',
  [ESTADO_ORDEN.ESPERANDO_AUTORIZACION]: 'espera',
  [ESTADO_ORDEN.ESPERANDO_REPUESTO]: 'espera',
  [ESTADO_ORDEN.EN_REPARACION]: 'reparacion',
  [ESTADO_ORDEN.FINALIZADA]: 'listo',
  [ESTADO_ORDEN.ENTREGADA]: 'listo',
  [ESTADO_ORDEN.CERRADA_SIN_REPARAR]: 'listo',
  [ESTADO_ORDEN.ANULADA]: 'listo',
};

export function etapaDe(estado: EstadoOrden): string {
  return ETAPA_DE_ESTADO[estado] ?? 'recibido';
}

/**
 * Lo que el cliente lee. Dos frases: en que va, y que sigue.
 *
 * Ninguna menciona el diagnostico ni el monto: eso se conversa por
 * telefono, con el cliente identificado, no en una pagina que responde a
 * un numero de orden y un telefono.
 */
export function situacionDe(estado: EstadoOrden): { situacion: string; explicacion: string } {
  switch (estado) {
    case ESTADO_ORDEN.REGISTRADA:
      return {
        situacion: 'Recibimos su solicitud',
        explicacion: 'Su orden esta registrada y en breve se le asigna un tecnico.',
      };
    case ESTADO_ORDEN.ASIGNADA:
      return {
        situacion: 'Tecnico asignado',
        explicacion: 'Ya hay un tecnico a cargo de su articulo.',
      };
    case ESTADO_ORDEN.EN_RUTA:
      return {
        situacion: 'El tecnico va en camino',
        explicacion: 'Su visita esta programada. Procure que haya alguien en el domicilio.',
      };
    case ESTADO_ORDEN.EN_COLA_TALLER:
      return {
        situacion: 'Su articulo esta en el taller',
        explicacion: 'Esta en la fila para revision. Le avisamos apenas lo diagnostiquen.',
      };
    case ESTADO_ORDEN.EN_DIAGNOSTICO:
      return {
        situacion: 'Lo estamos revisando',
        explicacion: 'Un tecnico esta determinando la falla.',
      };
    case ESTADO_ORDEN.COTIZADA:
      return {
        situacion: 'Tenemos el presupuesto listo',
        explicacion: 'Nos comunicaremos con usted para revisarlo.',
      };
    case ESTADO_ORDEN.ESPERANDO_AUTORIZACION:
      // Aqui el que tiene la pelota es el cliente, y hay que decirselo.
      return {
        situacion: 'Esperamos su respuesta',
        explicacion: 'Necesitamos que nos autorice la reparacion para continuar. ' +
          'Si ya respondio, disculpe la demora en actualizarlo.',
      };
    case ESTADO_ORDEN.ESPERANDO_REPUESTO:
      return {
        situacion: 'Esperando el repuesto',
        explicacion: 'La pieza esta pedida. En cuanto llegue se retoma la reparacion.',
      };
    case ESTADO_ORDEN.EN_REPARACION:
      return {
        situacion: 'En reparacion',
        explicacion: 'El tecnico esta trabajando en su articulo.',
      };
    case ESTADO_ORDEN.FINALIZADA:
      return {
        situacion: 'Listo para entrega',
        explicacion: 'La reparacion termino. Puede pasar a retirarlo o coordinar la entrega.',
      };
    case ESTADO_ORDEN.ENTREGADA:
      return {
        situacion: 'Entregado',
        explicacion: 'Su articulo ya fue entregado. Gracias por confiar en nosotros.',
      };
    case ESTADO_ORDEN.CERRADA_SIN_REPARAR:
      return {
        situacion: 'Cerrada sin reparar',
        explicacion: 'La orden se cerro sin reparacion. Si tiene dudas, comuniquese con el centro.',
      };
    default:
      return {
        situacion: 'Orden anulada',
        explicacion: 'Esta orden fue anulada. Si no lo solicito usted, comuniquese con el centro.',
      };
  }
}
