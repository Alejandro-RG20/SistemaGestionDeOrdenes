/** Contratos del modulo de garantias: reglas de referencia, consulta y decision manual. */
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

/**
 * Estado informativo de las garantias de un articulo para un solicitante.
 *
 * No dice quien paga: eso lo elige una persona al registrar la orden. Las
 * advertencias (vencida, sin datos, a nombre de otro) se muestran antes de
 * elegir y quedan anotadas con la decision, pero no la sustituyen.
 */
export interface ConsultaGarantias {
  readonly garantias: ResumenGarantiasArticulo;
  readonly advertencias: readonly string[];
  /** Regla de referencia de la que sale la duracion de la garantia del proveedor, si hay. */
  readonly idReglaReferencia: string | null;
}

export type VigenciaGarantia = 'vigente' | 'vencida' | 'por_iniciar' | 'no_registrada';

export interface EstadoGarantiaArticulo {
  readonly vigencia: VigenciaGarantia;
  /** Compra (proveedor) o contratacion (adicional). */
  readonly desde: string | null;
  /** Duracion en meses, si las fechas son meses exactos. */
  readonly meses: number | null;
  /** Ultimo dia cubierto. */
  readonly venceEl: string | null;
  readonly origen: 'registrada' | 'regla' | null;
  readonly aplicable: boolean;
  readonly motivo: string | null;
}

export interface ResumenGarantiasArticulo {
  readonly proveedor: EstadoGarantiaArticulo;
  readonly adicional: EstadoGarantiaArticulo;
}

export interface PeticionEvaluarCobertura {
  readonly idArticulo: string;
  /**
   * Quien pide el servicio. Si se omite se toma el dueno registrado del
   * articulo. Indicarlo distinto es lo que revela que el aparato cambio de
   * manos y que, por tanto, la garantia no aplica.
   */
  readonly idClienteSolicitante?: string;
}

/** Como se tomo una decision de garantia de una orden. */
export type OrigenDecisionGarantia =
  /** Elegida por quien registro la orden. */
  | 'registro'
  /** Cambiada despues, con permiso y motivo. */
  | 'reclasificacion'
  /** Orden levantada en campo: queda por validar hasta que se confirme. */
  | 'campo'
  /** Cambio automatico hecho por el motor de reglas antes de retirarlo. */
  | 'automatica_anterior'
  /** Orden anterior a este registro: solo se conoce su alta. */
  | 'sin_registro';

export interface DecisionGarantia {
  readonly tipoAnterior: TipoGarantia | null;
  readonly tipo: TipoGarantia;
  readonly origen: OrigenDecisionGarantia;
  readonly momento: string;
  readonly responsable: string | null;
  readonly motivo: string | null;
}

/** La decision vigente de una orden y como se llego a ella. */
export interface GarantiaDeOrden {
  readonly tipoActual: TipoGarantia;
  /** La ultima decision (la vigente). */
  readonly vigente: DecisionGarantia;
  /** Todas, de la mas antigua a la mas reciente. */
  readonly historial: readonly DecisionGarantia[];
  /** Estado informativo de las garantias del articulo, hoy. */
  readonly advertencias: readonly string[];
  readonly garantias: ResumenGarantiasArticulo | null;
  /** Si quien consulta puede reclasificarla ahora. */
  readonly puedeReclasificar: boolean;
  /** Si quien consulta puede confirmar ahora que la garantia no aplica. */
  readonly puedeConfirmarExclusion: boolean;
  /** Exclusion confirmada sobre esta orden, si la hubo. */
  readonly exclusion: { readonly motivo: string | null; readonly momento: string; readonly responsable: string | null } | null;
  /** Orden de origen o continuacion. */
  readonly relacionadas: readonly OrdenRelacionada[];
}

/**
 * Confirmar que la garantia no aplica: la orden se cierra sin reparar y,
 * si se pide, se abre una orden particular vinculada.
 */
export interface PeticionConfirmarExclusion {
  /** Por que no aplica la garantia. Obligatorio; queda en la bitacora. */
  readonly motivo: string;
  /** Abrir la orden particular que continua el servicio (por defecto, si). */
  readonly crearOrdenParticular?: boolean;
  /** Modalidad de la orden nueva; por defecto, la de la original. */
  readonly modalidad?: 'ruta' | 'taller';
}

export interface ResultadoExclusion {
  readonly idOrdenCerrada: string;
  readonly codigoOrdenCerrada: string;
  readonly idOrdenNueva: string | null;
  readonly codigoOrdenNueva: string | null;
}

/** Orden vinculada por una exclusion de garantia. */
export interface OrdenRelacionada {
  /** `origen`: la orden de garantia que esta continua. `continuacion`: la particular que continua a esta. */
  readonly relacion: 'origen' | 'continuacion';
  readonly id: string;
  readonly codigo: string;
  readonly estado: string;
  readonly tipoGarantia: TipoGarantia;
  readonly motivo: string | null;
  readonly momento: string;
}

export interface PeticionReclasificarGarantia {
  readonly tipo: 'proveedor' | 'adicional' | 'particular';
  /** Obligatorio: queda en la bitacora junto a la clasificacion anterior y la nueva. */
  readonly motivo: string;
}
