/**
 * Contratos del modulo de cobros.
 *
 * Un expediente es la carpeta con la que el taller le cobra a un tercero
 * una reparacion que el cliente no pago. El pliego pone una sola condicion
 * innegociable para que salga: que a la orden no le falte evidencia
 * obligatoria (RF-57).
 */
import type { DestinatarioExpediente, EstadoExpediente } from '../dominio/cobro.js';
import type { ModalidadServicio, TipoGarantia } from '../dominio/orden.js';
import type { EstadoPago } from '../dominio/proceso-final.js';

export interface ResumenExpediente {
  readonly id: string;
  readonly idOrden: string;
  readonly numeroOrden: number;
  readonly destinatario: DestinatarioExpediente;
  readonly idMarca: string | null;
  readonly marca: string | null;
  readonly cliente: string;
  readonly articulo: string;
  readonly tipoGarantia: TipoGarantia;
  readonly montoReclamado: number;
  readonly montoCobrado: number | null;
  readonly estado: EstadoExpediente;
  readonly evidenciaCompleta: boolean;
  readonly fechaEnvio: string | null;
  readonly fechaResultado: string | null;
  readonly motivoRechazo: string | null;
  /** Dias desde el envio sin respuesta. Null si todavia no salio. */
  readonly diasSinRespuesta: number | null;
  readonly creadoEn: string;
}

/** Evidencia obligatoria que le falta a la orden, y por eso frena el envio. */
export interface EvidenciaPendiente {
  readonly clave: string;
  readonly etiqueta: string;
  readonly momento: string;
}

export interface RenglonDeReclamo {
  readonly idRepuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  /** Precio congelado del movimiento (RN-22), no el de hoy. */
  readonly precioUnitario: number;
  readonly importe: number;
}

export interface DesgloseExpediente {
  readonly totalRepuestos: number;
  readonly manoObra: number;
  readonly cargoVisita: number;
  readonly total: number;
  /** Avisos que el gestor debe leer antes de enviar. No bloquean. */
  readonly advertencias: readonly string[];
}

export interface FichaExpediente extends ResumenExpediente {
  readonly modalidad: ModalidadServicio;
  readonly fallaReportada: string;
  readonly fechaRecepcion: string;
  readonly fechaEntrega: string | null;
  readonly renglones: readonly RenglonDeReclamo[];
  readonly desglose: DesgloseExpediente;
  readonly evidenciaPendiente: readonly EvidenciaPendiente[];
  readonly estadosPosibles: readonly EstadoExpediente[];
}

export interface PeticionMoverExpediente {
  readonly hacia: EstadoExpediente;
  /** Obligatorio al rechazar. */
  readonly motivoRechazo?: string;
  /** Obligatorio al marcar pagado. */
  readonly montoCobrado?: number;
}

export interface ResumenPago {
  readonly id: string;
  readonly idOrden: string;
  readonly numeroOrden: number;
  readonly codigoOrden: string;
  readonly cliente: string;
  readonly monto: number;
  readonly formaPago: string;
  readonly referencia: string | null;
  /**
   * Registrado no es cobrado (RF-40).
   *
   * Solo lo CONFIRMADO habilita la entrega del articulo. Un deposito que
   * el cliente dice haber hecho se anota, pero el equipo no sale hasta que
   * alguien de cobros lo vea en la cuenta.
   */
  readonly estado: EstadoPago;
  readonly motivoAnulacion: string | null;
  readonly confirmadoPor: string | null;
  readonly registradoPor: string | null;
  readonly creadoEn: string;
}

export interface PeticionRegistrarPago {
  readonly monto: number;
  readonly formaPago: string;
  readonly referencia?: string | null;
  readonly idEvidencia?: string | null;
}

/** Recuperacion por marca: si al taller le conviene reclamarle a esa marca. */
export interface RecuperacionPorMarca {
  readonly idMarca: string | null;
  readonly marca: string;
  readonly expedientes: number;
  readonly reclamado: number;
  readonly cobrado: number;
  /** Porcentaje de lo reclamado que efectivamente entro. */
  readonly tasaRecuperacion: number;
  readonly rechazados: number;
  /** Dias promedio entre envio y respuesta. Null si ninguno respondio. */
  readonly diasPromedioRespuesta: number | null;
}

export interface IndicadoresDeCobro {
  readonly expedientes: number;
  readonly bloqueadosPorEvidencia: number;
  readonly enviadosSinRespuesta: number;
  readonly totalReclamado: number;
  readonly totalCobrado: number;
  readonly tasaRecuperacion: number;
  /** Lo reclamado que todavia no entro y no fue rechazado. */
  readonly expuesto: number;
  readonly porMarca: readonly RecuperacionPorMarca[];
}
