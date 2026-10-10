/**
 * Calculo de una cotizacion: conceptos, ajustes y quien paga.
 *
 * Vive en el paquete compartido por la misma razon que el calculo de
 * vencimientos: el panel muestra la vista previa con ESTA funcion y el
 * servidor guarda lo que ESTA funcion devuelve. Dos aritmeticas darian dos
 * totales, y la diferencia la descubriria el cliente.
 *
 * Todo en centimos enteros por dentro: sumar 0.1 + 0.2 en coma flotante no
 * da 0.3, y un total de cotizacion no puede tener ese tipo de error.
 */
import { TIPO_GARANTIA, type TipoGarantia } from './orden.js';

/** Quien paga los conceptos de la orden. */
export type ResponsablePago = 'proveedor' | 'garantia_adicional' | 'cliente' | 'por_definir';

export function responsableDePago(tipoGarantia: TipoGarantia | string): ResponsablePago {
  switch (tipoGarantia) {
    case TIPO_GARANTIA.PROVEEDOR: return 'proveedor';
    case TIPO_GARANTIA.ADICIONAL: return 'garantia_adicional';
    case TIPO_GARANTIA.PARTICULAR: return 'cliente';
    default: return 'por_definir';
  }
}

export const NOMBRE_RESPONSABLE_PAGO: Readonly<Record<ResponsablePago, string>> = {
  proveedor: 'Proveedor (garantia)',
  garantia_adicional: 'Garantia adicional',
  cliente: 'Cliente',
  por_definir: 'Por definir (garantia por validar)',
};

/**
 * Ajuste de un concepto. Una exoneracion parcial es un descuento (por
 * porcentaje o por importe); la total deja el concepto en cero.
 */
export type AjusteConcepto =
  | { readonly tipo: 'ninguno' }
  | { readonly tipo: 'porcentaje'; readonly valor: number }
  | { readonly tipo: 'importe'; readonly valor: number }
  | { readonly tipo: 'exoneracion_total' };

export interface ConceptoCalculado {
  /** Importe antes del ajuste. */
  readonly original: number;
  readonly ajuste: AjusteConcepto;
  /** Lo que se descuenta o exonera. */
  readonly descuento: number;
  /** Importe despues del ajuste. */
  readonly final: number;
}

export interface LineaRepuestoCotizada {
  readonly idRepuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  /** Precio del inventario al cotizar; null si no tenia precio registrado. */
  readonly precioInventario: number | null;
  /** Precio que se cotiza; distinto del de inventario solo con ajuste justificado. */
  readonly precioUnitario: number | null;
  readonly subtotal: number | null;
  /** Por que se cotizo un precio distinto del inventario. */
  readonly motivoPrecio: string | null;
}

export interface DetalleCotizacion {
  readonly manoObra: ConceptoCalculado;
  readonly visita: ConceptoCalculado;
  readonly repuestos: ConceptoCalculado & { readonly lineas: readonly LineaRepuestoCotizada[] };
  readonly totalOriginal: number;
  readonly totalFinal: number;
  readonly responsablePago: ResponsablePago;
  /** Lo que paga el cliente: el total final si es particular; 0 si lo cubre una garantia. */
  readonly pagaCliente: number;
  /** Codigos de repuestos sin precio: con alguno, la cotizacion no es valida. */
  readonly preciosPendientes: readonly string[];
}

const SIN_AJUSTE: AjusteConcepto = { tipo: 'ninguno' };

const aCentimos = (importe: number): number => Math.round(importe * 100);
const aImporte = (centimos: number): number => centimos / 100;

/** Un ajuste que no tiene sentido no se aplica a medias: se rechaza con el motivo. */
export class ErrorDeCotizacion extends Error {
  constructor(readonly campo: string, mensaje: string) {
    super(mensaje);
  }
}

function esImporteValido(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 0 && Math.abs(aCentimos(valor) - valor * 100) < 1e-6;
}

export function calcularConcepto(campo: string, original: number, ajuste: AjusteConcepto = SIN_AJUSTE): ConceptoCalculado {
  if (!esImporteValido(original)) {
    throw new ErrorDeCotizacion(campo, 'El importe debe ser cero o positivo, con dos decimales como maximo.');
  }
  const base = aCentimos(original);
  let descuento = 0;
  switch (ajuste.tipo) {
    case 'ninguno':
      break;
    case 'exoneracion_total':
      descuento = base;
      break;
    case 'porcentaje':
      if (!Number.isFinite(ajuste.valor) || ajuste.valor <= 0 || ajuste.valor > 100) {
        throw new ErrorDeCotizacion(campo, 'El descuento porcentual debe ser mayor que 0 y no superar el 100 %.');
      }
      descuento = Math.round((base * ajuste.valor) / 100);
      break;
    case 'importe':
      if (!esImporteValido(ajuste.valor) || ajuste.valor <= 0) {
        throw new ErrorDeCotizacion(campo, 'El descuento por importe debe ser positivo, con dos decimales como maximo.');
      }
      descuento = aCentimos(ajuste.valor);
      if (descuento > base) {
        throw new ErrorDeCotizacion(campo, 'El descuento no puede superar el importe del concepto.');
      }
      break;
  }
  return { original: aImporte(base), ajuste, descuento: aImporte(descuento), final: aImporte(base - descuento) };
}

export interface EntradaCotizacion {
  readonly tipoGarantia: TipoGarantia | string;
  readonly manoObra: number;
  readonly visita: number;
  readonly lineas: readonly Omit<LineaRepuestoCotizada, 'subtotal'>[];
  readonly ajustes?: {
    readonly manoObra?: AjusteConcepto;
    readonly visita?: AjusteConcepto;
    readonly repuestos?: AjusteConcepto;
  };
}

export function hayAjustes(entrada: Pick<EntradaCotizacion, 'ajustes' | 'lineas'>): boolean {
  const ajustes = entrada.ajustes ?? {};
  return [ajustes.manoObra, ajustes.visita, ajustes.repuestos].some((a) => a !== undefined && a.tipo !== 'ninguno')
    || entrada.lineas.some((l) => l.precioUnitario !== l.precioInventario);
}

export function calcularCotizacion(entrada: EntradaCotizacion): DetalleCotizacion {
  const lineas: LineaRepuestoCotizada[] = entrada.lineas.map((linea) => {
    if (!Number.isInteger(linea.cantidad) || linea.cantidad <= 0) {
      throw new ErrorDeCotizacion('repuestos', `La cantidad de ${linea.codigo} debe ser un entero positivo.`);
    }
    if (linea.precioUnitario !== null && !esImporteValido(linea.precioUnitario)) {
      throw new ErrorDeCotizacion('repuestos', `El precio de ${linea.codigo} debe ser cero o positivo.`);
    }
    return {
      ...linea,
      subtotal: linea.precioUnitario === null ? null : aImporte(aCentimos(linea.precioUnitario) * linea.cantidad),
    };
  });
  const preciosPendientes = lineas.filter((l) => l.precioUnitario === null).map((l) => l.codigo);
  const sumaRepuestos = aImporte(lineas.reduce((suma, l) => suma + (l.subtotal === null ? 0 : aCentimos(l.subtotal)), 0));

  const manoObra = calcularConcepto('manoObra', entrada.manoObra, entrada.ajustes?.manoObra);
  const visita = calcularConcepto('visita', entrada.visita, entrada.ajustes?.visita);
  const repuestos = { ...calcularConcepto('repuestos', sumaRepuestos, entrada.ajustes?.repuestos), lineas };

  const totalOriginal = aImporte(aCentimos(manoObra.original) + aCentimos(visita.original) + aCentimos(repuestos.original));
  const totalFinal = aImporte(aCentimos(manoObra.final) + aCentimos(visita.final) + aCentimos(repuestos.final));
  const responsablePago = responsableDePago(entrada.tipoGarantia);

  return {
    manoObra, visita, repuestos, totalOriginal, totalFinal, responsablePago,
    pagaCliente: responsablePago === 'cliente' ? totalFinal : 0,
    preciosPendientes,
  };
}
