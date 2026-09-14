/**
 * Conteo de plazos en HORAS LABORABLES, no corridas.
 *
 * Es la diferencia entre un panel que sirve y uno que el taller ignora: una
 * orden recibida el sabado a las 16:00 con plazo de ocho horas no puede
 * aparecer vencida el lunes por la manana, porque el centro estuvo cerrado
 * casi todo ese tiempo.
 *
 * Codigo puro: recibe el calendario ya cargado y no consulta la base.
 */
import {
  aLocal, anteriorMedianoche, aUtc, conMinutosDelDia, jornadaDe, minutosDelDia,
  siguienteMedianoche, type CalendarioLaboral,
} from './calendario.js';

/** Tope de dias que se recorren buscando jornada abierta. */
const DIAS_MAXIMOS = 400;

/**
 * Suma horas laborables a un instante y devuelve cuando vence el plazo.
 *
 * Si el punto de partida cae fuera de jornada, el reloj arranca en la
 * apertura siguiente: el plazo de algo recibido un domingo empieza a correr
 * el lunes a las siete.
 */
export function sumarHorasLaborables(
  desde: Date,
  horas: number,
  calendario: CalendarioLaboral,
): Date {
  if (calendario.jornadas.length === 0) {
    throw new Error('El calendario laboral no tiene ninguna jornada configurada.');
  }
  if (horas <= 0) return desde;

  let local = aLocal(desde, calendario);
  let restantes = horas * 60;

  for (let dia = 0; dia <= DIAS_MAXIMOS; dia += 1) {
    const jornada = jornadaDe(local, calendario);

    if (jornada !== null) {
      const ahora = minutosDelDia(local);
      const inicio = Math.max(ahora, jornada.inicioMinutos);

      if (inicio < jornada.finMinutos) {
        const disponibles = jornada.finMinutos - inicio;
        if (restantes <= disponibles) {
          return aUtc(conMinutosDelDia(local, inicio + restantes), calendario);
        }
        restantes -= disponibles;
      }
    }

    local = siguienteMedianoche(local);
  }

  throw new Error(
    `No se pudo ubicar el vencimiento de ${horas} horas laborables en ${DIAS_MAXIMOS} dias. ` +
      'Revise el calendario laboral del centro.',
  );
}

/**
 * Resta horas laborables: en que instante habria que haber empezado para
 * que, trabajando esas horas, se llegue al momento indicado.
 *
 * Es la inversa de sumarHorasLaborables y se usa para ubicar hacia atras el
 * arranque de un estado: "esta orden lleva veinte horas laborables aqui".
 */
export function restarHorasLaborables(
  hasta: Date,
  horas: number,
  calendario: CalendarioLaboral,
): Date {
  if (calendario.jornadas.length === 0) {
    throw new Error('El calendario laboral no tiene ninguna jornada configurada.');
  }
  if (horas <= 0) return hasta;

  let local = aLocal(hasta, calendario);
  let restantes = horas * 60;

  for (let dia = 0; dia <= DIAS_MAXIMOS; dia += 1) {
    const jornada = jornadaDe(local, calendario);

    if (jornada !== null) {
      const ahora = dia === 0 ? minutosDelDia(local) : jornada.finMinutos;
      const tope = Math.min(ahora, jornada.finMinutos);

      if (tope > jornada.inicioMinutos) {
        const disponibles = tope - jornada.inicioMinutos;
        if (restantes <= disponibles) {
          return aUtc(conMinutosDelDia(local, tope - restantes), calendario);
        }
        restantes -= disponibles;
      }
    }

    local = anteriorMedianoche(local);
  }

  throw new Error(
    `No se pudo retroceder ${horas} horas laborables en ${DIAS_MAXIMOS} dias. ` +
      'Revise el calendario laboral del centro.',
  );
}

/**
 * Horas laborables transcurridas entre dos instantes. Negativo si el
 * segundo es anterior al primero.
 */
export function horasLaborablesEntre(
  desde: Date,
  hasta: Date,
  calendario: CalendarioLaboral,
): number {
  if (hasta.getTime() === desde.getTime()) return 0;
  if (hasta.getTime() < desde.getTime()) {
    return -horasLaborablesEntre(hasta, desde, calendario);
  }

  const limite = aLocal(hasta, calendario);
  let local = aLocal(desde, calendario);
  let acumulados = 0;

  for (let dia = 0; dia <= DIAS_MAXIMOS && local.getTime() < limite.getTime(); dia += 1) {
    const jornada = jornadaDe(local, calendario);

    if (jornada !== null) {
      const mismoDia = local.toISOString().slice(0, 10) === limite.toISOString().slice(0, 10);
      const ahora = minutosDelDia(local);
      const tope = mismoDia ? Math.min(minutosDelDia(limite), jornada.finMinutos) : jornada.finMinutos;
      const inicio = Math.max(ahora, jornada.inicioMinutos);
      if (tope > inicio) acumulados += tope - inicio;
    }

    local = siguienteMedianoche(local);
  }

  return acumulados / 60;
}

/** Horas laborables que faltan para el vencimiento. Negativo si ya paso. */
export function horasParaVencer(
  ahora: Date,
  vence: Date,
  calendario: CalendarioLaboral,
): number {
  return horasLaborablesEntre(ahora, vence, calendario);
}
