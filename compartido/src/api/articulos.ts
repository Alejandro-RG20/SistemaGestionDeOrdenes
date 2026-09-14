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
  readonly vigenteHasta: string;
  readonly documentoRespaldo?: string | null;
  readonly idClienteContratante?: string | null;
}

export interface ResultadoCambioSensible {
  readonly articulo: ResumenArticulo;
  /** Ordenes abiertas cuya cobertura se recalculo por este cambio. */
  readonly ordenesReevaluadas: readonly {
    readonly id: string;
    readonly numero: number;
    readonly tipoAnterior: TipoGarantia;
    readonly tipoNuevo: TipoGarantia;
    readonly detenida: boolean;
  }[];
}
