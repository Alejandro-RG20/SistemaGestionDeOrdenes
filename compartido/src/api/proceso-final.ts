/**
 * Contratos de validacion tecnica, entrega, compras, proveedores y tiendas.
 */
import type { EstadoCompra, ResultadoValidacion } from '../dominio/proceso-final.js';

// ── validacion tecnica ────────────────────────────────────────────────

export interface ValidacionTecnica {
  readonly id: string;
  readonly idOrden: string;
  readonly resultado: ResultadoValidacion;
  readonly observacion: string;
  readonly revisoDiagnostico: boolean;
  readonly revisoReparacion: boolean;
  readonly revisoEvidencias: boolean;
  readonly revisoRepuestos: boolean;
  readonly validador: string;
  readonly momento: string;
}

export interface PeticionValidar {
  readonly resultado: ResultadoValidacion;
  readonly observacion: string;
  readonly revisoDiagnostico: boolean;
  readonly revisoReparacion: boolean;
  readonly revisoEvidencias: boolean;
  readonly revisoRepuestos: boolean;
}

/**
 * Lo que la jefatura necesita ver ANTES de aprobar, reunido en una sola
 * respuesta.
 *
 * Aprobar mirando solo el numero de orden no es revisar. Aqui viaja lo que
 * de verdad se juzga —el diagnostico, que evidencia hay y cual falta, que
 * repuestos se declararon— para que la decision se tome con la informacion
 * delante y no a ciegas.
 */
export interface ExpedienteDeRevision {
  readonly idOrden: string;
  readonly codigo: string;
  readonly numero: number;
  readonly estado: string;
  readonly cliente: string;
  readonly articulo: string;
  readonly tipoGarantia: string;
  readonly tecnico: string | null;
  readonly fallaReportada: string;
  readonly diagnostico: { readonly fallaReal: string; readonly componente: string | null } | null;
  readonly evidenciasPresentes: readonly string[];
  readonly evidenciasFaltantes: readonly string[];
  readonly repuestos: readonly {
    readonly descripcion: string;
    readonly cantidad: number;
    readonly precioUnitario: number;
  }[];
  readonly validaciones: readonly ValidacionTecnica[];
  /** Si el que revisa es el tecnico de la orden, no puede aprobar. */
  readonly esSuPropioTrabajo: boolean;
}

// ── entrega ───────────────────────────────────────────────────────────

export interface Entrega {
  readonly id: string;
  readonly idOrden: string;
  readonly recibidoPor: string;
  readonly documentoReceptor: string | null;
  readonly esElCliente: boolean;
  readonly observacion: string | null;
  readonly responsable: string;
  readonly momento: string;
}

export interface PeticionEntregar {
  readonly recibidoPor: string;
  readonly documentoReceptor?: string;
  readonly esElCliente: boolean;
  readonly observacion?: string;
}

/** Cada condicion de entrega, dicha en el idioma del mostrador. */
export interface RequisitoDeEntrega {
  readonly clave: string;
  readonly etiqueta: string;
  readonly cumplido: boolean;
  /** Que hacer si no se cumple. Vacio cuando ya esta. */
  readonly queHacer: string;
}

export interface VerificacionDeEntrega {
  readonly idOrden: string;
  readonly puedeEntregarse: boolean;
  readonly requisitos: readonly RequisitoDeEntrega[];
  readonly entrega: Entrega | null;
}

// ── proveedores ───────────────────────────────────────────────────────

export interface Proveedor {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly contacto: string | null;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly direccion: string | null;
  readonly atiendeGarantias: boolean;
  readonly activo: boolean;
}

export interface PeticionProveedor {
  readonly codigo: string;
  readonly nombre: string;
  readonly contacto?: string;
  readonly telefono?: string;
  readonly correo?: string;
  readonly direccion?: string;
  readonly atiendeGarantias: boolean;
}

// ── compras ───────────────────────────────────────────────────────────

export interface LineaDeCompra {
  readonly id: string;
  readonly idRepuesto: string;
  readonly codigoRepuesto: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly cantidadRecibida: number;
  readonly precioUnitario: number;
}

export interface ResumenCompra {
  readonly id: string;
  readonly numero: number;
  readonly proveedor: string;
  readonly estado: EstadoCompra;
  readonly fechaPedido: string;
  readonly fechaEstimada: string | null;
  readonly total: number;
  readonly lineas: number;
  /** Cuanto de lo pedido ya conto bodega, en piezas. */
  readonly recibido: number;
  readonly pedido: number;
}

export interface CompraDetallada extends ResumenCompra {
  readonly idProveedor: string;
  readonly observacion: string | null;
  readonly motivoCancelacion: string | null;
  readonly detalle: readonly LineaDeCompra[];
  /** A donde puede moverse desde donde esta. */
  readonly transicionesPosibles: readonly EstadoCompra[];
  readonly admiteRecepcion: boolean;
}

export interface PeticionCrearCompra {
  readonly idProveedor: string;
  readonly fechaEstimada?: string;
  readonly observacion?: string;
  readonly lineas: readonly {
    readonly idRepuesto: string;
    readonly cantidad: number;
    readonly precioUnitario: number;
  }[];
}

export interface PeticionMoverCompra {
  readonly hacia: EstadoCompra;
  readonly motivoCancelacion?: string;
}

/**
 * Lo que bodega cuenta al abrir las cajas.
 *
 * Va contra la BODEGA, no contra la compra: el ingreso es un movimiento de
 * inventario y necesita saber a que bodega entra.
 */
export interface PeticionRecibirCompra {
  readonly idBodega: string;
  readonly lineas: readonly { readonly idLinea: string; readonly cantidad: number }[];
}

// ── tiendas ───────────────────────────────────────────────────────────

export interface Tienda {
  readonly id: string;
  readonly codigo: string | null;
  readonly nombre: string;
  readonly direccion: string | null;
  readonly telefono: string | null;
  readonly perteneceAlGrupo: boolean;
  readonly activa: boolean;
}

export interface PeticionTienda {
  readonly codigo: string;
  readonly nombre: string;
  readonly direccion?: string;
  readonly telefono?: string;
  readonly perteneceAlGrupo: boolean;
}
