/** Contratos del modulo de garantias: reglas de cobertura y evaluacion. */
import type { TipoGarantia } from '../dominio/orden.js';

export interface ResumenReglaCobertura {
  readonly id: string;
  readonly idMarca: string | null;
  readonly marca: string | null;
  readonly idCategoria: string | null;
  readonly categoria: string | null;
  readonly mesesCobertura: number;
  readonly exigeTiendaGrupo: boolean;
  readonly fallasExcluidas: readonly string[];
  readonly version: number;
  readonly vigenteDesde: string;
  readonly vigenteHasta: string | null;
  readonly activa: boolean;
}

/**
 * Crear una regla no edita la anterior: la cierra y abre una version nueva.
 * Las ordenes ya abiertas conservan la version que congelaron (RF-86).
 */
export interface PeticionNuevaVersionRegla {
  readonly idMarca?: string | null;
  readonly idCategoria?: string | null;
  readonly mesesCobertura: number;
  readonly exigeTiendaGrupo: boolean;
  readonly fallasExcluidas: readonly string[];
  readonly motivo: string;
}

export interface CondicionEvaluada {
  readonly nombre: string;
  readonly seCumplio: boolean;
}

export interface EvaluacionCobertura {
  readonly tipo: TipoGarantia;
  readonly idReglaCobertura: string;
  readonly motivo: string;
  readonly detieneLaOrden: boolean;
  readonly desglose: readonly CondicionEvaluada[];
}

export interface PeticionEvaluarCobertura {
  readonly idArticulo: string;
  /**
   * Quien pide el servicio. Si se omite se toma el dueno registrado del
   * articulo. Indicarlo distinto es lo que revela que el aparato cambio de
   * manos y que, por tanto, la garantia no aplica.
   */
  readonly idClienteSolicitante?: string;
  /** Falla real del diagnostico, para la reevaluacion posterior. */
  readonly fallaReal?: string;
}
