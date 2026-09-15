/**
 * Resolucion de conflictos de sincronizacion.
 *
 * EL CRITERIO QUE ORDENA TODO: ante la duda, prevalece lo que ocurrio
 * fisicamente en el domicilio del cliente. La discrepancia administrativa
 * se resuelve despues, en una bandeja, con una persona mirandola. Nunca al
 * reves: nunca se descarta trabajo de campo porque los papeles no cuadren.
 *
 * Codigo puro: no consulta la base ni conoce el HTTP.
 */

export const CLASE_CONFLICTO = {
  /** La orden fue anulada mientras el tecnico trabajaba en el domicilio. */
  ORDEN_ANULADA_EN_CAMPO: 'orden_anulada_en_campo',
  /** Se consumio un repuesto que no figuraba en la bodega movil. */
  REPUESTO_NO_FIGURABA: 'repuesto_no_figuraba',
  /** El precio cambio entre la descarga y el consumo. */
  PRECIO_CAMBIADO: 'precio_cambiado',
  /** La orden ya no admite ese paso, por cualquier otra razon. */
  ESTADO_INCOMPATIBLE: 'estado_incompatible',
  /** Cualquier otro rechazo. */
  OTRO: 'otro',
} as const;
export type ClaseConflicto = (typeof CLASE_CONFLICTO)[keyof typeof CLASE_CONFLICTO];

export const RESOLUCION = {
  /**
   * Se acepta lo que el tecnico hizo y se genera la compensacion que haga
   * falta para que los numeros cierren.
   */
  ACEPTAR_Y_COMPENSAR: 'aceptar_y_compensar',
  /**
   * No se puede aplicar, pero el trabajo NO se descarta: queda integro en
   * la bandeja de excepciones para que alguien lo concilie.
   */
  CONSERVAR_EN_EXCEPCION: 'conservar_en_excepcion',
} as const;
export type Resolucion = (typeof RESOLUCION)[keyof typeof RESOLUCION];

export interface Conflicto {
  readonly clase: ClaseConflicto;
  readonly resolucion: Resolucion;
  /** Lo que vera quien abra la bandeja de excepciones. */
  readonly motivo: string;
}

/**
 * Los tres casos del pliego, en su orden de prioridad, mas el cajon de
 * sastre. Cada uno dice que se hace y por que.
 */
const CATALOGO: Readonly<Record<ClaseConflicto, Omit<Conflicto, 'clase'>>> = {
  [CLASE_CONFLICTO.ORDEN_ANULADA_EN_CAMPO]: {
    resolucion: RESOLUCION.CONSERVAR_EN_EXCEPCION,
    motivo:
      'La orden fue anulada mientras el tecnico trabajaba en el domicilio. El trabajo registrado ' +
      'se conserva integro para conciliarlo; no se descarta nada de lo que se hizo en el campo.',
  },
  [CLASE_CONFLICTO.REPUESTO_NO_FIGURABA]: {
    resolucion: RESOLUCION.ACEPTAR_Y_COMPENSAR,
    motivo:
      'Se consumio un repuesto que no figuraba en la bodega movil. El consumo se acepta porque ' +
      'la pieza esta instalada en el aparato del cliente, y queda una diferencia de inventario ' +
      'por conciliar con el tecnico.',
  },
  [CLASE_CONFLICTO.PRECIO_CAMBIADO]: {
    resolucion: RESOLUCION.ACEPTAR_Y_COMPENSAR,
    motivo:
      'El precio del repuesto cambio entre la descarga y el consumo. Prevalece el precio que el ' +
      'cliente firmo; la diferencia contra el catalogo queda anotada.',
  },
  [CLASE_CONFLICTO.ESTADO_INCOMPATIBLE]: {
    resolucion: RESOLUCION.CONSERVAR_EN_EXCEPCION,
    motivo:
      'La orden ya no admite ese paso: cambio de estado mientras el dispositivo estaba sin ' +
      'conexion. Lo registrado en campo se conserva para conciliarlo.',
  },
  [CLASE_CONFLICTO.OTRO]: {
    resolucion: RESOLUCION.CONSERVAR_EN_EXCEPCION,
    motivo:
      'El servidor no pudo aplicar lo que llego del dispositivo. Se conserva integro para que ' +
      'alguien lo revise; nada de lo registrado en campo se descarta.',
  },
};

export function resolverConflicto(clase: ClaseConflicto): Conflicto {
  return { clase, ...CATALOGO[clase] };
}

/**
 * Deduce la clase de conflicto a partir del codigo de error con el que el
 * dominio rechazo la operacion.
 *
 * Es una tabla, no una cadena de `if`: cuando aparezca un codigo nuevo que
 * merezca trato propio, se agrega aqui y no en el motor de sincronizacion.
 */
const POR_CODIGO_DE_ERROR: Readonly<Record<string, ClaseConflicto>> = {
  ORDEN_CERRADA: CLASE_CONFLICTO.ORDEN_ANULADA_EN_CAMPO,
  TRANSICION_INVALIDA: CLASE_CONFLICTO.ESTADO_INCOMPATIBLE,
  NO_ES_RESPONSABLE: CLASE_CONFLICTO.ESTADO_INCOMPATIBLE,
  REQUISITO_INCUMPLIDO: CLASE_CONFLICTO.ESTADO_INCOMPATIBLE,
  EXISTENCIA_INSUFICIENTE: CLASE_CONFLICTO.REPUESTO_NO_FIGURABA,
};

export function clasificarPorCodigo(codigo: string): ClaseConflicto {
  return POR_CODIGO_DE_ERROR[codigo] ?? CLASE_CONFLICTO.OTRO;
}

/**
 * Precio que prevalece: el que el cliente firmo en el domicilio, no el que
 * el catalogo tenga hoy. Devuelve tambien si hubo diferencia, para poder
 * dejarla anotada sin interrumpir nada.
 */
export interface VeredictoPrecio {
  readonly precioQuePrevalece: number;
  readonly huboDiferencia: boolean;
  readonly diferencia: number;
}

export function resolverPrecio(
  precioFirmadoEnCampo: number | undefined,
  precioActualDelCatalogo: number,
): VeredictoPrecio {
  if (precioFirmadoEnCampo === undefined) {
    return { precioQuePrevalece: precioActualDelCatalogo, huboDiferencia: false, diferencia: 0 };
  }
  const diferencia = Number((precioFirmadoEnCampo - precioActualDelCatalogo).toFixed(2));
  return {
    precioQuePrevalece: precioFirmadoEnCampo,
    huboDiferencia: diferencia !== 0,
    diferencia,
  };
}
