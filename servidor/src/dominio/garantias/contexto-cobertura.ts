/**
 * Lo que el motor de garantias necesita para decidir.
 *
 * Todo lo que entra aqui viene del ARTICULO y de la REGLA vigente: tienda
 * de origen, fecha de compra, marca, poliza. Los datos de contacto del
 * cliente —telefono, correo, direccion— no aparecen por ninguna parte, y es
 * deliberado: la cobertura no depende de ellos.
 *
 * El unico dato de cliente que interviene es su IDENTIDAD, para comprobar
 * que quien pide el servicio es quien compro el articulo. Ni la cobertura
 * de proveedor ni la poliza extendida se trasladan al revenderse: las
 * tiendas del grupo venden a cliente final y la garantia es de esa persona.
 */
import type { TipoGarantia } from '@servitotal/compartido';

export interface ArticuloParaCobertura {
  readonly id: string;
  /** Cliente a cuyo nombre esta registrado el articulo: el comprador. */
  readonly idCliente: string;
  readonly idMarca: string;
  readonly idCategoria: string;
  readonly idTiendaOrigen: string;
  readonly tiendaPerteneceAlGrupo: boolean;
  readonly fechaCompra: Date | null;
}

export interface PolizaParaCobertura {
  readonly id: string;
  readonly tipo: TipoGarantia;
  readonly vigenteDesde: Date;
  readonly vigenteHasta: Date;
  /** RN-28: la poliza es de quien la contrato, no del aparato. */
  readonly idClienteContratante: string | null;
  readonly activa: boolean;
}

export interface ReglaCoberturaVigente {
  readonly id: string;
  readonly idMarca: string | null;
  readonly idCategoria: string | null;
  readonly mesesCobertura: number;
  readonly exigeTiendaGrupo: boolean;
  readonly fallasExcluidas: readonly string[];
  readonly version: number;
}

export interface ContextoCobertura {
  readonly articulo: ArticuloParaCobertura;
  readonly polizas: readonly PolizaParaCobertura[];
  readonly regla: ReglaCoberturaVigente;
  /** Quien pide el servicio. Puede no ser el comprador si el aparato cambio de manos. */
  readonly idClienteSolicitante: string;
  readonly momento: Date;
  /** Falla real del diagnostico. Ausente en la evaluacion inicial. */
  readonly fallaReal?: string | undefined;
}

/** Meses completos transcurridos entre dos fechas. */
export function mesesTranscurridos(desde: Date, hasta: Date): number {
  const meses = (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12
    + (hasta.getUTCMonth() - desde.getUTCMonth());
  // Si aun no se cumplio el dia del mes, el mes no esta completo.
  return hasta.getUTCDate() >= desde.getUTCDate() ? meses : meses - 1;
}

/**
 * Normaliza para comparar la falla real contra las fallas excluidas de la
 * regla, que se escriben como `sobrecarga_electrica` mientras el tecnico
 * escribe "Sobrecarga electrica en la tarjeta".
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\s]+/g, ' ')
    .trim();
}
