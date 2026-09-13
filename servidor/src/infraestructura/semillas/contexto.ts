/**
 * Contexto de la siembra: lo que cada paso genera y los siguientes
 * necesitan. Se pasa explicitamente, sin estado global.
 */
import type { Aleatorio } from './aleatorio.js';

export interface ReferenciaZona { readonly id: string; readonly nombre: string; readonly cargoVisita: number }
export interface ReferenciaCategoria { readonly id: string; readonly nombre: string; readonly linea: string }
export interface ReferenciaMarca { readonly id: string; readonly nombre: string }
export interface ReferenciaTienda { readonly id: string; readonly nombre: string; readonly perteneceAlGrupo: boolean }

export interface ReferenciaUsuario {
  readonly id: string;
  readonly nombreUsuario: string;
  readonly rol: string;
}

export interface ReferenciaTecnico {
  readonly id: string;
  readonly idUsuario: string;
  readonly tipo: 'ruta' | 'planta';
  readonly especialidad: string;
}

export interface ReferenciaReglaCobertura {
  readonly id: string;
  readonly idMarca: string | null;
  readonly idCategoria: string | null;
  readonly mesesCobertura: number;
  readonly exigeTiendaGrupo: boolean;
  readonly fallasExcluidas: readonly string[];
  readonly vigente: boolean;
}

export interface ReferenciaBodega {
  readonly id: string;
  readonly tipo: 'central' | 'movil';
  readonly idTecnico: string | null;
}

export interface ReferenciaRepuesto {
  readonly id: string;
  readonly codigo: string;
  readonly precio: number;
  readonly viaAbastecimiento: string;
}

export interface ReferenciaCliente {
  readonly id: string;
  readonly telefonoVigente: string;
  readonly direccion: string;
  readonly referenciaUbicacion: string;
  readonly idZona: string;
}

export interface ReferenciaArticulo {
  readonly id: string;
  readonly idCliente: string;
  readonly idMarca: string;
  readonly idCategoria: string;
  readonly idTienda: string;
  readonly fechaCompra: Date | null;
  readonly tienePolizaVigente: boolean;
}

export interface ReferenciaPlantilla {
  readonly id: string;
  readonly idCategoria: string;
  readonly items: readonly {
    readonly id: string;
    readonly etiqueta: string;
    readonly tipoCampo: string;
    readonly unidad: string | null;
    readonly rangoMin: number | null;
    readonly rangoMax: number | null;
  }[];
}

export interface ContextoSiembra {
  readonly azar: Aleatorio;
  readonly idCentro: string;
  readonly inicioVentana: Date;
  readonly finVentana: Date;
  zonas: ReferenciaZona[];
  marcas: ReferenciaMarca[];
  tiendas: ReferenciaTienda[];
  categorias: ReferenciaCategoria[];
  usuariosPorRol: Map<string, ReferenciaUsuario[]>;
  tecnicos: ReferenciaTecnico[];
  dispositivos: { id: string; idUsuario: string }[];
  reglasCobertura: ReferenciaReglaCobertura[];
  plantillas: ReferenciaPlantilla[];
  bodegas: ReferenciaBodega[];
  idBodegaCentral: string;
  idBodegaPiezasSustituidas: string;
  repuestos: ReferenciaRepuesto[];
  clientes: ReferenciaCliente[];
  articulos: ReferenciaArticulo[];
}

export function usuariosDe(contexto: ContextoSiembra, rol: string): ReferenciaUsuario[] {
  const lista = contexto.usuariosPorRol.get(rol);
  if (lista === undefined || lista.length === 0) {
    throw new Error(`La siembra no genero ningun usuario con el rol ${rol}.`);
  }
  return lista;
}
