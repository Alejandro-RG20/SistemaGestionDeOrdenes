/** Contratos del modulo de ordenes. */
import type {
  EstadoOrden, ModalidadServicio, TipoGarantia,
} from '../dominio/orden.js';
import type { AjusteConcepto, DetalleCotizacion, ResponsablePago } from '../dominio/cotizacion.js';

export interface ResumenOrden {
  readonly id: string;
  /**
   * El numero que ve la gente: `OS-2026-000001`. Es el que va en el
   * comprobante y el que el cliente dicta por telefono.
   */
  readonly codigo: string;
  /** La secuencia interna. Sirve para ordenar y para los filtros rapidos. */
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
  /** La sucursal desde la que entro la solicitud (no donde se compro). */
  readonly idTienda: string | null;
  readonly tienda: string | null;
  readonly cargoVisita: number;
  readonly idReglaCobertura: string | null;
  readonly levantadaEnCampo: boolean;
  readonly motivoAnulacion: string | null;
  readonly fechaEntrega: string | null;
  readonly eventos: readonly EventoDeOrden[];
  readonly notas: readonly NotaDeCorreccion[];
  /** Estados a los que se puede mover desde el actual. */
  readonly destinosPosibles: readonly EstadoOrden[];
  /**
   * Los mismos destinos, evaluados para quien consulta: si puede darlos
   * ahora y, si no, por que. Es la misma evaluacion que hace el servidor al
   * mover la orden.
   */
  readonly acciones: readonly AccionDeEstado[];
}

export interface AccionDeEstado {
  readonly hacia: EstadoOrden;
  readonly permitida: boolean;
  /** Por que no se puede, en palabras del taller. Null si se puede. */
  readonly motivo: string | null;
  /** Al pulsarla hay que escribir un motivo (anular). */
  readonly pideMotivo: boolean;
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
  /**
   * Sucursal desde la que entra la solicitud.
   *
   * El usuario de tienda no la manda: es la suya y el servidor la impone.
   * El agente telefonico SI, porque atiende a clientes de cualquier
   * sucursal y tiene que decir de cual habla (§8 del pliego).
   */
  readonly idTienda?: string | null;
  /**
   * Con que se atendera, elegido por quien registra tras ver el estado de
   * las garantias: garantia del proveedor, garantia adicional o servicio
   * particular. Obligatorio. Si la elegida esta vencida o le faltan datos,
   * el servidor la acepta igual y anota la advertencia con la decision.
   * Solo una orden levantada en campo puede omitirlo: entra "por validar".
   */
  readonly tipoGarantiaElegida?: 'proveedor' | 'adicional' | 'particular';
  /**
   * Solo para modalidad ruta: fecha y franja de la visita. Con tecnico, se
   * asigna y se programa al crear (quien despacha); sin tecnico, la fecha
   * solicitada queda anotada en la orden para programarla despues.
   */
  readonly visita?: {
    readonly fechaProgramada: string;
    readonly franjaHoraria: string;
    readonly idTecnico?: string | null;
  } | null;
}

export interface PeticionAsignarTecnico {
  readonly idTecnico: string;
  /** Obligatorio al reasignar una orden que ya tenia tecnico. */
  readonly motivo?: string;
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

/**
 * Un renglon del historial completo de una orden.
 *
 * El historial reune en orden cronologico todo lo que le paso a la orden,
 * venga de donde venga: cambios de estado, asignaciones, diagnosticos,
 * evidencias, solicitudes de repuesto y cada uno de sus pasos, movimientos
 * de inventario, visitas, la autorizacion del cliente, la revision tecnica,
 * la entrega y las notas de correccion. Ninguna de esas fuentes se edita ni
 * se borra (migracion 0023): el historial no se puede reescribir.
 */
export const TIPO_EVENTO_HISTORIAL = {
  ESTADO: 'estado',
  ASIGNACION: 'asignacion',
  CAMBIO: 'cambio',
  DIAGNOSTICO: 'diagnostico',
  EVIDENCIA: 'evidencia',
  SOLICITUD: 'solicitud',
  MOVIMIENTO: 'movimiento',
  VISITA: 'visita',
  AUTORIZACION: 'autorizacion',
  VALIDACION: 'validacion',
  ENTREGA: 'entrega',
  CORRECCION: 'correccion',
  /** Comentario de un usuario en la bitacora de la orden. */
  BITACORA: 'bitacora',
} as const;
export type TipoEventoHistorial = (typeof TIPO_EVENTO_HISTORIAL)[keyof typeof TIPO_EVENTO_HISTORIAL];

export interface EventoDeHistorial {
  readonly id: string;
  readonly momento: string;
  readonly tipo: TipoEventoHistorial;
  readonly titulo: string;
  readonly detalle: string | null;
  readonly responsable: string | null;
  readonly registradoSinConexion: boolean;
}

/**
 * Bitacora de la orden: comentarios generales. Los dos tipos de pago solo
 * sirven de constancia para autorizar una visita particular con pago
 * previo; ninguno cambia el estado de la orden.
 */
export const TIPO_ENTRADA_BITACORA = {
  COMENTARIO: 'comentario',
  PAGO_REGISTRADO: 'pago_registrado',
  PAGO_CONFIRMADO: 'pago_confirmado',
  CORRECCION: 'correccion',
} as const;
export type TipoEntradaBitacora = (typeof TIPO_ENTRADA_BITACORA)[keyof typeof TIPO_ENTRADA_BITACORA];

export interface PeticionRegistrarBitacora {
  readonly texto: string;
  /** Por omision, comentario. */
  readonly tipo?: TipoEntradaBitacora;
  /** Solo para `correccion`: la entrada que se corrige. */
  readonly idEntradaCorregida?: string;
}

export interface EntradaBitacora {
  readonly id: string;
  readonly idOrden: string;
  readonly tipo: TipoEntradaBitacora;
  readonly texto: string;
  /** Fecha y hora del servidor. */
  readonly momento: string;
  readonly idAutor: string;
  readonly autor: string;
  readonly idEntradaCorregida: string | null;
}

// ── diagnostico y cotizacion ──────────────────────────────────────────

export interface DiagnosticoDeOrden {
  readonly id: string;
  readonly fallaReal: string;
  readonly componente: string | null;
  readonly momento: string;
  readonly tecnico: string;
}

/** Estado de una cotizacion. Solo la ultima puede estar pendiente. */
export type EstadoCotizacion = 'pendiente' | 'aceptada' | 'rechazada' | 'reemplazada' | 'no_requiere';

export interface CotizacionDeOrden {
  readonly id: string;
  /** Importes finales guardados (despues de descuentos y exoneraciones). */
  readonly manoObra: number;
  readonly totalRepuestos: number;
  readonly cargoVisita: number;
  readonly total: number;
  /** null mientras el cliente no decide. */
  readonly aceptada: boolean | null;
  readonly formaAceptacion: string | null;
  readonly momentoAceptacion: string | null;
  /** Lo que se anoto con la decision del cliente (canal y observaciones). */
  readonly observacionDecision: string | null;
  readonly creadoEn: string;
  readonly registradoPor: string | null;
  readonly estado: EstadoCotizacion;
  /**
   * Conceptos, repuestos con su precio, ajustes y responsable de pago, tal
   * como se cotizaron. null en cotizaciones anteriores a este detalle.
   */
  readonly detalle: DetalleCotizacion | null;
  /** Por que se registro esta version (cambio o ajuste). */
  readonly motivo: string | null;
}

/** Repuesto pedido para la orden, con su estado y el precio de HOY en inventario. */
export interface RepuestoDeLaOrden {
  readonly idRepuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  /** Cantidad vigente pedida (sin rechazadas ni anuladas). */
  readonly cantidad: number;
  /** Cantidad en cada estado de la solicitud. */
  readonly porEstado: Readonly<Record<string, number>>;
  /** Cantidad instalada (consumos registrados para la orden). */
  readonly utilizada: number;
  /** Precio actual del inventario; null si no tiene precio registrado. */
  readonly precioInventario: number | null;
}

export interface AntecedenteDeOrden {
  readonly idOrden: string;
  readonly codigo: string;
  readonly tipoGarantia: TipoGarantia;
  readonly diagnosticos: readonly DiagnosticoDeOrden[];
}

export interface DatosDeTaller {
  /** Quien paga hoy la reparacion. */
  readonly tipoGarantia: string;
  readonly responsablePago: ResponsablePago;
  readonly modalidad: string;
  /** Cargo de visita congelado al crear la orden (0 en taller). */
  readonly cargoVisita: number;
  readonly diagnosticos: readonly DiagnosticoDeOrden[];
  readonly repuestos: readonly RepuestoDeLaOrden[];
  readonly cotizaciones: readonly CotizacionDeOrden[];
  /** Orden de garantia de la que viene esta (si es la continuacion particular). */
  readonly antecedentes: AntecedenteDeOrden | null;
  /** Lo que el usuario puede hacer ahora, decidido por el servidor. */
  readonly puede: {
    readonly diagnosticar: boolean;
    readonly cotizar: boolean;
    readonly ajustar: boolean;
    readonly decidir: boolean;
  };
}

export interface PeticionRegistrarDiagnostico {
  readonly fallaReal: string;
  readonly componente?: string | null;
  /** Observaciones del tecnico sobre lo encontrado. */
  readonly observaciones?: string | null;
  /**
   * Golpe, mal uso u otra posible exclusion que el tecnico constata. Queda
   * anotada; NO cambia la garantia de la orden. Si corresponde, quien tiene
   * permiso la reclasifica con motivo.
   */
  readonly exclusion?: string | null;
}

export interface PeticionRegistrarCotizacion {
  readonly manoObra: number;
  /**
   * Cargo de visita. Si se omite, el congelado en la orden. Cambiarlo es un
   * ajuste: exige permiso y motivo.
   */
  readonly cargoVisita?: number;
  /** @deprecated Los repuestos salen del inventario; este valor se ignora. */
  readonly totalRepuestos?: number;
  /** Descuentos y exoneraciones. Solo en ordenes particulares y con permiso. */
  readonly ajustes?: {
    readonly manoObra?: AjusteConcepto;
    readonly visita?: AjusteConcepto;
    readonly repuestos?: AjusteConcepto;
  };
  /** Precio cotizado distinto del inventario (o para un repuesto sin precio), con motivo. */
  readonly preciosRepuestos?: readonly { readonly idRepuesto: string; readonly precioUnitario: number }[];
  /** Obligatorio si hay ajustes, precios cambiados o si reemplaza una cotizacion anterior. */
  readonly motivo?: string | null;
}

export interface PeticionDecisionCotizacion {
  readonly aceptada: boolean;
  readonly forma: 'firma_presencial' | 'llamada' | 'mensaje' | 'correo';
  readonly observacion?: string | null;
}
