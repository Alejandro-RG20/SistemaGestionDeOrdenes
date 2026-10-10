/**
 * Calculo de vencimientos por meses de calendario.
 *
 * Una sola definicion para el servidor (que es quien decide) y el panel
 * (que solo la muestra antes de guardar), para que no haya dos calculos que
 * puedan dar fechas distintas.
 *
 * Es la misma regla que el motor de garantias usa con los meses de la
 * regla de cobertura (`mesesTranscurridos` en el servidor): la garantia
 * cubre mientras no se hayan cumplido los N meses completos desde la fecha
 * de inicio. El ultimo dia cubierto es, por tanto:
 *
 *   - el dia anterior al mismo dia del mes, N meses despues
 *     (15 de enero + 12 meses -> cubre hasta el 14 de enero siguiente);
 *   - y si ese mes no tiene ese dia, su ultimo dia
 *     (31 de enero + 1 mes -> cubre hasta el 28 o 29 de febrero;
 *      29 de febrero + 12 meses -> hasta el 28 de febrero siguiente).
 *
 * Trabaja con fechas de calendario en texto AAAA-MM-DD, sin horas ni zona.
 */

const PATRON = /^(\d{4})-(\d{2})-(\d{2})$/;

function partes(fecha: string): [number, number, number] {
  const coincide = PATRON.exec(fecha);
  if (coincide === null) throw new Error(`Fecha invalida: ${fecha}`);
  return [Number(coincide[1]), Number(coincide[2]), Number(coincide[3])];
}

const dosCifras = (valor: number): string => String(valor).padStart(2, '0');

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export function esFechaValida(fecha: string): boolean {
  if (!PATRON.test(fecha)) return false;
  const [anio, mes, dia] = partes(fecha);
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasDelMes(anio, mes);
}

/** Meses completos entre dos fechas (no negativo). Misma regla que el motor. */
export function mesesCompletos(desde: string, hasta: string): number {
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  const meses = (a2 - a1) * 12 + (m2 - m1);
  return Math.max(0, d2 >= d1 ? meses : meses - 1);
}

/** Ultimo dia que cubre una garantia de `meses` meses que empieza en `desde`. */
export function ultimoDiaCubierto(desde: string, meses: number): string {
  if (!Number.isInteger(meses) || meses < 1) throw new Error('Los meses deben ser un entero positivo.');
  const [anio, mes, dia] = partes(desde);
  const total = (mes - 1) + meses;
  const anioDestino = anio + Math.floor(total / 12);
  const mesDestino = (total % 12) + 1;
  const ultimo = diasDelMes(anioDestino, mesDestino);
  if (dia > ultimo) {
    // El mes destino no tiene ese dia: N meses completos se cumplen al
    // empezar el mes siguiente, asi que cubre hasta el ultimo dia.
    return `${anioDestino}-${dosCifras(mesDestino)}-${dosCifras(ultimo)}`;
  }
  const mismoDia = new Date(Date.UTC(anioDestino, mesDestino - 1, dia));
  mismoDia.setUTCDate(mismoDia.getUTCDate() - 1);
  return mismoDia.toISOString().slice(0, 10);
}

/**
 * Cuantos meses representan un inicio y un ultimo dia cubierto, si cuadran
 * exactamente con `ultimoDiaCubierto`; si no (fechas registradas a mano),
 * null. Sirve para mostrar «12 meses» sin guardar el numero aparte.
 */
export function mesesDeLaVigencia(desde: string, hasta: string): number | null {
  const estimado = mesesCompletos(desde, hasta) + 1;
  for (const candidato of [estimado - 1, estimado, estimado + 1]) {
    if (candidato >= 1 && ultimoDiaCubierto(desde, candidato) === hasta) return candidato;
  }
  return null;
}
