/**
 * Constantes de la bitacora de auditoria y de las excepciones de
 * sincronizacion.
 *
 * Vivian en `cobro.ts` junto a las de los expedientes de cobro. Al retirar
 * el modulo de cobros (migracion 0023) se conservan aqui: no tienen nada
 * que ver con dinero y las usa todo el sistema.
 */

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
