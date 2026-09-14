/**
 * Calendario laboral del centro.
 *
 * Nicaragua no cambia de hora en todo el ano, asi que basta un desfase fijo
 * respecto de UTC. Si alguna vez hubiera un centro en otro huso, el desfase
 * tendria que salir de `centro` y no de esta constante.
 */

/** Managua: UTC-6, sin horario de verano. */
export const DESFASE_MANAGUA_MINUTOS = -360;

export interface JornadaLaboral {
  /** 0 domingo … 6 sabado, como `calendario_laboral.dia_semana`. */
  readonly diaSemana: number;
  /** Minutos desde la medianoche local. 07:00 son 420. */
  readonly inicioMinutos: number;
  readonly finMinutos: number;
}

export interface CalendarioLaboral {
  readonly jornadas: readonly JornadaLaboral[];
  /** Fechas 'AAAA-MM-DD' locales en las que el centro no abre. */
  readonly diasNoLaborables: ReadonlySet<string>;
  readonly desfaseMinutos: number;
}

/** 'HH:MM' o 'HH:MM:SS' a minutos desde la medianoche. */
export function aMinutos(hora: string): number {
  const [horas, minutos] = hora.split(':');
  return Number(horas) * 60 + Number(minutos ?? 0);
}

export function construirCalendario(
  jornadas: readonly { diaSemana: number; horaInicio: string; horaFin: string }[],
  diasNoLaborables: readonly string[],
  desfaseMinutos = DESFASE_MANAGUA_MINUTOS,
): CalendarioLaboral {
  return {
    jornadas: jornadas
      .map((jornada) => ({
        diaSemana: jornada.diaSemana,
        inicioMinutos: aMinutos(jornada.horaInicio),
        finMinutos: aMinutos(jornada.horaFin),
      }))
      .filter((jornada) => jornada.finMinutos > jornada.inicioMinutos),
    diasNoLaborables: new Set(diasNoLaborables),
    desfaseMinutos,
  };
}

/** Instante UTC visto como si el reloj fuera el local del centro. */
export function aLocal(momento: Date, calendario: CalendarioLaboral): Date {
  return new Date(momento.getTime() + calendario.desfaseMinutos * 60_000);
}

export function aUtc(local: Date, calendario: CalendarioLaboral): Date {
  return new Date(local.getTime() - calendario.desfaseMinutos * 60_000);
}

/** 'AAAA-MM-DD' de un instante ya expresado en hora local. */
export function fechaLocal(local: Date): string {
  return local.toISOString().slice(0, 10);
}

/** Jornada del dia, o null si el centro no abre ese dia. */
export function jornadaDe(local: Date, calendario: CalendarioLaboral): JornadaLaboral | null {
  if (calendario.diasNoLaborables.has(fechaLocal(local))) return null;
  return calendario.jornadas.find((jornada) => jornada.diaSemana === local.getUTCDay()) ?? null;
}

export function minutosDelDia(local: Date): number {
  return local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60;
}

/** Medianoche local del dia siguiente. */
export function siguienteMedianoche(local: Date): Date {
  const siguiente = new Date(local.getTime());
  siguiente.setUTCHours(0, 0, 0, 0);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  return siguiente;
}

/** Ultimo instante del dia anterior, para recorrer hacia atras. */
export function anteriorMedianoche(local: Date): Date {
  const anterior = new Date(local.getTime());
  anterior.setUTCHours(0, 0, 0, 0);
  anterior.setUTCDate(anterior.getUTCDate() - 1);
  // 23:59:59.999 del dia anterior: dentro de ese dia, despues del cierre.
  return new Date(anterior.getTime() + 86_399_999);
}

export function conMinutosDelDia(local: Date, minutos: number): Date {
  const resultado = new Date(local.getTime());
  resultado.setUTCHours(0, 0, 0, 0);
  return new Date(resultado.getTime() + minutos * 60_000);
}
