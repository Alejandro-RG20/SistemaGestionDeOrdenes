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
  /**
   * Quien atiende el mostrador entrega el articulo (`ordenes.entregar`).
   * Sin esto, «finalizada» solo la movia el agente telefonico, que no tiene
   * ese permiso: ninguna orden podia entregarse por el acta.
   */
  readonly puedeEntregar: boolean;
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
  /** Solicitudes que no terminaron su recorrido (ni recibidas, ni rechazadas, ni anuladas). */
  readonly solicitudesAbiertas: number;
  /** Piezas entregadas para la orden sin uso ni devolucion registrados. */
  readonly piezasSinConciliar: number;
  /** Si ya se registro el acta de entrega. */
  readonly tieneEntrega: boolean;
  /** Motivo escrito, obligatorio para anular. */
  readonly motivo: string | null;
}
