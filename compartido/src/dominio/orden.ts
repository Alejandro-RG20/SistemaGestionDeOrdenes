/**
 * Constantes del ciclo de vida de la orden de servicio.
 * Espejo exacto de los tipos enumerados de PostgreSQL (migracion 0002).
 * Regla de codigo: sin cadenas magicas; nadie escribe 'en_ruta' a mano.
 */

export const ESTADO_ORDEN = {
  REGISTRADA: 'registrada',
  ASIGNADA: 'asignada',
  EN_RUTA: 'en_ruta',
  EN_COLA_TALLER: 'en_cola_taller',
  EN_DIAGNOSTICO: 'en_diagnostico',
  COTIZADA: 'cotizada',
  ESPERANDO_AUTORIZACION: 'esperando_autorizacion',
  ESPERANDO_REPUESTO: 'esperando_repuesto',
  EN_REPARACION: 'en_reparacion',
  FINALIZADA: 'finalizada',
  ENTREGADA: 'entregada',
  CERRADA_SIN_REPARAR: 'cerrada_sin_reparar',
  ANULADA: 'anulada',
} as const;

export type EstadoOrden = (typeof ESTADO_ORDEN)[keyof typeof ESTADO_ORDEN];

/** Estados finales: nadie los modifica (seccion 5 del pliego). */
export const ESTADOS_FINALES: readonly EstadoOrden[] = [
  ESTADO_ORDEN.ENTREGADA,
  ESTADO_ORDEN.CERRADA_SIN_REPARAR,
  ESTADO_ORDEN.ANULADA,
];

export const ESTADOS_ORDEN: readonly EstadoOrden[] = Object.values(ESTADO_ORDEN);

/** Estados en los que la orden sigue viva y consume plazo. */
export const ESTADOS_ACTIVOS: readonly EstadoOrden[] = ESTADOS_ORDEN.filter(
  (estado) => !ESTADOS_FINALES.includes(estado),
);

export function esEstadoFinal(estado: EstadoOrden): boolean {
  return ESTADOS_FINALES.includes(estado);
}

export const MODALIDAD_SERVICIO = { RUTA: 'ruta', TALLER: 'taller' } as const;
export type ModalidadServicio = (typeof MODALIDAD_SERVICIO)[keyof typeof MODALIDAD_SERVICIO];

export const TIPO_GARANTIA = {
  PROVEEDOR: 'proveedor',
  ADICIONAL: 'adicional',
  PARTICULAR: 'particular',
  POR_VALIDAR: 'por_validar',
} as const;
export type TipoGarantia = (typeof TIPO_GARANTIA)[keyof typeof TIPO_GARANTIA];

export const RESULTADO_VISITA = {
  PROGRAMADA: 'programada',
  RESUELTA_EN_SITIO: 'resuelta_en_sitio',
  REQUIERE_TRASLADO_TALLER: 'requiere_traslado_taller',
  CLIENTE_AUSENTE: 'cliente_ausente',
  NO_AUTORIZADA: 'no_autorizada',
} as const;
export type ResultadoVisita = (typeof RESULTADO_VISITA)[keyof typeof RESULTADO_VISITA];
