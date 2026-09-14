/** Filas de cobertura y reglas, y su traduccion a los contratos publicos. */
import type { ResumenReglaCobertura, TipoGarantia } from '@servitotal/compartido';
import type {
  ArticuloParaCobertura, PolizaParaCobertura, ReglaCoberturaVigente,
} from '../../dominio/garantias/indice.js';

export interface FilaRegla {
  readonly id: string;
  readonly id_marca: string | null;
  readonly marca: string | null;
  readonly id_categoria: string | null;
  readonly categoria: string | null;
  readonly meses_cobertura: number;
  readonly exige_tienda_grupo: boolean;
  readonly fallas_excluidas: string[] | null;
  readonly version: number;
  readonly vigente_desde: Date;
  readonly vigente_hasta: Date | null;
  readonly activa: boolean;
}

export interface FilaArticuloCobertura {
  readonly id: string;
  readonly id_cliente: string;
  readonly id_marca: string;
  readonly id_categoria: string;
  readonly id_tienda_origen: string;
  readonly tienda_pertenece_al_grupo: boolean;
  readonly fecha_compra: Date | null;
}

export interface FilaPoliza {
  readonly id: string;
  readonly tipo: TipoGarantia;
  readonly vigente_desde: Date;
  readonly vigente_hasta: Date;
  readonly id_cliente_contratante: string | null;
  readonly activa: boolean;
}

const comoFecha = (valor: Date): string => valor.toISOString().slice(0, 10);

export function aResumenRegla(fila: FilaRegla): ResumenReglaCobertura {
  return {
    id: fila.id,
    idMarca: fila.id_marca,
    marca: fila.marca,
    idCategoria: fila.id_categoria,
    categoria: fila.categoria,
    mesesCobertura: fila.meses_cobertura,
    exigeTiendaGrupo: fila.exige_tienda_grupo,
    fallasExcluidas: fila.fallas_excluidas ?? [],
    version: fila.version,
    vigenteDesde: comoFecha(fila.vigente_desde),
    vigenteHasta: fila.vigente_hasta === null ? null : comoFecha(fila.vigente_hasta),
    activa: fila.activa,
  };
}

export function aReglaDelDominio(fila: FilaRegla): ReglaCoberturaVigente {
  return {
    id: fila.id,
    idMarca: fila.id_marca,
    idCategoria: fila.id_categoria,
    mesesCobertura: fila.meses_cobertura,
    exigeTiendaGrupo: fila.exige_tienda_grupo,
    fallasExcluidas: fila.fallas_excluidas ?? [],
    version: fila.version,
  };
}

export function aArticuloDelDominio(fila: FilaArticuloCobertura): ArticuloParaCobertura {
  return {
    id: fila.id,
    idCliente: fila.id_cliente,
    idMarca: fila.id_marca,
    idCategoria: fila.id_categoria,
    idTiendaOrigen: fila.id_tienda_origen,
    tiendaPerteneceAlGrupo: fila.tienda_pertenece_al_grupo,
    fechaCompra: fila.fecha_compra,
  };
}

export function aPolizaDelDominio(fila: FilaPoliza): PolizaParaCobertura {
  return {
    id: fila.id,
    tipo: fila.tipo,
    vigenteDesde: fila.vigente_desde,
    vigenteHasta: fila.vigente_hasta,
    idClienteContratante: fila.id_cliente_contratante,
    activa: fila.activa,
  };
}
