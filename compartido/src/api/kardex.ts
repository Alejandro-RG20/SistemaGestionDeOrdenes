/**
 * El kardex de un repuesto (pliego §28).
 *
 * Es el libro de un repuesto: cada movimiento que lo toco, en orden, con el
 * saldo que quedo despues de cada uno. La diferencia con el listado de
 * movimientos que ya existia es justamente el saldo: sin esa columna, para
 * responder «cuanto habia el 12 de marzo» hay que sumar a mano.
 */
export interface LineaKardex {
  readonly idMovimiento: string;
  readonly momento: string;
  readonly tipo: string;
  readonly bodegaOrigen: string | null;
  readonly bodegaDestino: string | null;
  /** Lo que entro a la bodega consultada. Cero si no entro nada. */
  readonly entrada: number;
  /** Lo que salio de la bodega consultada. Cero si no salio nada. */
  readonly salida: number;
  /** Saldo despues de este movimiento. */
  readonly saldo: number;
  readonly precioUnitario: number;
  readonly codigoOrden: string | null;
  readonly responsable: string | null;
  readonly justificacion: string | null;
}

export interface Kardex {
  readonly idRepuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  /** Nula cuando el kardex es del centro entero y no de una bodega. */
  readonly idBodega: string | null;
  readonly bodega: string | null;
  /** Saldo antes de la primera linea devuelta. Sostiene la paginacion. */
  readonly saldoInicial: number;
  /** Saldo despues de la ultima linea devuelta. */
  readonly saldoFinal: number;
  readonly lineas: readonly LineaKardex[];
}

export interface ConsultaKardex {
  readonly idRepuesto: string;
  readonly idBodega?: string | undefined;
  readonly desde?: string | undefined;
  readonly hasta?: string | undefined;
}

/** Una solicitud de repuesto con todo su recorrido (pliego §26). */
export interface SolicitudConRecorrido {
  readonly id: string;
  readonly idOrden: string;
  readonly codigoOrden: string | null;
  readonly numeroOrden: number;
  readonly idRepuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly via: string;
  readonly estado: string;
  readonly etiquetaEstado: string;
  readonly motivo: string | null;
  /** Hay existencia para esta solicitud. Es lo que destraba la orden. */
  readonly liberada: boolean;
  readonly fechaSolicitud: string;
  readonly fechaEstimada: string | null;
  readonly fechaIngreso: string | null;
  readonly tecnico: string | null;
  readonly solicitadaPor: string | null;
  readonly revisadaPor: string | null;
  readonly revisadaEn: string | null;
  readonly preparadaPor: string | null;
  readonly preparadaEn: string | null;
  readonly entregadaPor: string | null;
  readonly entregadaEn: string | null;
  readonly recibidaEn: string | null;
  /** Unidades del repuesto en bodega sin reservar, en este momento. */
  readonly disponible: number;
  /** Los pasos que esta solicitud admite desde donde esta y que quien consulta puede dar. */
  readonly pasosPosibles: readonly string[];
}

export interface PeticionPasoSolicitud {
  readonly hacia: string;
  readonly motivo?: string | null;
  readonly idBodegaOrigen?: string | null;
}
