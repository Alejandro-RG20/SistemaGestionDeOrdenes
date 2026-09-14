/**
 * Patron Estrategia: una estrategia por tipo de cobertura, evaluadas en
 * orden de prioridad. La primera que se cumple decide.
 *
 * El algoritmo del pliego, leido de arriba abajo:
 *   1. poliza extendida vigente            -> adicional
 *   2. tienda del grupo y dentro de plazo  -> proveedor
 *   3. en cualquier otro caso              -> particular
 *
 * Agregar un tipo de cobertura es agregar una estrategia aqui, no tocar un
 * condicional existente.
 */
import { TIPO_GARANTIA, type TipoGarantia } from '@servitotal/compartido';
import { siempre, y, type Especificacion } from './especificacion.js';
import type { ContextoCobertura } from './contexto-cobertura.js';
import {
  cumpleLaExigenciaDeTienda, dentroDelPlazoDeFabrica, esElCompradorRegistrado,
  tienePolizaExtendidaVigente,
} from './especificaciones-cobertura.js';

export interface EstrategiaCobertura {
  readonly tipo: TipoGarantia;
  /** Menor numero, se evalua antes. */
  readonly prioridad: number;
  readonly especificacion: Especificacion<ContextoCobertura>;
  /** Explicacion que lee el asistente del taller cuando esta estrategia decide. */
  readonly explicacion: (contexto: ContextoCobertura) => string;
}

const estrategiaAdicional: EstrategiaCobertura = {
  tipo: TIPO_GARANTIA.ADICIONAL,
  prioridad: 1,
  especificacion: y(esElCompradorRegistrado, tienePolizaExtendidaVigente),
  explicacion: () => 'El articulo tiene una poliza extendida vigente a nombre del cliente.',
};

const estrategiaProveedor: EstrategiaCobertura = {
  tipo: TIPO_GARANTIA.PROVEEDOR,
  prioridad: 2,
  especificacion: y(esElCompradorRegistrado, cumpleLaExigenciaDeTienda, dentroDelPlazoDeFabrica),
  explicacion: (contexto) =>
    `El articulo se compro en una tienda del grupo y esta dentro de los ${contexto.regla.mesesCobertura} ` +
    'meses de garantia del fabricante.',
};

const estrategiaParticular: EstrategiaCobertura = {
  tipo: TIPO_GARANTIA.PARTICULAR,
  prioridad: 99,
  especificacion: siempre('no se cumple ninguna cobertura anterior'),
  explicacion: (contexto) => explicarPorQueParticular(contexto),
};

/**
 * Las estrategias ya ordenadas. `particular` va al final y se cumple
 * siempre: ninguna evaluacion puede quedarse sin resultado.
 */
export const ESTRATEGIAS_COBERTURA: readonly EstrategiaCobertura[] =
  [estrategiaAdicional, estrategiaProveedor, estrategiaParticular]
    .sort((una, otra) => una.prioridad - otra.prioridad);

/** Motivo concreto por el que la reparacion la paga el cliente. */
function explicarPorQueParticular(contexto: ContextoCobertura): string {
  if (!esElCompradorRegistrado.seCumple(contexto)) {
    return 'El articulo esta registrado a nombre de otra persona. Ni la garantia del fabricante ' +
      'ni la poliza extendida se trasladan cuando el aparato cambia de dueno.';
  }
  if (contexto.articulo.fechaCompra === null) {
    return 'El articulo no tiene fecha de compra registrada, asi que no se puede sostener el ' +
      'reclamo ante el fabricante. Si el cliente presenta la factura, se puede reclasificar.';
  }
  if (!cumpleLaExigenciaDeTienda.seCumple(contexto)) {
    return 'El articulo no se compro en una tienda del grupo.';
  }
  return `Pasaron mas de ${contexto.regla.mesesCobertura} meses desde la compra: la garantia ` +
    'del fabricante ya vencio.';
}
