/** Paso 1: centro, zonas, marcas, tiendas de origen y categorias. */
import type { PoolClient } from 'pg';
import { copiarFilas } from './insercion.js';
import { ZONAS } from './nombres.js';
import type { ContextoSiembra } from './contexto.js';

const MARCAS: readonly (readonly [string, string])[] = [
  ['Whirlpool', 'garantias.ca@whirlpool-ejemplo.com'],
  ['Mabe', 'servicio.nic@mabe-ejemplo.com'],
  ['LG', 'warranty.latam@lg-ejemplo.com'],
  ['Samsung', 'soporte.ca@samsung-ejemplo.com'],
  ['Electrolux', 'garantia@electrolux-ejemplo.com'],
  ['Frigidaire', 'claims@frigidaire-ejemplo.com'],
  ['Sankey', 'servicio@sankey-ejemplo.com'],
  ['Atlas', 'garantias@atlas-ejemplo.com'],
  ['Oster', 'soporte@oster-ejemplo.com'],
  ['Sony', 'warranty@sony-ejemplo.com'],
  ['Panasonic', 'garantia.ca@panasonic-ejemplo.com'],
  ['Hisense', 'service@hisense-ejemplo.com'],
  ['Midea', 'postventa@midea-ejemplo.com'],
  ['Indurama', 'garantias@indurama-ejemplo.com'],
];

const TIENDAS: readonly (readonly [string, boolean])[] = [
  ['La Curacao', true],
  ['Almacenes Tropigas', true],
  ['RadioShack', true],
  ['Externa', false],
];

const CATEGORIAS: readonly (readonly [string, string])[] = [
  ['refrigeracion', 'blanca'],
  ['lavado', 'blanca'],
  ['cocina', 'blanca'],
  ['aire_acondicionado', 'blanca'],
  ['audio_video', 'marron'],
  ['computo', 'marron'],
  ['pequenos_electrodomesticos', 'otros'],
];

export async function sembrarCatalogos(cliente: PoolClient, contexto: ContextoSiembra): Promise<void> {
  await copiarFilas(cliente, 'centro', ['id', 'nombre', 'distrito', 'activo'], [
    [contexto.idCentro, 'ServiTotal Distrito VI', 'Distrito VI, Managua', true],
  ]);

  contexto.zonas = ZONAS.map(([nombre, cargoVisita]) => ({
    id: contexto.azar.uuid(),
    nombre,
    cargoVisita,
  }));
  await copiarFilas(
    cliente,
    'zona',
    ['id', 'id_centro', 'nombre', 'cargo_visita', 'activa'],
    contexto.zonas.map((zona) => [zona.id, contexto.idCentro, zona.nombre, zona.cargoVisita, true]),
  );

  contexto.marcas = MARCAS.map(([nombre]) => ({ id: contexto.azar.uuid(), nombre }));
  await copiarFilas(
    cliente,
    'marca',
    ['id', 'nombre', 'contacto_garantia', 'activa'],
    contexto.marcas.map((marca, indice) => [marca.id, marca.nombre, MARCAS[indice]![1], true]),
  );

  contexto.tiendas = TIENDAS.map(([nombre, perteneceAlGrupo]) => ({
    id: contexto.azar.uuid(),
    nombre,
    perteneceAlGrupo,
  }));
  await copiarFilas(
    cliente,
    'tienda_origen',
    ['id', 'nombre', 'pertenece_al_grupo', 'activa'],
    contexto.tiendas.map((tienda) => [tienda.id, tienda.nombre, tienda.perteneceAlGrupo, true]),
  );

  contexto.categorias = CATEGORIAS.map(([nombre, linea]) => ({ id: contexto.azar.uuid(), nombre, linea }));
  await copiarFilas(
    cliente,
    'categoria_articulo',
    ['id', 'nombre', 'linea', 'activa'],
    contexto.categorias.map((categoria) => [categoria.id, categoria.nombre, categoria.linea, true]),
  );
}
