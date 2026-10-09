/**
 * Paso 5: bodegas y catalogo de repuestos.
 *
 * Bodegas: una central, una movil por cada tecnico de ruta (AD-05) y una
 * central separada para las piezas retiradas de los articulos. Esa ultima
 * existe para que las devoluciones de pieza sustituida (H7) no inflen la
 * existencia de repuesto util: lo retirado esta danado y no se vuelve a
 * instalar.
 *
 * El catalogo de repuestos NO se genera al azar: sale de
 * `catalogo-repuestos.ts`, que declara las familias de pieza que el taller
 * repone de verdad y que marca fabrica cada categoria. Lo unico aleatorio
 * es el precio dentro del rango de su familia, que es lo que de verdad
 * varia entre proveedores.
 */
import type { PoolClient } from 'pg';
import { CODIGO_ROL, TIPO_BODEGA, VIA_ABASTECIMIENTO } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { generarCatalogo } from './catalogo-repuestos.js';
import type { ContextoSiembra, ReferenciaBodega, ReferenciaRepuesto } from './contexto.js';

export const NOMBRE_BODEGA_CENTRAL = 'Bodega central';
export const NOMBRE_BODEGA_PIEZAS = 'Bodega de piezas sustituidas';

export async function sembrarInventarioBase(cliente: PoolClient, contexto: ContextoSiembra): Promise<void> {
  const { azar } = contexto;

  const bodegas: ReferenciaBodega[] = [
    { id: contexto.idBodegaCentral, tipo: TIPO_BODEGA.CENTRAL, idTecnico: null },
    { id: contexto.idBodegaPiezasSustituidas, tipo: TIPO_BODEGA.CENTRAL, idTecnico: null },
    // Cada tecnico tiene su bodega personal: la movil del vehiculo para el
    // de ruta y la de banco para el de planta (migracion 0023). Es lo que
    // permite que entregar, consumir y devolver sean movimientos reales en
    // los dos casos, y saber en todo momento que piezas tiene cada uno.
    ...contexto.tecnicos
      .map((tecnico) => ({ id: azar.uuid(), tipo: TIPO_BODEGA.MOVIL, idTecnico: tecnico.id })),
  ];

  const tecnicosDePlanta = new Set(
    contexto.tecnicos.filter((tecnico) => tecnico.tipo !== 'ruta').map((tecnico) => tecnico.id),
  );
  let moviles = 0;
  let bancos = 0;
  const nombreDeBodega = (bodega: ReferenciaBodega): string => {
    if (bodega.id === contexto.idBodegaCentral) return NOMBRE_BODEGA_CENTRAL;
    if (bodega.id === contexto.idBodegaPiezasSustituidas) return NOMBRE_BODEGA_PIEZAS;
    if (bodega.idTecnico !== null && tecnicosDePlanta.has(bodega.idTecnico)) {
      bancos += 1;
      return `Banco de taller ${String(bancos).padStart(2, '0')}`;
    }
    moviles += 1;
    return `Bodega movil ${String(moviles).padStart(2, '0')}`;
  };

  await copiarFilas(
    cliente,
    'bodega',
    ['id', 'id_centro', 'tipo', 'nombre', 'id_tecnico', 'activa', 'surte_repuestos'],
    bodegas.map((bodega) => [
      bodega.id, contexto.idCentro, bodega.tipo, nombreDeBodega(bodega),
      bodega.idTecnico, true,
      // La de piezas sustituidas guarda lo que se RETIRA de los aparatos:
      // no surte nada, y avisar de que «le faltan» piezas dañadas es ruido
      // que hace que se deje de leer el panel entero.
      bodega.id !== contexto.idBodegaPiezasSustituidas,
    ]),
  );
  contexto.bodegas = bodegas;

  const porNombre = new Map(contexto.marcas.map((marca) => [marca.nombre, marca.id]));
  const repuestos: ReferenciaRepuesto[] = [];
  const filasRepuesto: unknown[][] = [];

  for (const articulo of generarCatalogo(contexto.marcas.map((marca) => marca.nombre))) {
    const repuesto: ReferenciaRepuesto = {
      id: azar.uuid(),
      codigo: articulo.codigo,
      precio: azar.decimal(articulo.precioMinimo, articulo.precioMaximo),
      viaAbastecimiento: articulo.via,
    };
    repuestos.push(repuesto);
    filasRepuesto.push([
      repuesto.id, repuesto.codigo, articulo.descripcion,
      // Null cuando la pieza es universal: la marca la pone el articulo.
      articulo.marca === null ? null : porNombre.get(articulo.marca) ?? null,
      articulo.unidad, repuesto.precio, articulo.stockMinimo, repuesto.viaAbastecimiento, true,
    ]);
  }

  await copiarFilas(
    cliente,
    'repuesto',
    ['id', 'codigo', 'descripcion', 'id_marca', 'unidad_medida', 'precio', 'stock_minimo',
      'via_abastecimiento', 'activo'],
    filasRepuesto as never,
  );
  contexto.repuestos = repuestos;
}
