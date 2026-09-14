/** Contratos del modulo de ordenes. */
import type {
  EstadoOrden, ModalidadServicio, TipoGarantia,
} from '../dominio/orden.js';

export interface ResumenOrden {
  readonly id: string;
  readonly numero: number;
  readonly estado: EstadoOrden;
  readonly modalidad: ModalidadServicio;
  readonly tipoGarantia: TipoGarantia;
  readonly idCliente: string;
  readonly cliente: string;
  readonly idArticulo: string;
  readonly articulo: string;
  readonly idTecnico: string | null;
  readonly tecnico: string | null;
  readonly responsableActual: string | null;
  readonly fallaReportada: string;
  readonly fechaRecepcion: string;
  readonly fechaEstadoDesde: string;
  readonly plazoVenceEn: string | null;
  /** Horas laborables que faltan. Negativo si el plazo ya vencio. */
  readonly horasParaVencer: number | null;
  readonly vencida: boolean;
  readonly enAlerta: boolean;
  readonly total: number;
}

export interface EventoDeOrden {
  readonly id: string;
  readonly estadoAnterior: EstadoOrden | null;
  readonly estadoNuevo: EstadoOrden;
  readonly responsable: string | null;
  readonly momento: string;
  readonly momentoDispositivo: string | null;
  readonly registradoSinConexion: boolean;
  readonly observacion: string | null;
}

export interface NotaDeCorreccion {
  readonly id: string;
  readonly motivo: string;
  readonly detalle: string;
  readonly autor: string;
  readonly creadoEn: string;
}

export interface FichaOrden extends ResumenOrden {
  /** Datos congelados al crearse la orden. No cambian nunca (RN-22). */
  readonly telefonoContacto: string;
  readonly direccionServicio: string | null;
  readonly referenciaUbicacion: string | null;
  readonly idZona: string | null;
  readonly zona: string | null;
  readonly cargoVisita: number;
  readonly idReglaCobertura: string | null;
  readonly levantadaEnCampo: boolean;
  readonly motivoAnulacion: string | null;
  readonly fechaEntrega: string | null;
  readonly eventos: readonly EventoDeOrden[];
  readonly notas: readonly NotaDeCorreccion[];
  /** Estados a los que se puede mover desde el actual. */
  readonly destinosPosibles: readonly EstadoOrden[];
}

export interface PeticionCrearOrden {
  /** UUID generado por el dispositivo movil. El numero lo asigna el servidor. */
  readonly id?: string;
  readonly idCliente: string;
  readonly idArticulo: string;
  readonly modalidad: ModalidadServicio;
  readonly fallaReportada: string;
  /** Si se omiten, se copian de la ficha viva del cliente y quedan congelados. */
  readonly telefonoContacto?: string;
  readonly direccionServicio?: string | null;
  readonly referenciaUbicacion?: string | null;
  readonly idZona?: string | null;
  readonly levantadaEnCampo?: boolean;
}

export interface PeticionAsignarTecnico {
  readonly idTecnico: string;
}

export interface PeticionTransicion {
  readonly hacia: EstadoOrden;
  /** Obligatorio para anular. */
  readonly motivo?: string;
  readonly observacion?: string;
}

export interface PeticionNotaCorreccion {
  readonly motivo: string;
  readonly detalle: string;
}

export interface ResultadoTransicion {
  readonly orden: ResumenOrden;
  readonly estadoAnterior: EstadoOrden;
  readonly estadoNuevo: EstadoOrden;
  readonly plazoVenceEn: string | null;
}
