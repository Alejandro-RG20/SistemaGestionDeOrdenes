/**
 * Contratos de campo: lo que el dispositivo se lleva para trabajar sin senal.
 *
 * El tecnico sale del taller con la tableta y puede no tener cobertura en
 * todo el dia. Por eso la descarga es UNA sola peticion y no siete: con
 * mala senal, cada viaje de ida y vuelta es una oportunidad de quedarse a
 * medias. Lo que baja aqui es exactamente lo que necesita para trabajar y
 * nada mas.
 */
import type { EstadoOrden, ModalidadServicio, TipoGarantia } from '../dominio/orden.js';

export interface OrdenDeJornada {
  readonly id: string;
  readonly numero: number;
  readonly estado: EstadoOrden;
  readonly modalidad: ModalidadServicio;
  readonly tipoGarantia: TipoGarantia;
  readonly idCliente: string;
  readonly cliente: string;
  readonly idArticulo: string;
  readonly articulo: string;
  readonly fallaReportada: string;
  /** Congelados al crearse la orden (RN-22): son los del dia del servicio. */
  readonly telefonoContacto: string;
  readonly direccionServicio: string | null;
  readonly referenciaUbicacion: string | null;
  readonly zona: string | null;
  readonly plazoVenceEn: string | null;
}

export interface RepuestoDeJornada {
  readonly id: string;
  readonly codigo: string;
  readonly descripcion: string;
  /** Precio de catalogo al momento de la descarga. Es el que se firma. */
  readonly precio: number;
}

export interface ExistenciaDeJornada {
  readonly idRepuesto: string;
  readonly cantidad: number;
}

/**
 * Evidencia obligatoria segun el tipo de garantia y el momento del proceso.
 * Baja con la jornada para poder avisarle al tecnico que le falta una foto
 * ANTES de que se despida del cliente y se suba a la moto.
 */
export interface ReglaEvidenciaDeJornada {
  readonly clave: string;
  readonly etiqueta: string;
  readonly tipo: TipoGarantia;
  readonly momento: string;
  readonly tipoArchivo: string;
  readonly bloqueaAvance: boolean;
}

export interface BodegaDeJornada {
  readonly id: string;
  readonly nombre: string;
}

export interface JornadaDelDispositivo {
  readonly descargadaEn: string;
  readonly idTecnico: string | null;
  readonly tecnico: string | null;
  /** Bodega movil del tecnico. Sin ella no puede consumir repuestos en campo. */
  readonly bodega: BodegaDeJornada | null;
  readonly ordenes: readonly OrdenDeJornada[];
  readonly repuestos: readonly RepuestoDeJornada[];
  readonly existencias: readonly ExistenciaDeJornada[];
  readonly reglasEvidencia: readonly ReglaEvidenciaDeJornada[];
}
