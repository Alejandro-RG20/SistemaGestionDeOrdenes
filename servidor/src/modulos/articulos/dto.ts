/** Filas de articulo y su traduccion a los contratos publicos. */
import type {
  CoberturaArticulo, FichaArticulo, OrdenDelHistorial, ResumenArticulo, TipoGarantia,
} from '@servitotal/compartido';

export interface FilaArticulo {
  readonly id: string;
  readonly numero_serie: string | null;
  readonly sin_serie_legible: boolean;
  readonly modelo: string | null;
  readonly id_marca: string;
  readonly marca: string;
  readonly id_categoria: string;
  readonly categoria: string;
  readonly id_tienda_origen: string;
  readonly tienda_origen: string;
  readonly tienda_pertenece_al_grupo: boolean;
  readonly fecha_compra: Date | null;
  readonly factura_referencia: string | null;
  readonly id_cliente: string;
  readonly cliente: string;
  readonly activo: boolean;
}

export interface FilaCobertura {
  readonly id: string;
  readonly tipo: TipoGarantia;
  readonly vigente_desde: Date;
  readonly vigente_hasta: Date;
  readonly documento_respaldo: string | null;
  readonly id_cliente_contratante: string | null;
  readonly activa: boolean;
}

export interface FilaOrdenHistorial {
  readonly id: string;
  readonly numero: number;
  readonly estado: string;
  readonly tipo_garantia: TipoGarantia;
  readonly falla_reportada: string;
  readonly fecha_recepcion: Date;
  readonly fecha_entrega: Date | null;
}

const comoFecha = (valor: Date | null): string | null => valor?.toISOString().slice(0, 10) ?? null;

export function aResumenArticulo(fila: FilaArticulo): ResumenArticulo {
  return {
    id: fila.id,
    numeroSerie: fila.numero_serie,
    sinSerieLegible: fila.sin_serie_legible,
    modelo: fila.modelo,
    idMarca: fila.id_marca,
    marca: fila.marca,
    idCategoria: fila.id_categoria,
    categoria: fila.categoria,
    idTiendaOrigen: fila.id_tienda_origen,
    tiendaOrigen: fila.tienda_origen,
    tiendaPerteneceAlGrupo: fila.tienda_pertenece_al_grupo,
    fechaCompra: comoFecha(fila.fecha_compra),
    facturaReferencia: fila.factura_referencia,
    idCliente: fila.id_cliente,
    cliente: fila.cliente,
    activo: fila.activo,
  };
}

export function aCobertura(fila: FilaCobertura, hoy: Date): CoberturaArticulo {
  return {
    id: fila.id,
    tipo: fila.tipo,
    vigenteDesde: comoFecha(fila.vigente_desde)!,
    vigenteHasta: comoFecha(fila.vigente_hasta)!,
    documentoRespaldo: fila.documento_respaldo,
    idClienteContratante: fila.id_cliente_contratante,
    activa: fila.activa,
    vigenteHoy: fila.activa
      && fila.vigente_desde.getTime() <= hoy.getTime()
      && fila.vigente_hasta.getTime() >= hoy.getTime(),
  };
}

export function aOrdenDelHistorial(fila: FilaOrdenHistorial): OrdenDelHistorial {
  return {
    id: fila.id,
    numero: fila.numero,
    estado: fila.estado,
    tipoGarantia: fila.tipo_garantia,
    fallaReportada: fila.falla_reportada,
    fechaRecepcion: fila.fecha_recepcion.toISOString(),
    fechaEntrega: fila.fecha_entrega?.toISOString() ?? null,
  };
}

export function aFichaArticulo(
  fila: FilaArticulo,
  coberturas: readonly FilaCobertura[],
  historial: readonly FilaOrdenHistorial[],
): FichaArticulo {
  const hoy = new Date();
  return {
    ...aResumenArticulo(fila),
    coberturas: coberturas.map((cobertura) => aCobertura(cobertura, hoy)),
    historial: historial.map(aOrdenDelHistorial),
  };
}
