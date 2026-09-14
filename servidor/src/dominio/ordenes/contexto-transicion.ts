/**
 * Lo que la maquina de estados necesita saber para dejar pasar —o no— una
 * transicion. Quien la llama arma esto; la maquina no consulta nada.
 */
import type { CodigoRol, EstadoOrden, ModalidadServicio, TipoGarantia } from '@servitotal/compartido';

export interface DatosOrdenParaTransicion {
  readonly id: string;
  readonly numero: number;
  readonly estado: EstadoOrden;
  readonly modalidad: ModalidadServicio;
  readonly tipoGarantia: TipoGarantia;
  readonly idTecnico: string | null;
  readonly idResponsableActual: string | null;
}

export interface ActorTransicion {
  readonly id: string;
  readonly rol: CodigoRol;
  /** Ficha de tecnico del actor, si la tiene. */
  readonly idTecnico: string | null;
  /** Permisos que lo habilitan a pasar por encima del responsable de turno. */
  readonly puedeAnular: boolean;
  readonly puedeCerrar: boolean;
}

export interface EvidenciaFaltante {
  readonly clave: string;
  readonly etiqueta: string;
}

export interface ContextoTransicion {
  readonly hacia: EstadoOrden;
  readonly orden: DatosOrdenParaTransicion;
  readonly actor: ActorTransicion;
  /**
   * Evidencia obligatoria que bloquea el avance y todavia no se cargo, ya
   * filtrada por el momento que corresponde al estado de origen.
   */
  readonly evidenciasFaltantes: readonly EvidenciaFaltante[];
  readonly tieneVisitaVigente: boolean;
  readonly tieneDiagnostico: boolean;
  readonly tieneCotizacion: boolean;
  readonly cotizacionAceptada: boolean;
  /** Solicitudes de repuesto todavia sin liberar. */
  readonly solicitudesSinLiberar: number;
  /** Motivo escrito, obligatorio para anular. */
  readonly motivo: string | null;
}
