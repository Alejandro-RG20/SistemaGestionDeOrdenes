/**
 * El vocabulario del tramo final del proceso: validacion tecnica, entrega y
 * el estado del pago.
 *
 * Son las tres cosas que estaban implicitas en el estado de la orden y que
 * el pliego pide explicitas. La diferencia practica: «entregada» decia que
 * alguien movio la orden; `entrega` dice a quien se le puso el equipo en
 * las manos y quien se lo dio.
 */

export const RESULTADO_VALIDACION = {
  APROBADA: 'aprobada',
  /** No sirve y no se arregla retocandolo: se rehace. */
  RECHAZADA: 'rechazada',
  /** Esta casi: falta una foto, falta ampliar el diagnostico. */
  REQUIERE_CORRECCION: 'requiere_correccion',
} as const;
export type ResultadoValidacion =
  (typeof RESULTADO_VALIDACION)[keyof typeof RESULTADO_VALIDACION];

/** Las que dejan pasar la orden al cierre. */
export const VALIDACIONES_QUE_APRUEBAN: readonly ResultadoValidacion[] = [
  RESULTADO_VALIDACION.APROBADA,
];

export const ESTADO_PAGO = {
  /** Anotado en el mostrador. Todavia no es dinero en la cuenta. */
  REGISTRADO: 'registrado',
  CONFIRMADO: 'confirmado',
  ANULADO: 'anulado',
} as const;
export type EstadoPago = (typeof ESTADO_PAGO)[keyof typeof ESTADO_PAGO];

/**
 * Formas de pago del pliego (RF-40).
 *
 * El efectivo se cuenta en la mano y queda confirmado ahi mismo; el resto
 * nace registrado y alguien de cobros confirma que entro. Esa distincion
 * no es contable, es operativa: decide si el articulo puede salir.
 */
export const FORMA_PAGO = {
  EFECTIVO: 'efectivo',
  TARJETA: 'tarjeta',
  TRANSFERENCIA: 'transferencia',
  DEPOSITO: 'deposito',
  OTRO: 'otro',
} as const;
export type FormaPago = (typeof FORMA_PAGO)[keyof typeof FORMA_PAGO];

/** Las que se dan por cobradas al registrarlas. */
export const FORMAS_COBRADAS_AL_INSTANTE: readonly FormaPago[] = [
  FORMA_PAGO.EFECTIVO, FORMA_PAGO.TARJETA,
];

export const ESTADO_COMPRA = {
  /** Se esta armando. No ha salido del centro. */
  BORRADOR: 'borrador',
  ENVIADA: 'enviada',
  /** El proveedor la acepto y dio fecha. */
  CONFIRMADA: 'confirmada',
  RECIBIDA_PARCIAL: 'recibida_parcial',
  RECIBIDA: 'recibida',
  CANCELADA: 'cancelada',
} as const;
export type EstadoCompra = (typeof ESTADO_COMPRA)[keyof typeof ESTADO_COMPRA];

/**
 * A donde puede moverse una compra desde donde esta.
 *
 * Es la misma idea que la maquina de estados de la orden y existe por la
 * misma razon: que nadie marque «recibida» una compra que jamas se envio.
 * Recibir NO se pide aqui —recibir es contar piezas, y de eso se encarga
 * el servicio, que ademas mueve inventario y decide solo si quedo parcial
 * o completa—.
 */
export const TRANSICIONES_COMPRA: Readonly<Record<EstadoCompra, readonly EstadoCompra[]>> = {
  [ESTADO_COMPRA.BORRADOR]: [ESTADO_COMPRA.ENVIADA, ESTADO_COMPRA.CANCELADA],
  [ESTADO_COMPRA.ENVIADA]: [ESTADO_COMPRA.CONFIRMADA, ESTADO_COMPRA.CANCELADA],
  [ESTADO_COMPRA.CONFIRMADA]: [ESTADO_COMPRA.CANCELADA],
  // Una compra a medias puede cancelarse por lo que falta; lo ya recibido
  // no se devuelve solo porque se cancele el resto.
  [ESTADO_COMPRA.RECIBIDA_PARCIAL]: [ESTADO_COMPRA.CANCELADA],
  [ESTADO_COMPRA.RECIBIDA]: [],
  [ESTADO_COMPRA.CANCELADA]: [],
};

export function compraPuedeMoverseA(desde: EstadoCompra, hacia: EstadoCompra): boolean {
  return TRANSICIONES_COMPRA[desde].includes(hacia);
}

/** Solo lo enviado o confirmado admite que bodega cuente piezas contra el. */
export function compraAdmiteRecepcion(estado: EstadoCompra): boolean {
  return estado === ESTADO_COMPRA.ENVIADA
    || estado === ESTADO_COMPRA.CONFIRMADA
    || estado === ESTADO_COMPRA.RECIBIDA_PARCIAL;
}
