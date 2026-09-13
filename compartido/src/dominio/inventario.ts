/** Constantes de inventario. Espejo de los enumerados de la migracion 0002. */

export const TIPO_BODEGA = { CENTRAL: 'central', MOVIL: 'movil' } as const;
export type TipoBodega = (typeof TIPO_BODEGA)[keyof typeof TIPO_BODEGA];

export const TIPO_MOVIMIENTO = {
  INGRESO: 'ingreso',
  DESPACHO_A_MOVIL: 'despacho_a_movil',
  DEVOLUCION_A_CENTRAL: 'devolucion_a_central',
  CONSUMO: 'consumo',
  DEVOLUCION_PIEZA_SUSTITUIDA: 'devolucion_pieza_sustituida',
  AJUSTE: 'ajuste',
} as const;
export type TipoMovimiento = (typeof TIPO_MOVIMIENTO)[keyof typeof TIPO_MOVIMIENTO];

/**
 * Signo con el que cada tipo de movimiento afecta a la bodega de origen y a
 * la de destino. Es la regla que permite reconstruir `existencia` desde
 * `movimiento_repuesto`: existencia = suma(entradas) - suma(salidas).
 */
export const MOVIMIENTO_AFECTA = {
  [TIPO_MOVIMIENTO.INGRESO]: { origen: 0, destino: +1 },
  [TIPO_MOVIMIENTO.DESPACHO_A_MOVIL]: { origen: -1, destino: +1 },
  [TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL]: { origen: -1, destino: +1 },
  [TIPO_MOVIMIENTO.CONSUMO]: { origen: -1, destino: 0 },
  [TIPO_MOVIMIENTO.DEVOLUCION_PIEZA_SUSTITUIDA]: { origen: 0, destino: +1 },
  [TIPO_MOVIMIENTO.AJUSTE]: { origen: -1, destino: +1 },
} as const satisfies Record<TipoMovimiento, { origen: -1 | 0; destino: 0 | 1 }>;

export const VIA_ABASTECIMIENTO = {
  COMPRA_LOCAL: 'compra_local',
  PEDIDO_PROVEEDOR: 'pedido_proveedor',
} as const;
export type ViaAbastecimiento = (typeof VIA_ABASTECIMIENTO)[keyof typeof VIA_ABASTECIMIENTO];
