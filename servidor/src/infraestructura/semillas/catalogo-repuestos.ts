/**
 * Catalogo de repuestos del taller.
 *
 * Esto es lo que ServiTotal realmente repone: las piezas que se cambian en
 * los articulos que La Curacao, Almacenes Tropigas y RadioShack venden en
 * Nicaragua. No es una lista decorativa; de ella dependen tres cosas del
 * negocio:
 *
 *  1. QUE SE PUEDE ARREGLAR HOY. Una pieza de compra local se consigue en
 *     Managua en el dia; una de pedido a proveedor se importa y tarda
 *     semanas. Por eso la via de abastecimiento no es un adorno: decide si
 *     la orden pasa a `en_reparacion` o se queda en `esperando_repuesto`, y
 *     eso mueve el plazo que se le prometio al cliente.
 *  2. QUE SE LE RECLAMA A LA MARCA. Un repuesto de marca identifica al
 *     fabricante en el expediente de cobro. Uno universal —un capacitor, una
 *     manguera— no lo identifica, y ahi la marca la pone el articulo.
 *  3. CUANTO SE INMOVILIZA EN BODEGA. El minimo de una tarjeta importada de
 *     C$7000 no puede ser el mismo que el de un empaque de C$300.
 *
 * SOBRE EL ORIGEN DE ESTOS DATOS. El corporativo no entrego un catalogo de
 * SKU propio (la pregunta quedo abierta desde la etapa 1). Lo que hay aqui
 * son las familias de pieza que un taller de linea blanca, aire y
 * electronica cambia de verdad, con precios de referencia del mercado
 * nicaraguense en cordobas. Cuando el corporativo entregue su codificacion,
 * ESTE ARCHIVO es lo unico que cambia: el codigo que genera es el que viaja
 * a `repuesto.codigo` y nada mas lo interpreta.
 *
 * SOBRE LOS CODIGOS. `REF-CMP-001` se lee sin manual: categoria, familia,
 * correlativo. Un bodeguero que busca "todos los compresores de
 * refrigeracion" filtra por `REF-CMP`. Un correlativo plano —RPT-10284— no
 * dice nada y obliga a consultar la pantalla para saber que se tiene en la
 * mano.
 */

import { VIA_ABASTECIMIENTO } from '@servitotal/compartido';

/** Prefijo de categoria. Casa con `categoria_articulo.nombre`. */
export const PREFIJO_CATEGORIA: Readonly<Record<string, string>> = {
  refrigeracion: 'REF',
  lavado: 'LAV',
  cocina: 'COC',
  aire_acondicionado: 'AIR',
  audio_video: 'AUV',
  computo: 'COM',
  pequenos_electrodomesticos: 'PEQ',
};

export interface FamiliaDeRepuesto {
  /** Categoria de articulo a la que sirve. */
  readonly categoria: string;
  /** Tres letras para el codigo. Unico dentro de la categoria. */
  readonly sigla: string;
  readonly descripcion: string;
  readonly precioMinimo: number;
  readonly precioMaximo: number;
  readonly via: string;
  /**
   * Una pieza universal sirva la marca que sirva: capacitores, mangueras,
   * gas, baterias genericas. Se cataloga UNA vez y sin marca. Una pieza de
   * marca se cataloga una vez POR MARCA, porque una tarjeta de LG no entra
   * en una Mabe y pedirla mal cuesta dos semanas.
   */
  readonly universal: boolean;
  /** Stock minimo en la bodega central. */
  readonly stockMinimo: number;
  readonly unidad?: string;
}

const LOCAL = VIA_ABASTECIMIENTO.COMPRA_LOCAL;
const PEDIDO = VIA_ABASTECIMIENTO.PEDIDO_PROVEEDOR;

export const FAMILIAS: readonly FamiliaDeRepuesto[] = [
  // ── refrigeracion ────────────────────────────────────────────────────
  { categoria: 'refrigeracion', sigla: 'CMP', descripcion: 'Compresor hermetico', precioMinimo: 3200, precioMaximo: 9800, via: PEDIDO, universal: false, stockMinimo: 1 },
  { categoria: 'refrigeracion', sigla: 'TAR', descripcion: 'Tarjeta electronica de control', precioMinimo: 2400, precioMaximo: 7600, via: PEDIDO, universal: false, stockMinimo: 1 },
  { categoria: 'refrigeracion', sigla: 'TER', descripcion: 'Termostato', precioMinimo: 380, precioMaximo: 1250, via: LOCAL, universal: false, stockMinimo: 4 },
  { categoria: 'refrigeracion', sigla: 'EMP', descripcion: 'Empaque de puerta', precioMinimo: 560, precioMaximo: 1850, via: PEDIDO, universal: false, stockMinimo: 2 },
  { categoria: 'refrigeracion', sigla: 'MTV', descripcion: 'Motor de ventilador del evaporador', precioMinimo: 850, precioMaximo: 2600, via: LOCAL, universal: false, stockMinimo: 3 },
  { categoria: 'refrigeracion', sigla: 'RDH', descripcion: 'Resistencia de deshielo', precioMinimo: 420, precioMaximo: 1400, via: LOCAL, universal: false, stockMinimo: 4 },
  { categoria: 'refrigeracion', sigla: 'REL', descripcion: 'Rele de arranque', precioMinimo: 180, precioMaximo: 620, via: LOCAL, universal: true, stockMinimo: 10 },
  { categoria: 'refrigeracion', sigla: 'FIL', descripcion: 'Filtro secador', precioMinimo: 120, precioMaximo: 380, via: LOCAL, universal: true, stockMinimo: 12 },
  { categoria: 'refrigeracion', sigla: 'G34', descripcion: 'Gas refrigerante R-134a', precioMinimo: 780, precioMaximo: 1600, via: LOCAL, universal: true, stockMinimo: 6, unidad: 'lb' },
  { categoria: 'refrigeracion', sigla: 'G60', descripcion: 'Gas refrigerante R-600a', precioMinimo: 950, precioMaximo: 1900, via: LOCAL, universal: true, stockMinimo: 4, unidad: 'lb' },
  { categoria: 'refrigeracion', sigla: 'TRM', descripcion: 'Termistor de cabina', precioMinimo: 240, precioMaximo: 780, via: LOCAL, universal: true, stockMinimo: 8 },

  // ── lavado ───────────────────────────────────────────────────────────
  { categoria: 'lavado', sigla: 'TAR', descripcion: 'Tarjeta electronica de control', precioMinimo: 2200, precioMaximo: 6800, via: PEDIDO, universal: false, stockMinimo: 1 },
  { categoria: 'lavado', sigla: 'MTL', descripcion: 'Motor de lavado', precioMinimo: 2600, precioMaximo: 7400, via: PEDIDO, universal: false, stockMinimo: 1 },
  { categoria: 'lavado', sigla: 'TRN', descripcion: 'Transmision', precioMinimo: 1800, precioMaximo: 5200, via: PEDIDO, universal: false, stockMinimo: 1 },
  { categoria: 'lavado', sigla: 'BDS', descripcion: 'Bomba de desague', precioMinimo: 620, precioMaximo: 1900, via: LOCAL, universal: false, stockMinimo: 4 },
  { categoria: 'lavado', sigla: 'VSE', descripcion: 'Valvula solenoide de entrada', precioMinimo: 480, precioMaximo: 1600, via: LOCAL, universal: false, stockMinimo: 5 },
  { categoria: 'lavado', sigla: 'ACP', descripcion: 'Acople de transmision', precioMinimo: 260, precioMaximo: 720, via: LOCAL, universal: true, stockMinimo: 10 },
  { categoria: 'lavado', sigla: 'BND', descripcion: 'Banda de transmision', precioMinimo: 180, precioMaximo: 540, via: LOCAL, universal: true, stockMinimo: 12 },
  { categoria: 'lavado', sigla: 'SWT', descripcion: 'Interruptor de tapa', precioMinimo: 220, precioMaximo: 680, via: LOCAL, universal: false, stockMinimo: 6 },
  { categoria: 'lavado', sigla: 'RDM', descripcion: 'Rodamiento de tambor', precioMinimo: 680, precioMaximo: 2200, via: PEDIDO, universal: false, stockMinimo: 2 },
  { categoria: 'lavado', sigla: 'MDS', descripcion: 'Manguera de desague', precioMinimo: 150, precioMaximo: 420, via: LOCAL, universal: true, stockMinimo: 12 },
  { categoria: 'lavado', sigla: 'AMT', descripcion: 'Amortiguador de suspension', precioMinimo: 340, precioMaximo: 980, via: LOCAL, universal: false, stockMinimo: 4 },

  // ── cocina ───────────────────────────────────────────────────────────
  { categoria: 'cocina', sigla: 'QMD', descripcion: 'Quemador', precioMinimo: 320, precioMaximo: 1100, via: LOCAL, universal: false, stockMinimo: 6 },
  { categoria: 'cocina', sigla: 'VGS', descripcion: 'Valvula de gas', precioMinimo: 380, precioMaximo: 1250, via: LOCAL, universal: false, stockMinimo: 5 },
  { categoria: 'cocina', sigla: 'TPR', descripcion: 'Termopar de seguridad', precioMinimo: 180, precioMaximo: 520, via: LOCAL, universal: true, stockMinimo: 12 },
  { categoria: 'cocina', sigla: 'ENC', descripcion: 'Encendedor piezoelectrico', precioMinimo: 220, precioMaximo: 680, via: LOCAL, universal: true, stockMinimo: 10 },
  { categoria: 'cocina', sigla: 'INY', descripcion: 'Juego de inyectores', precioMinimo: 140, precioMaximo: 460, via: LOCAL, universal: false, stockMinimo: 8 },
  { categoria: 'cocina', sigla: 'RHN', descripcion: 'Resistencia de horno', precioMinimo: 560, precioMaximo: 1800, via: LOCAL, universal: false, stockMinimo: 3 },
  { categoria: 'cocina', sigla: 'PER', descripcion: 'Perilla de mando', precioMinimo: 90, precioMaximo: 260, via: LOCAL, universal: false, stockMinimo: 15 },
  { categoria: 'cocina', sigla: 'BIS', descripcion: 'Bisagra de puerta de horno', precioMinimo: 280, precioMaximo: 860, via: LOCAL, universal: false, stockMinimo: 4 },
  { categoria: 'cocina', sigla: 'RGL', descripcion: 'Regulador de gas', precioMinimo: 320, precioMaximo: 780, via: LOCAL, universal: true, stockMinimo: 8 },

  // ── aire acondicionado ───────────────────────────────────────────────
  { categoria: 'aire_acondicionado', sigla: 'CMR', descripcion: 'Compresor rotativo', precioMinimo: 4200, precioMaximo: 12800, via: PEDIDO, universal: false, stockMinimo: 1 },
  { categoria: 'aire_acondicionado', sigla: 'MIV', descripcion: 'Modulo de potencia inverter', precioMinimo: 3600, precioMaximo: 11200, via: PEDIDO, universal: false, stockMinimo: 1 },
  { categoria: 'aire_acondicionado', sigla: 'TAR', descripcion: 'Tarjeta electronica de control', precioMinimo: 2400, precioMaximo: 7800, via: PEDIDO, universal: false, stockMinimo: 1 },
  { categoria: 'aire_acondicionado', sigla: 'MTV', descripcion: 'Motor de ventilador', precioMinimo: 980, precioMaximo: 3200, via: LOCAL, universal: false, stockMinimo: 3 },
  { categoria: 'aire_acondicionado', sigla: 'CAP', descripcion: 'Capacitor de arranque', precioMinimo: 150, precioMaximo: 480, via: LOCAL, universal: true, stockMinimo: 15 },
  { categoria: 'aire_acondicionado', sigla: 'CTR', descripcion: 'Control remoto', precioMinimo: 280, precioMaximo: 920, via: LOCAL, universal: false, stockMinimo: 6 },
  { categoria: 'aire_acondicionado', sigla: 'SNT', descripcion: 'Sensor de temperatura', precioMinimo: 240, precioMaximo: 780, via: LOCAL, universal: true, stockMinimo: 10 },
  { categoria: 'aire_acondicionado', sigla: 'VEX', descripcion: 'Valvula de expansion', precioMinimo: 680, precioMaximo: 2100, via: PEDIDO, universal: false, stockMinimo: 2 },
  { categoria: 'aire_acondicionado', sigla: 'G41', descripcion: 'Gas refrigerante R-410A', precioMinimo: 1100, precioMaximo: 2400, via: LOCAL, universal: true, stockMinimo: 6, unidad: 'lb' },
  { categoria: 'aire_acondicionado', sigla: 'TRB', descripcion: 'Turbina de evaporador', precioMinimo: 520, precioMaximo: 1700, via: LOCAL, universal: false, stockMinimo: 3 },
  { categoria: 'aire_acondicionado', sigla: 'BCN', descripcion: 'Bomba de condensado', precioMinimo: 620, precioMaximo: 1800, via: LOCAL, universal: true, stockMinimo: 5 },

  // ── audio y video ────────────────────────────────────────────────────
  { categoria: 'audio_video', sigla: 'PNL', descripcion: 'Panel de pantalla LED', precioMinimo: 4800, precioMaximo: 16500, via: PEDIDO, universal: false, stockMinimo: 0 },
  { categoria: 'audio_video', sigla: 'MAI', descripcion: 'Tarjeta principal', precioMinimo: 1800, precioMaximo: 6400, via: PEDIDO, universal: false, stockMinimo: 1 },
  { categoria: 'audio_video', sigla: 'FTE', descripcion: 'Tarjeta de fuente de poder', precioMinimo: 980, precioMaximo: 3200, via: PEDIDO, universal: false, stockMinimo: 2 },
  { categoria: 'audio_video', sigla: 'TCN', descripcion: 'Tarjeta T-CON', precioMinimo: 760, precioMaximo: 2600, via: PEDIDO, universal: false, stockMinimo: 1 },
  { categoria: 'audio_video', sigla: 'BKL', descripcion: 'Juego de tiras de retroiluminacion', precioMinimo: 620, precioMaximo: 2200, via: LOCAL, universal: false, stockMinimo: 3 },
  { categoria: 'audio_video', sigla: 'CTR', descripcion: 'Control remoto', precioMinimo: 220, precioMaximo: 780, via: LOCAL, universal: false, stockMinimo: 8 },
  { categoria: 'audio_video', sigla: 'PRL', descripcion: 'Juego de parlantes', precioMinimo: 340, precioMaximo: 1100, via: LOCAL, universal: false, stockMinimo: 4 },
  { categoria: 'audio_video', sigla: 'BSE', descripcion: 'Base de mesa', precioMinimo: 280, precioMaximo: 880, via: LOCAL, universal: false, stockMinimo: 4 },

  // ── computo ──────────────────────────────────────────────────────────
  // Todo universal a proposito: el taller repone con repuesto generico o
  // compatible, no con SKU del fabricante del portatil.
  { categoria: 'computo', sigla: 'BAT', descripcion: 'Bateria de portatil compatible', precioMinimo: 1200, precioMaximo: 3400, via: LOCAL, universal: true, stockMinimo: 5 },
  { categoria: 'computo', sigla: 'CRG', descripcion: 'Cargador universal', precioMinimo: 680, precioMaximo: 1800, via: LOCAL, universal: true, stockMinimo: 8 },
  { categoria: 'computo', sigla: 'TCL', descripcion: 'Teclado de reemplazo', precioMinimo: 620, precioMaximo: 1900, via: LOCAL, universal: true, stockMinimo: 6 },
  { categoria: 'computo', sigla: 'LCD', descripcion: 'Pantalla LCD de portatil', precioMinimo: 2200, precioMaximo: 6800, via: PEDIDO, universal: true, stockMinimo: 1 },
  { categoria: 'computo', sigla: 'SSD', descripcion: 'Unidad de estado solido', precioMinimo: 1400, precioMaximo: 4200, via: LOCAL, universal: true, stockMinimo: 6 },
  { categoria: 'computo', sigla: 'RAM', descripcion: 'Modulo de memoria RAM', precioMinimo: 980, precioMaximo: 3200, via: LOCAL, universal: true, stockMinimo: 8 },
  { categoria: 'computo', sigla: 'VNT', descripcion: 'Ventilador disipador', precioMinimo: 420, precioMaximo: 1300, via: LOCAL, universal: true, stockMinimo: 6 },

  // ── pequenos electrodomesticos ───────────────────────────────────────
  { categoria: 'pequenos_electrodomesticos', sigla: 'MTU', descripcion: 'Motor universal', precioMinimo: 380, precioMaximo: 1200, via: LOCAL, universal: false, stockMinimo: 5 },
  { categoria: 'pequenos_electrodomesticos', sigla: 'JRR', descripcion: 'Jarra de vidrio', precioMinimo: 260, precioMaximo: 820, via: LOCAL, universal: false, stockMinimo: 8 },
  { categoria: 'pequenos_electrodomesticos', sigla: 'CCH', descripcion: 'Juego de cuchillas', precioMinimo: 180, precioMaximo: 620, via: LOCAL, universal: false, stockMinimo: 10 },
  { categoria: 'pequenos_electrodomesticos', sigla: 'ACO', descripcion: 'Base acopladora', precioMinimo: 120, precioMaximo: 380, via: LOCAL, universal: false, stockMinimo: 12 },
  { categoria: 'pequenos_electrodomesticos', sigla: 'RES', descripcion: 'Resistencia', precioMinimo: 220, precioMaximo: 740, via: LOCAL, universal: false, stockMinimo: 8 },
  { categoria: 'pequenos_electrodomesticos', sigla: 'INT', descripcion: 'Interruptor', precioMinimo: 90, precioMaximo: 290, via: LOCAL, universal: true, stockMinimo: 20 },
  { categoria: 'pequenos_electrodomesticos', sigla: 'CBL', descripcion: 'Cable de alimentacion', precioMinimo: 110, precioMaximo: 320, via: LOCAL, universal: true, stockMinimo: 20 },
];

/**
 * Que categorias fabrica cada marca.
 *
 * Existe para que el catalogo no invente un compresor Sony ni una tarjeta
 * de television Oster. Pedir un repuesto que el fabricante no hace es una
 * orden parada dos semanas por nada.
 */
export const CATEGORIAS_POR_MARCA: Readonly<Record<string, readonly string[]>> = {
  Whirlpool: ['refrigeracion', 'lavado', 'cocina'],
  Mabe: ['refrigeracion', 'lavado', 'cocina'],
  Electrolux: ['refrigeracion', 'lavado', 'cocina'],
  Frigidaire: ['refrigeracion', 'lavado', 'cocina', 'aire_acondicionado'],
  Indurama: ['refrigeracion', 'lavado', 'cocina'],
  LG: ['refrigeracion', 'lavado', 'aire_acondicionado', 'audio_video'],
  Samsung: ['refrigeracion', 'lavado', 'aire_acondicionado', 'audio_video'],
  Hisense: ['refrigeracion', 'aire_acondicionado', 'audio_video'],
  Midea: ['refrigeracion', 'aire_acondicionado', 'lavado'],
  Sony: ['audio_video'],
  Panasonic: ['audio_video', 'aire_acondicionado'],
  Sankey: ['refrigeracion', 'cocina', 'audio_video', 'pequenos_electrodomesticos'],
  Atlas: ['refrigeracion', 'cocina', 'lavado', 'pequenos_electrodomesticos'],
  Oster: ['pequenos_electrodomesticos'],
};

export interface RepuestoDeCatalogo {
  readonly codigo: string;
  readonly descripcion: string;
  /** Null si la pieza es universal. */
  readonly marca: string | null;
  readonly categoria: string;
  readonly precioMinimo: number;
  readonly precioMaximo: number;
  readonly via: string;
  readonly stockMinimo: number;
  readonly unidad: string;
}

/**
 * Despliega las familias en SKU concretos.
 *
 * Una familia universal da UN repuesto; una de marca da uno por cada marca
 * que fabrica esa categoria. El correlativo se asigna dentro de la familia,
 * en el orden de las marcas, para que el codigo sea estable entre siembras.
 */
export function generarCatalogo(marcas: readonly string[]): RepuestoDeCatalogo[] {
  const catalogo: RepuestoDeCatalogo[] = [];

  for (const familia of FAMILIAS) {
    const prefijo = PREFIJO_CATEGORIA[familia.categoria];
    if (prefijo === undefined) {
      throw new Error(
        `La familia ${familia.sigla} declara la categoria "${familia.categoria}", ` +
        'que no esta en PREFIJO_CATEGORIA.',
      );
    }
    const base = {
      categoria: familia.categoria,
      precioMinimo: familia.precioMinimo,
      precioMaximo: familia.precioMaximo,
      via: familia.via,
      stockMinimo: familia.stockMinimo,
      unidad: familia.unidad ?? 'u',
    };

    if (familia.universal) {
      catalogo.push({
        ...base,
        codigo: `${prefijo}-${familia.sigla}-001`,
        // El sufijo solo cuando la descripcion no lo dice ya: en la lista
        // del tecnico, "Cargador universal (universal)" es ruido.
        descripcion: /universal|compatible/i.test(familia.descripcion)
          ? familia.descripcion
          : `${familia.descripcion} (universal)`,
        marca: null,
      });
      continue;
    }

    let correlativo = 0;
    for (const marca of marcas) {
      const categorias = CATEGORIAS_POR_MARCA[marca] ?? [];
      if (!categorias.includes(familia.categoria)) continue;
      correlativo += 1;
      catalogo.push({
        ...base,
        codigo: `${prefijo}-${familia.sigla}-${String(correlativo).padStart(3, '0')}`,
        descripcion: `${familia.descripcion} ${marca}`,
        marca,
      });
    }
  }

  return catalogo;
}
