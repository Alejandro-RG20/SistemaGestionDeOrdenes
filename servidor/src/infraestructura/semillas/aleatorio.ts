/**
 * Generador pseudoaleatorio deterministico (mulberry32).
 *
 * Con la misma semilla produce exactamente los mismos datos: dos siembras
 * son comparables y un fallo de prueba es reproducible. Nunca se usa
 * Math.random ni crypto.randomUUID en la siembra.
 */
export class Aleatorio {
  private estado: number;

  constructor(semilla: number) {
    this.estado = semilla >>> 0;
  }

  /** Numero en [0, 1). */
  siguiente(): number {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0;
    let t = this.estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** Entero en [minimo, maximo], ambos incluidos. */
  entero(minimo: number, maximo: number): number {
    return minimo + Math.floor(this.siguiente() * (maximo - minimo + 1));
  }

  decimal(minimo: number, maximo: number, decimales = 2): number {
    const valor = minimo + this.siguiente() * (maximo - minimo);
    const factor = 10 ** decimales;
    return Math.round(valor * factor) / factor;
  }

  booleano(probabilidad = 0.5): boolean {
    return this.siguiente() < probabilidad;
  }

  elegir<T>(lista: readonly T[]): T {
    if (lista.length === 0) throw new Error('No se puede elegir de una lista vacia.');
    return lista[this.entero(0, lista.length - 1)] as T;
  }

  /** Elige segun pesos relativos; los pesos no necesitan sumar 1. */
  elegirPonderado<T>(opciones: readonly (readonly [T, number])[]): T {
    const total = opciones.reduce((suma, [, peso]) => suma + peso, 0);
    let umbral = this.siguiente() * total;
    for (const [valor, peso] of opciones) {
      umbral -= peso;
      if (umbral <= 0) return valor;
    }
    return opciones[opciones.length - 1]![0];
  }

  /** Fisher-Yates sobre una copia; no altera la lista recibida. */
  barajar<T>(lista: readonly T[]): T[] {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i -= 1) {
      const j = this.entero(0, i);
      [copia[i], copia[j]] = [copia[j] as T, copia[i] as T];
    }
    return copia;
  }

  /** UUID con formato de version 4, derivado del generador deterministico. */
  uuid(): string {
    const hex: string[] = [];
    for (let i = 0; i < 16; i += 1) hex.push(this.entero(0, 255).toString(16).padStart(2, '0'));
    hex[6] = ((Number.parseInt(hex[6] as string, 16) & 0x0f) | 0x40).toString(16).padStart(2, '0');
    hex[8] = ((Number.parseInt(hex[8] as string, 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }

  fechaEntre(inicio: Date, fin: Date): Date {
    return new Date(inicio.getTime() + this.siguiente() * (fin.getTime() - inicio.getTime()));
  }
}

export function sumarHoras(fecha: Date, horas: number): Date {
  return new Date(fecha.getTime() + horas * 3_600_000);
}

export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86_400_000);
}

/** 'YYYY-MM-DD' en UTC, que es como se almacenan las columnas `date`. */
export function comoFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
