/**
 * Datos de la matriz de evidencia y de las plantillas de diagnostico.
 * Separados del paso que los inserta para que cada archivo haga una cosa.
 */
import { MOMENTO_EVIDENCIA, TIPO_CAMPO_CHECKLIST, TIPO_GARANTIA } from '@servitotal/compartido';

export interface DefinicionReglaEvidencia {
  readonly tipo: string;
  readonly categoria: string | null;
  readonly momento: string;
  readonly clave: string;
  readonly etiqueta: string;
  readonly obligatoria: boolean;
}

const TODOS_LOS_TIPOS = [
  TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.ADICIONAL,
  TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.POR_VALIDAR,
] as const;

/** Evidencia que se exige a cualquier orden, sea cual sea la cobertura. */
const COMUNES: readonly (readonly [string, string, string, boolean])[] = [
  [MOMENTO_EVIDENCIA.RECEPCION, 'foto_articulo', 'Fotografia del articulo completo', true],
  [MOMENTO_EVIDENCIA.RECEPCION, 'foto_placa_serie', 'Fotografia de la placa con el numero de serie', true],
  [MOMENTO_EVIDENCIA.DIAGNOSTICO, 'foto_falla', 'Fotografia del componente con la falla', true],
  [MOMENTO_EVIDENCIA.ENTREGA, 'firma_cliente', 'Firma de conformidad del cliente', true],
  [MOMENTO_EVIDENCIA.ENTREGA, 'foto_entrega', 'Fotografia del articulo entregado', false],
];

/** Evidencia adicional segun quien paga la reparacion. */
const POR_TIPO: readonly DefinicionReglaEvidencia[] = [
  { tipo: TIPO_GARANTIA.PROVEEDOR, categoria: null, momento: MOMENTO_EVIDENCIA.VALIDACION_GARANTIA,
    clave: 'factura_compra', etiqueta: 'Factura de compra legible', obligatoria: true },
  { tipo: TIPO_GARANTIA.PROVEEDOR, categoria: null, momento: MOMENTO_EVIDENCIA.DIAGNOSTICO,
    clave: 'informe_tecnico', etiqueta: 'Informe tecnico para el fabricante', obligatoria: true },
  { tipo: TIPO_GARANTIA.PROVEEDOR, categoria: null, momento: MOMENTO_EVIDENCIA.REPARACION,
    clave: 'foto_pieza_sustituida', etiqueta: 'Fotografia de la pieza retirada', obligatoria: true },
  { tipo: TIPO_GARANTIA.ADICIONAL, categoria: null, momento: MOMENTO_EVIDENCIA.VALIDACION_GARANTIA,
    clave: 'poliza_extendida', etiqueta: 'Poliza extendida vigente', obligatoria: true },
  { tipo: TIPO_GARANTIA.ADICIONAL, categoria: null, momento: MOMENTO_EVIDENCIA.REPARACION,
    clave: 'foto_pieza_sustituida', etiqueta: 'Fotografia de la pieza retirada', obligatoria: true },
  { tipo: TIPO_GARANTIA.PARTICULAR, categoria: null, momento: MOMENTO_EVIDENCIA.DIAGNOSTICO,
    clave: 'firma_cotizacion', etiqueta: 'Aceptacion firmada de la cotizacion', obligatoria: true },
  { tipo: TIPO_GARANTIA.POR_VALIDAR, categoria: null, momento: MOMENTO_EVIDENCIA.VALIDACION_GARANTIA,
    clave: 'factura_compra', etiqueta: 'Factura de compra legible', obligatoria: false },
];

/** Evidencia que depende de la categoria del articulo. */
const POR_CATEGORIA: readonly DefinicionReglaEvidencia[] = TODOS_LOS_TIPOS.flatMap((tipo) => [
  { tipo, categoria: 'aire_acondicionado', momento: MOMENTO_EVIDENCIA.DIAGNOSTICO,
    clave: 'medicion_presion', etiqueta: 'Medicion de presion del sistema', obligatoria: true },
  { tipo, categoria: 'refrigeracion', momento: MOMENTO_EVIDENCIA.DIAGNOSTICO,
    clave: 'medicion_temperatura', etiqueta: 'Medicion de temperatura de gabinete', obligatoria: true },
]);

export const REGLAS_EVIDENCIA: readonly DefinicionReglaEvidencia[] = [
  ...TODOS_LOS_TIPOS.flatMap((tipo) =>
    COMUNES.map(([momento, clave, etiqueta, obligatoria]) => ({
      tipo, categoria: null, momento, clave, etiqueta, obligatoria,
    })),
  ),
  ...POR_TIPO,
  ...POR_CATEGORIA,
];

export interface DefinicionItemPlantilla {
  readonly etiqueta: string;
  readonly tipoCampo: string;
  readonly unidad?: string;
  readonly rangoMin?: number;
  readonly rangoMax?: number;
}

export interface DefinicionPlantilla {
  readonly categoria: string;
  readonly items: readonly DefinicionItemPlantilla[];
}

export const PLANTILLAS_DIAGNOSTICO: readonly DefinicionPlantilla[] = [
  {
    categoria: 'refrigeracion',
    items: [
      { etiqueta: 'Temperatura del congelador', tipoCampo: TIPO_CAMPO_CHECKLIST.NUMERICO, unidad: 'C', rangoMin: -22, rangoMax: -14 },
      { etiqueta: 'Temperatura del gabinete', tipoCampo: TIPO_CAMPO_CHECKLIST.NUMERICO, unidad: 'C', rangoMin: 2, rangoMax: 8 },
      { etiqueta: 'Corriente del compresor', tipoCampo: TIPO_CAMPO_CHECKLIST.NUMERICO, unidad: 'A', rangoMin: 0.8, rangoMax: 2.5 },
      { etiqueta: 'Empaque de puerta en buen estado', tipoCampo: TIPO_CAMPO_CHECKLIST.BOOLEANO },
      { etiqueta: 'Observaciones del tecnico', tipoCampo: TIPO_CAMPO_CHECKLIST.TEXTO },
    ],
  },
  {
    categoria: 'aire_acondicionado',
    items: [
      { etiqueta: 'Presion de succion', tipoCampo: TIPO_CAMPO_CHECKLIST.NUMERICO, unidad: 'psi', rangoMin: 55, rangoMax: 75 },
      { etiqueta: 'Presion de descarga', tipoCampo: TIPO_CAMPO_CHECKLIST.NUMERICO, unidad: 'psi', rangoMin: 200, rangoMax: 280 },
      { etiqueta: 'Delta de temperatura', tipoCampo: TIPO_CAMPO_CHECKLIST.NUMERICO, unidad: 'C', rangoMin: 8, rangoMax: 14 },
      { etiqueta: 'Filtro limpio', tipoCampo: TIPO_CAMPO_CHECKLIST.SELECCION },
    ],
  },
  {
    categoria: 'lavado',
    items: [
      { etiqueta: 'Tiempo de llenado', tipoCampo: TIPO_CAMPO_CHECKLIST.NUMERICO, unidad: 's', rangoMin: 60, rangoMax: 240 },
      { etiqueta: 'Velocidad de centrifugado', tipoCampo: TIPO_CAMPO_CHECKLIST.NUMERICO, unidad: 'rpm', rangoMin: 600, rangoMax: 1200 },
      { etiqueta: 'Desagua por completo', tipoCampo: TIPO_CAMPO_CHECKLIST.BOOLEANO },
      { etiqueta: 'Estado de la banda', tipoCampo: TIPO_CAMPO_CHECKLIST.SELECCION },
    ],
  },
  {
    categoria: 'cocina',
    items: [
      { etiqueta: 'Presion de gas de entrada', tipoCampo: TIPO_CAMPO_CHECKLIST.NUMERICO, unidad: 'psi', rangoMin: 8, rangoMax: 14 },
      { etiqueta: 'Encendido de todos los quemadores', tipoCampo: TIPO_CAMPO_CHECKLIST.BOOLEANO },
      { etiqueta: 'Fuga detectada', tipoCampo: TIPO_CAMPO_CHECKLIST.BOOLEANO },
    ],
  },
  {
    categoria: 'audio_video',
    items: [
      { etiqueta: 'Voltaje de la fuente', tipoCampo: TIPO_CAMPO_CHECKLIST.NUMERICO, unidad: 'V', rangoMin: 110, rangoMax: 130 },
      { etiqueta: 'Panel sin lineas ni manchas', tipoCampo: TIPO_CAMPO_CHECKLIST.BOOLEANO },
      { etiqueta: 'Observaciones del tecnico', tipoCampo: TIPO_CAMPO_CHECKLIST.TEXTO },
    ],
  },
];
