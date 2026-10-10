/**
 * Contratos del modulo de articulos.
 *
 * El articulo se reconoce por su numero de serie y acumula historial con
 * independencia de quien sea su dueno (RN-27).
 */
import type { TipoGarantia } from '../dominio/orden.js';

export interface CoberturaArticulo {
  readonly id: string;
  readonly tipo: TipoGarantia;
  readonly vigenteDesde: string;
  readonly vigenteHasta: string;
  readonly documentoRespaldo: string | null;
  readonly idClienteContratante: string | null;
  readonly activa: boolean;
  readonly vigenteHoy: boolean;
  /** Duracion en meses, si las fechas corresponden a meses exactos. */
  readonly meses: number | null;
}

export interface ResumenArticulo {
  readonly id: string;
  readonly numeroSerie: string | null;
  readonly sinSerieLegible: boolean;
  readonly modelo: string | null;
  readonly idMarca: string;
  readonly marca: string;
  readonly idCategoria: string;
  readonly categoria: string;
  readonly idTiendaOrigen: string;
  readonly tiendaOrigen: string;
  readonly tiendaPerteneceAlGrupo: boolean;
  readonly fechaCompra: string | null;
  readonly facturaReferencia: string | null;
  readonly idCliente: string;
  readonly cliente: string;
  readonly activo: boolean;
}

/** Una orden anterior del mismo articulo, sin costos internos. */
export interface OrdenDelHistorial {
  readonly id: string;
  readonly numero: number;
  readonly estado: string;
  readonly tipoGarantia: TipoGarantia;
  readonly fallaReportada: string;
  readonly fechaRecepcion: string;
  readonly fechaEntrega: string | null;
}

export interface FichaArticulo extends ResumenArticulo {
  readonly coberturas: readonly CoberturaArticulo[];
  readonly historial: readonly OrdenDelHistorial[];
}

export interface PeticionCrearArticulo {
  readonly idCliente: string;
  readonly idMarca: string;
  readonly idCategoria: string;
  readonly idTiendaOrigen: string;
  readonly modelo?: string | null;
  readonly numeroSerie?: string | null;
  readonly sinSerieLegible?: boolean;
  readonly fechaCompra?: string | null;
  readonly facturaReferencia?: string | null;
  /**
   * Garantia adicional que el cliente compro, si la compro. Se omite (o
   * null) cuando no la tiene: no hay que inventar fechas. El vencimiento lo
   * calcula el servidor con `ultimoDiaCubierto`.
   */
  readonly garantiaAdicional?: {
    readonly fechaContratacion: string;
    readonly meses: number;
    readonly documentoRespaldo?: string | null;
  } | null;
}

/** Cambios que no alteran la cobertura y no exigen jefatura. */
export interface PeticionActualizarArticulo {
  readonly modelo?: string | null;
  readonly numeroSerie?: string | null;
  readonly sinSerieLegible?: boolean;
  readonly facturaReferencia?: string | null;
}

/**
 * Cambios que SI alteran la cobertura. Exigen rol de jefatura, motivo
 * escrito y reevaluan las ordenes abiertas del articulo.
 */
export interface PeticionCambiarDatosSensibles {
  readonly fechaCompra?: string | null;
  readonly idTiendaOrigen?: string;
  readonly idMarca?: string;
  readonly motivo: string;
}

/**
 * Cambio de dueno. Tan sensible como los anteriores: ni la garantia del
 * fabricante ni la poliza extendida se trasladan al nuevo propietario.
 */
export interface PeticionTransferirArticulo {
  readonly idClienteNuevo: string;
  readonly motivo: string;
}

export interface PeticionRegistrarCobertura {
  readonly tipo: TipoGarantia;
  readonly vigenteDesde: string;
  /** Ultimo dia cubierto. Si se indican `meses`, lo calcula el servidor. */
  readonly vigenteHasta?: string;
  /** Duracion en meses; alternativa a `vigenteHasta`. */
  readonly meses?: number;
  readonly documentoRespaldo?: string | null;
  readonly idClienteContratante?: string | null;
}

export interface ResultadoCambioSensible {
  readonly articulo: ResumenArticulo;
  /**
   * Ordenes abiertas del articulo. Su garantia NO cambia por este cambio:
   * se les deja una nota en el historial y, si corresponde, quien tiene
   * permiso la reclasifica con motivo.
   */
  readonly ordenesAbiertas: readonly {
    readonly id: string;
    readonly numero: number;
    readonly tipoGarantia: TipoGarantia;
  }[];
}
