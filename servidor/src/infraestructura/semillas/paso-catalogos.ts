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

/**
 * Las sucursales del grupo.
 *
 * `pertenece_al_grupo` es lo que decide si la garantia del proveedor
 * aplica, asi que «Externa» tiene que seguir existiendo: es donde cae todo
 * lo comprado fuera de Unicomer, y es la que hace que una evaluacion de
 * cobertura pueda decir que no.
 *
 * Las cuatro primeras conservan su nombre exacto porque son las que usan
 * las reglas de cobertura sembradas y las pruebas de garantia; las de
 * abajo son sucursales concretas, para que la pantalla de tiendas muestre
 * algo parecido a lo real y no cuatro filas de catalogo.
 */
const TIENDAS: readonly (readonly [
  codigo: string, nombre: string, perteneceAlGrupo: boolean,
  direccion: string, telefono: string,
])[] = [
  ['CUR-001', 'La Curacao', true, 'Centro comercial Metrocentro, modulo 12, Managua', '2278-1100'],
  ['TRO-001', 'Almacenes Tropigas', true, 'Carretera Masaya km 4, Managua', '2278-2200'],
  ['RSH-001', 'RadioShack', true, 'Plaza Inter, local 34, Managua', '2222-3300'],
  ['EXT-000', 'Externa', false, 'Compra fuera del grupo', ''],
  ['CUR-002', 'La Curacao Ciudad Jardin', true, 'Pista Buenos Aires, Ciudad Jardin, Managua', '2249-1150'],
  ['CUR-003', 'La Curacao Bello Horizonte', true, 'Rotonda Bello Horizonte 1c al sur, Managua', '2244-1180'],
  ['TRO-002', 'Almacenes Tropigas Mercado Oriental', true, 'Mercado Oriental, modulo central, Managua', '2248-2240'],
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

  contexto.tiendas = TIENDAS.map(([codigo, nombre, perteneceAlGrupo, direccion, telefono]) => ({
    id: contexto.azar.uuid(),
    codigo,
    nombre,
    perteneceAlGrupo,
    direccion,
    telefono,
  }));
  await copiarFilas(
    cliente,
    'tienda_origen',
    ['id', 'codigo', 'nombre', 'pertenece_al_grupo', 'direccion', 'telefono', 'activa'],
    contexto.tiendas.map((tienda) => [
      tienda.id, tienda.codigo, tienda.nombre, tienda.perteneceAlGrupo,
      tienda.direccion, tienda.telefono === '' ? null : tienda.telefono, true,
    ]),
  );

  contexto.categorias = CATEGORIAS.map(([nombre, linea]) => ({ id: contexto.azar.uuid(), nombre, linea }));
  await copiarFilas(
    cliente,
    'categoria_articulo',
    ['id', 'nombre', 'linea', 'activa'],
    contexto.categorias.map((categoria) => [categoria.id, categoria.nombre, categoria.linea, true]),
  );
}
