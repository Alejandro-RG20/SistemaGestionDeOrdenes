/** Contratos del modulo de inventario. */
import type { TipoBodega, TipoMovimiento, ViaAbastecimiento } from '../dominio/inventario.js';

export interface ResumenBodega {
  readonly id: string;
  readonly tipo: TipoBodega;
  readonly nombre: string;
  readonly idTecnico: string | null;
  readonly tecnico: string | null;
  readonly activa: boolean;
  readonly renglones: number;
  readonly unidades: number;
}

export interface ResumenRepuesto {
  readonly id: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly idMarca: string | null;
  readonly marca: string | null;
  readonly unidadMedida: string;
  readonly precio: number;
  readonly stockMinimo: number;
  readonly viaAbastecimiento: ViaAbastecimiento;
  readonly activo: boolean;
}

export interface ExistenciaEnBodega {
  readonly idBodega: string;
  readonly bodega: string;
  readonly idRepuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly stockMinimo: number;
  readonly bajoMinimo: boolean;
  readonly actualizadoEn: string;
}

export interface ResumenMovimiento {
  readonly id: string;
  readonly idRepuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly tipo: TipoMovimiento;
  readonly idBodegaOrigen: string | null;
  readonly bodegaOrigen: string | null;
  readonly idBodegaDestino: string | null;
  readonly bodegaDestino: string | null;
  readonly cantidad: number;
  readonly precioUnitario: number;
  readonly idOrden: string | null;
  readonly numeroOrden: number | null;
  readonly responsable: string;
  readonly justificacion: string | null;
  readonly momentoDispositivo: string | null;
  readonly registradoSinConexion: boolean;
  readonly creadoEn: string;
}

export interface PeticionMovimientoInventario {
  readonly idRepuesto: string;
  readonly tipo: TipoMovimiento;
  readonly idBodegaOrigen?: string | null;
  readonly idBodegaDestino?: string | null;
  readonly cantidad: number;
  readonly precioUnitario?: number;
  readonly idOrden?: string | null;
  readonly justificacion?: string | null;
  readonly momentoDispositivo?: string | null;
  readonly registradoSinConexion?: boolean;
}

export interface ResumenSolicitudRepuesto {
  readonly id: string;
  readonly idOrden: string;
  readonly numeroOrden: number;
  readonly idRepuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly via: ViaAbastecimiento;
  readonly fechaSolicitud: string;
  readonly fechaEstimada: string | null;
  readonly fechaIngreso: string | null;
  readonly liberada: boolean;
}

export interface PeticionSolicitudRepuesto {
  readonly idRepuesto: string;
  readonly cantidad: number;
  readonly via?: ViaAbastecimiento;
  readonly fechaEstimada?: string | null;
}

/** Orden que quedo liberada porque entro el repuesto que esperaba (RF-53). */
export interface OrdenLiberada {
  readonly idOrden: string;
  readonly numeroOrden: number;
  readonly idSolicitud: string;
  readonly cantidad: number;
  readonly responsable: string | null;
}

export interface ResultadoMovimiento {
  readonly movimiento: ResumenMovimiento;
  /** Existencia despues del movimiento, por bodega afectada. */
  readonly existencias: readonly {
    readonly idBodega: string;
    readonly bodega: string;
    readonly cantidad: number;
  }[];
  /** Ordenes que este ingreso desbloqueo. Vacio si el movimiento no libera nada. */
  readonly ordenesLiberadas: readonly OrdenLiberada[];
}
