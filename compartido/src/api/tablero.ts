/**
 * El tablero de inicio (pliego §42).
 *
 * Doce cifras, todas contadas sobre la base. NINGUNA es inventada ni
 * estimada: el pliego lo pide explicito —«no usar metricas ficticias»— y la
 * razon es practica, no formal. Una cifra inventada en la pantalla de inicio
 * es la que la jefatura mira todos los dias para decidir si manda a alguien
 * a trabajar el sabado.
 *
 * Cada cifra lleva su `enlace`: la tarjeta no es un adorno, es la puerta a la
 * lista que la explica. Un numero que no se puede abrir no sirve para actuar.
 */
export interface CifraDelTablero {
  readonly clave: string;
  readonly etiqueta: string;
  readonly valor: number;
  /** Lo que el numero significa, en una linea. */
  readonly explicacion: string;
  /** A donde lleva el clic, dentro del panel. Nulo si no hay lista que abrir. */
  readonly enlace: string | null;
  /** Para pintarla con el tono que le corresponde, nunca solo por color. */
  readonly tono: 'normal' | 'atencion' | 'critico';
}

/** Una linea del registro de actividad reciente. */
export interface ActividadReciente {
  readonly momento: string;
  readonly quien: string | null;
  readonly accion: string;
  readonly detalle: string;
  readonly enlace: string | null;
}

export interface Tablero {
  readonly calculadoEn: string;
  readonly cifras: readonly CifraDelTablero[];
  readonly actividad: readonly ActividadReciente[];
}
