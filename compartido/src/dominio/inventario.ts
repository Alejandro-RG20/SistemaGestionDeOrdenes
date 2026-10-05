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

/**
 * El permiso que exige cada tipo de movimiento.
 *
 * Existe porque la ruta no puede saberlo: `POST /movimientos` es una sola
 * puerta y el tipo viene en el cuerpo. Proteger esa puerta con
 * `inventario.consultar` —el permiso de LEER— dejaba que cualquiera que
 * pudiera mirar el inventario tambien lo moviera. Se comprobo: un usuario
 * de solo consulta ingreso 99 unidades a la bodega central.
 *
 * La comprobacion vive en el servicio, no en la ruta, porque el servicio es
 * el unico que ya conoce el tipo. Y vive aqui, en el dominio compartido,
 * para que el panel oculte los formularios por la misma tabla que el
 * servidor usa para rechazarlos.
 */
export const PERMISO_DEL_MOVIMIENTO = {
  [TIPO_MOVIMIENTO.INGRESO]: 'inventario.ingreso.registrar',
  [TIPO_MOVIMIENTO.DESPACHO_A_MOVIL]: 'inventario.despacho.registrar',
  [TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL]: 'inventario.devolucion.registrar',
  [TIPO_MOVIMIENTO.CONSUMO]: 'inventario.consumo.registrar',
  [TIPO_MOVIMIENTO.DEVOLUCION_PIEZA_SUSTITUIDA]: 'inventario.devolucion.registrar',
  [TIPO_MOVIMIENTO.AJUSTE]: 'inventario.ajuste.registrar',
} as const satisfies Record<TipoMovimiento, string>;

/** Los tipos de movimiento que el usuario puede registrar con sus permisos. */
export function movimientosPermitidos(
  permisos: readonly string[],
): readonly TipoMovimiento[] {
  return (Object.keys(PERMISO_DEL_MOVIMIENTO) as TipoMovimiento[])
    .filter((tipo) => permisos.includes(PERMISO_DEL_MOVIMIENTO[tipo]));
}
