/** Constantes de expedientes de cobro y de excepciones de sincronizacion. */

export const ESTADO_EXPEDIENTE = {
  EN_CONFORMACION: 'en_conformacion',
  BLOQUEADO_POR_EVIDENCIA: 'bloqueado_por_evidencia',
  LISTO_PARA_ENVIAR: 'listo_para_enviar',
  ENVIADO: 'enviado',
  ACEPTADO: 'aceptado',
  RECHAZADO: 'rechazado',
  PAGADO: 'pagado',
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
