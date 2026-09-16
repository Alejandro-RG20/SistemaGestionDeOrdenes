/**
 * Contratos de los indicadores de operacion.
 *
 * Son los numeros con los que la jefatura decide: si el taller cumple lo
 * que promete, donde se atasca el trabajo, y que articulos vuelven.
 */

export interface ConteoPorEstado {
  readonly estado: string;
  readonly ordenes: number;
  readonly vencidas: number;
}

export interface CumplimientoDePlazo {
  readonly cerradas: number;
  readonly aTiempo: number;
  /** Porcentaje de ordenes cerradas dentro del plazo prometido. */
  readonly porcentaje: number;
  readonly vencidasAbiertas: number;
}

/** Donde se atasca el trabajo: horas laborables promedio por estado. */
export interface PermanenciaPorEstado {
  readonly estado: string;
  readonly ordenes: number;
  readonly horasPromedio: number;
}

export interface ProductividadDeTecnico {
  readonly idTecnico: string;
  readonly tecnico: string;
  readonly tipo: string;
  readonly ordenesCerradas: number;
  readonly enCurso: number;
  readonly vencidas: number;
  readonly horasPromedioCierre: number | null;
}

/**
 * RF-72: el mismo articulo vuelve al taller. Se cuenta por articulo, no por
 * cliente: es el aparato el que falla otra vez.
 */
export interface Reincidencia {
  readonly idArticulo: string;
  readonly articulo: string;
  readonly cliente: string;
  readonly ordenes: number;
  readonly ultimaOrden: number;
  readonly diasEntreUltimasDos: number | null;
}

export interface IndicadoresDeOperacion {
  readonly calculadoEn: string;
  readonly ordenesVivas: number;
  readonly porEstado: readonly ConteoPorEstado[];
  readonly cumplimiento: CumplimientoDePlazo;
  readonly permanencia: readonly PermanenciaPorEstado[];
  readonly tecnicos: readonly ProductividadDeTecnico[];
  readonly reincidencias: readonly Reincidencia[];
}
