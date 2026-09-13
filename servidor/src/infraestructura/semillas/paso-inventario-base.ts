/**
 * Paso 5: bodegas y catalogo de repuestos.
 *
 * Bodegas: una central, una movil por cada tecnico de ruta (AD-05) y una
 * central separada para las piezas retiradas de los articulos. Esa ultima
 * existe para que las devoluciones de pieza sustituida (H7) no inflen la
 * existencia de repuesto util: lo retirado esta danado y no se vuelve a
 * instalar.
 *
 * Q12 sigue abierta: no hay catalogo corporativo confirmado, asi que los
 * codigos RPT-##### son sinteticos y estan pensados para ser reemplazados.
 */
import type { PoolClient } from 'pg';
import { CODIGO_ROL, TIPO_BODEGA, VIA_ABASTECIMIENTO } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import type { ContextoSiembra, ReferenciaBodega, ReferenciaRepuesto } from './contexto.js';

export const NOMBRE_BODEGA_CENTRAL = 'Bodega central';
export const NOMBRE_BODEGA_PIEZAS = 'Bodega de piezas sustituidas';

/** [familia, precio minimo, precio maximo, via de abastecimiento habitual] */
const FAMILIAS: readonly (readonly [string, number, number, string])[] = [
  ['Compresor hermetico', 3200, 9800, VIA_ABASTECIMIENTO.PEDIDO_PROVEEDOR],
  ['Tarjeta electronica de control', 2400, 7600, VIA_ABASTECIMIENTO.PEDIDO_PROVEEDOR],
  ['Termostato', 380, 1250, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Motor de ventilador', 850, 2600, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Bomba de desague', 620, 1900, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Banda de transmision', 180, 540, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Capacitor de arranque', 150, 480, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Resistencia calefactora', 420, 1400, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Sensor de temperatura', 240, 780, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Empaque de puerta', 560, 1850, VIA_ABASTECIMIENTO.PEDIDO_PROVEEDOR],
  ['Valvula solenoide', 480, 1600, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Filtro secador', 120, 380, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Gas refrigerante R-134a', 780, 1600, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Perilla de mando', 90, 260, VIA_ABASTECIMIENTO.COMPRA_LOCAL],
  ['Modulo de potencia inverter', 3600, 11200, VIA_ABASTECIMIENTO.PEDIDO_PROVEEDOR],
];

const CANTIDAD_REPUESTOS = 320;

export async function sembrarInventarioBase(cliente: PoolClient, contexto: ContextoSiembra): Promise<void> {
  const { azar } = contexto;

  const bodegas: ReferenciaBodega[] = [
    { id: contexto.idBodegaCentral, tipo: TIPO_BODEGA.CENTRAL, idTecnico: null },
    { id: contexto.idBodegaPiezasSustituidas, tipo: TIPO_BODEGA.CENTRAL, idTecnico: null },
    ...contexto.tecnicos
      .filter((tecnico) => tecnico.tipo === 'ruta')
      .map((tecnico) => ({ id: azar.uuid(), tipo: TIPO_BODEGA.MOVIL, idTecnico: tecnico.id })),
  ];

  const nombreDeBodega = (bodega: ReferenciaBodega, indice: number): string => {
    if (bodega.id === contexto.idBodegaCentral) return NOMBRE_BODEGA_CENTRAL;
    if (bodega.id === contexto.idBodegaPiezasSustituidas) return NOMBRE_BODEGA_PIEZAS;
    return `Bodega movil ${String(indice - 1).padStart(2, '0')}`;
  };

  await copiarFilas(
    cliente,
    'bodega',
    ['id', 'id_centro', 'tipo', 'nombre', 'id_tecnico', 'activa'],
    bodegas.map((bodega, indice) => [
      bodega.id, contexto.idCentro, bodega.tipo, nombreDeBodega(bodega, indice), bodega.idTecnico, true,
    ]),
  );
  contexto.bodegas = bodegas;

  const repuestos: ReferenciaRepuesto[] = [];
  const filasRepuesto: unknown[][] = [];
  for (let i = 0; i < CANTIDAD_REPUESTOS; i += 1) {
    const [familia, precioMinimo, precioMaximo, via] = FAMILIAS[i % FAMILIAS.length]!;
    const marca = contexto.marcas[i % contexto.marcas.length]!;
    const repuesto: ReferenciaRepuesto = {
      id: azar.uuid(),
      codigo: `RPT-${String(10_000 + i).padStart(5, '0')}`,
      precio: azar.decimal(precioMinimo, precioMaximo),
      viaAbastecimiento: via,
    };
    repuestos.push(repuesto);
    filasRepuesto.push([
      repuesto.id, repuesto.codigo, `${familia} ${marca.nombre} serie ${i % 40}`,
      marca.id, 'u', repuesto.precio, azar.entero(1, 6), repuesto.viaAbastecimiento, true,
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
