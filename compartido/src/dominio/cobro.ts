/** Constantes de expedientes de cobro y de excepciones de sincronizacion. */

export const ESTADO_EXPEDIENTE = {
  EN_CONFORMACION: 'en_conformacion',
  BLOQUEADO_POR_EVIDENCIA: 'bloqueado_por_evidencia',
  LISTO_PARA_ENVIAR: 'listo_para_enviar',
  ENVIADO: 'enviado',
  ACEPTADO: 'aceptado',
  RECHAZADO: 'rechazado',
  PAGADO: 'pagado',
  /**
   * El proveedor no rechazo el reclamo: pidio algo. Una foto mas nitida, la
   * factura, el numero de serie legible.
   *
   * Existe porque sin el eso se anotaba como rechazado, y el indicador de
   * recuperacion contaba como perdido un expediente que solo esperaba un
   * documento. Tampoco se distinguia al proveedor que pide aclaraciones del
   * que se niega a pagar, y son dos conversaciones distintas.
   */
  OBSERVADO: 'observado',
  /**
   * El expediente termino y ya no se toca, se haya cobrado o no.
   *
   * Antes el unico final era 'pagado', asi que los rechazos definitivos se
   * quedaban en 'rechazado' para siempre, mezclados con los que todavia se
   * estaban rehaciendo.
   */
  CERRADO: 'cerrado',
} as const;
export type EstadoExpediente = (typeof ESTADO_EXPEDIENTE)[keyof typeof ESTADO_EXPEDIENTE];

/** `expediente_cobro.destinatario` es un CHECK de texto, no un enumerado. */
export const DESTINATARIO_EXPEDIENTE = { PROVEEDOR: 'proveedor', POLIZA: 'poliza' } as const;
export type DestinatarioExpediente =
  (typeof DESTINATARIO_EXPEDIENTE)[keyof typeof DESTINATARIO_EXPEDIENTE];

export const ESTADO_EXCEPCION = {
  PENDIENTE: 'pendiente',
  RESUELTA: 'resuelta',
  DESCARTADA: 'descartada',
} as const;
export type EstadoExcepcion = (typeof ESTADO_EXCEPCION)[keyof typeof ESTADO_EXCEPCION];

/** `bitacora.accion` es un CHECK de texto, no un enumerado. */
export const ACCION_BITACORA = {
  CREAR: 'crear',
  MODIFICAR: 'modificar',
  DESACTIVAR: 'desactivar',
  ANULAR: 'anular',
  FUSIONAR: 'fusionar',
} as const;
export type AccionBitacora = (typeof ACCION_BITACORA)[keyof typeof ACCION_BITACORA];
