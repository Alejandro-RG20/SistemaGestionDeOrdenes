/** Filas de inventario y su traduccion a los contratos publicos. */
import type {
  ExistenciaEnBodega, ResumenBodega, ResumenMovimiento, ResumenRepuesto,
  ResumenSolicitudRepuesto, TipoBodega, TipoMovimiento, ViaAbastecimiento,
} from '@servitotal/compartido';

export interface FilaBodega {
  readonly id: string;
  readonly tipo: TipoBodega;
  readonly nombre: string;
  readonly id_tecnico: string | null;
  readonly tecnico: string | null;
  readonly activa: boolean;
  readonly renglones: string;
  readonly unidades: string;
}

export interface FilaRepuesto {
  readonly id: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly id_marca: string | null;
  readonly marca: string | null;
  readonly unidad_medida: string;
  readonly precio: number;
  readonly stock_minimo: number;
  readonly via_abastecimiento: ViaAbastecimiento;
  readonly activo: boolean;
}

export interface FilaExistencia {
  readonly id_bodega: string;
  readonly bodega: string;
  readonly id_repuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly stock_minimo: number;
  readonly actualizado_en: Date;
}

export interface FilaMovimiento {
  readonly id: string;
  readonly id_repuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly tipo: TipoMovimiento;
  readonly id_bodega_origen: string | null;
  readonly bodega_origen: string | null;
  readonly id_bodega_destino: string | null;
  readonly bodega_destino: string | null;
  readonly cantidad: number;
  readonly precio_unitario: number;
  readonly id_orden: string | null;
  readonly numero_orden: number | null;
  readonly responsable: string;
  readonly justificacion: string | null;
  readonly momento_dispositivo: Date | null;
  readonly registrado_sin_conexion: boolean;
  readonly creado_en: Date;
}

export interface FilaSolicitud {
  readonly id: string;
  readonly id_orden: string;
  readonly numero_orden: number;
  readonly id_repuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly via: ViaAbastecimiento;
  readonly fecha_solicitud: Date;
  readonly fecha_estimada: Date | null;
  readonly fecha_ingreso: Date | null;
  readonly liberada: boolean;
}

const comoFecha = (valor: Date | null): string | null => valor?.toISOString().slice(0, 10) ?? null;

export function aResumenBodega(fila: FilaBodega): ResumenBodega {
  return {
    id: fila.id, tipo: fila.tipo, nombre: fila.nombre,
    idTecnico: fila.id_tecnico, tecnico: fila.tecnico, activa: fila.activa,
    renglones: Number(fila.renglones), unidades: Number(fila.unidades),
  };
}

export function aResumenRepuesto(fila: FilaRepuesto): ResumenRepuesto {
  return {
    id: fila.id, codigo: fila.codigo, descripcion: fila.descripcion,
    idMarca: fila.id_marca, marca: fila.marca, unidadMedida: fila.unidad_medida,
    precio: Number(fila.precio), stockMinimo: fila.stock_minimo,
    viaAbastecimiento: fila.via_abastecimiento, activo: fila.activo,
  };
}

export function aExistencia(fila: FilaExistencia): ExistenciaEnBodega {
  return {
    idBodega: fila.id_bodega, bodega: fila.bodega,
    idRepuesto: fila.id_repuesto, codigo: fila.codigo, descripcion: fila.descripcion,
    cantidad: fila.cantidad, stockMinimo: fila.stock_minimo,
    bajoMinimo: fila.cantidad <= fila.stock_minimo,
    actualizadoEn: fila.actualizado_en.toISOString(),
  };
}

export function aResumenMovimiento(fila: FilaMovimiento): ResumenMovimiento {
  return {
    id: fila.id, idRepuesto: fila.id_repuesto, codigo: fila.codigo, descripcion: fila.descripcion,
    tipo: fila.tipo,
    idBodegaOrigen: fila.id_bodega_origen, bodegaOrigen: fila.bodega_origen,
    idBodegaDestino: fila.id_bodega_destino, bodegaDestino: fila.bodega_destino,
    cantidad: fila.cantidad, precioUnitario: Number(fila.precio_unitario),
    idOrden: fila.id_orden, numeroOrden: fila.numero_orden,
    responsable: fila.responsable, justificacion: fila.justificacion,
    momentoDispositivo: fila.momento_dispositivo?.toISOString() ?? null,
    registradoSinConexion: fila.registrado_sin_conexion,
    creadoEn: fila.creado_en.toISOString(),
  };
}

export function aResumenSolicitud(fila: FilaSolicitud): ResumenSolicitudRepuesto {
  return {
    id: fila.id, idOrden: fila.id_orden, numeroOrden: fila.numero_orden,
    idRepuesto: fila.id_repuesto, codigo: fila.codigo, descripcion: fila.descripcion,
    cantidad: fila.cantidad, via: fila.via,
    fechaSolicitud: comoFecha(fila.fecha_solicitud)!,
    fechaEstimada: comoFecha(fila.fecha_estimada),
    fechaIngreso: comoFecha(fila.fecha_ingreso),
    liberada: fila.liberada,
  };
}
