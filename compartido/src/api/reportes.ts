/**
 * Contratos de los reportes (RF-51).
 *
 * UN SOLO ENDPOINT, NO DIECISIETE. Todos los reportes devuelven lo mismo
 * —filas con columnas tipadas y sus totales— y eso permite que el panel
 * tenga UNA pantalla que los dibuja todos y que agregar un reporte sea
 * agregar una consulta, no una pantalla.
 *
 * Las columnas viajan CON los datos, con su tipo, porque el panel no puede
 * adivinar si «4850» son cordobas, dias u ordenes, y formatear mal un
 * numero en un reporte que alguien va a defender ante la jefatura es peor
 * que no mostrarlo.
 */

export const TIPO_COLUMNA = {
  TEXTO: 'texto',
  NUMERO: 'numero',
  DINERO: 'dinero',
  PORCENTAJE: 'porcentaje',
  FECHA: 'fecha',
  HORAS: 'horas',
} as const;
export type TipoColumna = (typeof TIPO_COLUMNA)[keyof typeof TIPO_COLUMNA];

export interface ColumnaDeReporte {
  readonly clave: string;
  readonly etiqueta: string;
  readonly tipo: TipoColumna;
}

export interface DefinicionDeReporte {
  readonly clave: string;
  readonly titulo: string;
  /** Que pregunta contesta. Un reporte sin esto nadie sabe cuando usarlo. */
  readonly proposito: string;
  readonly grupo: 'operacion' | 'tecnico' | 'inventario' | 'dinero';
  /** Si admite el filtro de fechas. Los de existencia son una foto de hoy. */
  readonly admiteRango: boolean;
}

export interface ResultadoDeReporte {
  readonly clave: string;
  readonly titulo: string;
  readonly generadoEn: string;
  readonly desde: string | null;
  readonly hasta: string | null;
  readonly columnas: readonly ColumnaDeReporte[];
  readonly filas: readonly Record<string, string | number | null>[];
  /** Fila de totales, cuando sumar tiene sentido. */
  readonly totales: Record<string, string | number | null> | null;
  /** Lo que hay que saber para no leer mal el resultado. */
  readonly advertencia: string | null;
}
