/**
 * Paso 7: 5 000 articulos y las polizas extendidas de algunos.
 *
 * El articulo se reconoce por su numero de serie y acumula historial con
 * independencia de quien sea su dueno (RN-27). Una fraccion no tiene serie
 * legible (RF-77).
 */
import type { PoolClient } from 'pg';
import { CODIGO_ROL, TIPO_GARANTIA } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { comoFecha, sumarDias } from './aleatorio.js';
import { usuariosDe, type ContextoSiembra, type ReferenciaArticulo } from './contexto.js';

export const CANTIDAD_ARTICULOS = 5_000;

/** Proporcion de articulos comprados en cada tienda: el grupo domina. */
const PESO_TIENDA: Readonly<Record<string, number>> = {
  'La Curacao': 45,
  'Almacenes Tropigas': 28,
  RadioShack: 12,
  Externa: 15,
};

export async function sembrarArticulos(cliente: PoolClient, contexto: ContextoSiembra): Promise<void> {
  const { azar } = contexto;
  const agentes = usuariosDe(contexto, CODIGO_ROL.AGENTE_TELEFONIA);
  const pesosTienda = contexto.tiendas.map((t) => [t, PESO_TIENDA[t.nombre] ?? 10] as const);

  const articulos: ReferenciaArticulo[] = [];
  const filasArticulo: unknown[][] = [];
  const filasCobertura: unknown[][] = [];
  const seriesUsadas = new Set<string>();

  for (let i = 0; i < CANTIDAD_ARTICULOS; i += 1) {
    const id = azar.uuid();
    const duenio = azar.elegir(contexto.clientes);
    const marca = azar.elegir(contexto.marcas);
    const categoria = azar.elegir(contexto.categorias);
    const tienda = azar.elegirPonderado(pesosTienda);

    // Compras repartidas entre hace cuatro anios y hace un mes.
    const fechaCompra = azar.booleano(0.94)
      ? azar.fechaEntre(sumarDias(contexto.finVentana, -1_460), sumarDias(contexto.finVentana, -30))
      : null;

    const sinSerieLegible = azar.booleano(0.06);
    let numeroSerie: string | null = null;
    if (!sinSerieLegible) {
      do {
        numeroSerie = `${marca.nombre.slice(0, 3).toUpperCase()}${azar.entero(100_000_000, 999_999_999)}`;
      } while (seriesUsadas.has(numeroSerie));
      seriesUsadas.add(numeroSerie);
    }

    // Poliza extendida: la contrata el cliente y acompana al contratante (RN-28).
    let tienePolizaVigente = false;
    if (fechaCompra !== null && azar.booleano(0.16)) {
      const desde = sumarDias(fechaCompra, 365);
      const hasta = sumarDias(desde, azar.elegir([365, 730]));
      tienePolizaVigente = hasta.getTime() > contexto.finVentana.getTime() && desde.getTime() <= contexto.finVentana.getTime();
      filasCobertura.push([
        azar.uuid(), id, TIPO_GARANTIA.ADICIONAL, comoFecha(desde), comoFecha(hasta),
        `POL-${azar.entero(100_000, 999_999)}`, duenio.id, true, azar.elegir(agentes).id,
      ]);
    }

    filasArticulo.push([
      id, duenio.id, marca.id, categoria.id, tienda.id,
      `${marca.nombre.slice(0, 2).toUpperCase()}-${azar.entero(1000, 9999)}`,
      numeroSerie, sinSerieLegible,
      fechaCompra === null ? null : comoFecha(fechaCompra),
      fechaCompra === null ? null : `FAC-${azar.entero(100_000, 999_999)}`,
      true, azar.elegir(agentes).id,
    ]);

    articulos.push({
      id, idCliente: duenio.id, idMarca: marca.id, idCategoria: categoria.id,
      idTienda: tienda.id, fechaCompra, tienePolizaVigente,
    });
  }

  await copiarFilas(
    cliente,
    'articulo',
    ['id', 'id_cliente', 'id_marca', 'id_categoria', 'id_tienda_origen', 'modelo', 'numero_serie',
      'sin_serie_legible', 'fecha_compra', 'factura_referencia', 'activo', 'creado_por'],
    filasArticulo as never,
  );
  await copiarFilas(
    cliente,
    'cobertura',
    ['id', 'id_articulo', 'tipo', 'vigente_desde', 'vigente_hasta', 'documento_respaldo',
      'id_cliente_contratante', 'activa', 'creado_por'],
    filasCobertura as never,
  );

  contexto.articulos = articulos;
}
