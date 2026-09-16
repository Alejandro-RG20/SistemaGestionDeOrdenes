/**
 * Catalogos de apoyo: lo que los formularios necesitan para poder ofrecer
 * opciones en vez de pedir que se teclee un identificador.
 *
 * Van todos juntos en una sola peticion a proposito. El formulario de una
 * orden nueva necesita marcas, categorias, tiendas, zonas y tecnicos a la
 * vez; pedirlos por separado son cinco viajes para dibujar una pantalla, y
 * cinco maneras de que se quede a medias.
 */

export interface OpcionCatalogo {
  readonly id: string;
  readonly nombre: string;
}

export interface CategoriaDeCatalogo extends OpcionCatalogo {
  /** blanca, marron u otros. */
  readonly linea: string;
}

export interface TiendaDeCatalogo extends OpcionCatalogo {
  /**
   * Si pertenece al grupo. Es lo que decide si el proveedor responde por la
   * garantia, asi que la pantalla lo muestra en vez de esconderlo.
   */
  readonly perteneceAlGrupo: boolean;
}

export interface ZonaDeCatalogo extends OpcionCatalogo {
  /** Congelado en la orden al crearse (RN-22). */
  readonly cargoVisita: number;
}

export interface TecnicoDeCatalogo extends OpcionCatalogo {
  readonly tipo: 'ruta' | 'planta';
  readonly especialidad: string;
  readonly disponible: boolean;
  /** Ordenes abiertas que ya tiene encima. Para no cargarle mas al mismo. */
  readonly cargaActual: number;
}

export interface CatalogosDeApoyo {
  readonly marcas: readonly OpcionCatalogo[];
  readonly categorias: readonly CategoriaDeCatalogo[];
  readonly tiendas: readonly TiendaDeCatalogo[];
  readonly zonas: readonly ZonaDeCatalogo[];
  readonly tecnicos: readonly TecnicoDeCatalogo[];
}
