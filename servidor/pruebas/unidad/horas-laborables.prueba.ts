/**
 * Plazos en horas laborables, con el horario real del taller:
 * lunes a viernes 07:00-20:00 y sabado 07:00-17:00. Domingo cerrado.
 *
 * Las fechas se escriben en hora de Managua (UTC-6) y se convierten a UTC
 * para llamar al calculo, que es como llegan de la base.
 */
import { describe, expect, it } from 'vitest';
import {
  construirCalendario, horasLaborablesEntre, restarHorasLaborables, sumarHorasLaborables,
} from '../../src/dominio/plazos/indice.js';

const CALENDARIO = construirCalendario(
  [
    { diaSemana: 1, horaInicio: '07:00', horaFin: '20:00' },
    { diaSemana: 2, horaInicio: '07:00', horaFin: '20:00' },
    { diaSemana: 3, horaInicio: '07:00', horaFin: '20:00' },
    { diaSemana: 4, horaInicio: '07:00', horaFin: '20:00' },
    { diaSemana: 5, horaInicio: '07:00', horaFin: '20:00' },
    { diaSemana: 6, horaInicio: '07:00', horaFin: '17:00' },
  ],
  ['2026-09-14', '2026-09-15'], // Batalla de San Jacinto e Independencia
);

/** Hora local de Managua a instante UTC. */
function managua(texto: string): Date {
  return new Date(`${texto}:00-06:00`);
}

/** Formatea un instante UTC como hora local de Managua, para leer la prueba. */
function comoManagua(momento: Date): string {
  return new Date(momento.getTime() - 6 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
}

describe('suma de horas laborables', () => {
  it('dentro de la misma jornada suma directo', () => {
    // Miercoles 7 de octubre, 09:00 + 5 h = 14:00 del mismo dia.
    expect(comoManagua(sumarHorasLaborables(managua('2026-10-07T09:00'), 5, CALENDARIO)))
      .toBe('2026-10-07 14:00');
  });

  it('salta la noche y sigue al dia siguiente a la apertura', () => {
    // Miercoles 18:00 + 4 h: quedan 2 h ese dia, las otras 2 arrancan el
    // jueves a las 07:00 y terminan a las 09:00.
    expect(comoManagua(sumarHorasLaborables(managua('2026-10-07T18:00'), 4, CALENDARIO)))
      .toBe('2026-10-08 09:00');
  });

  it('EL CASO DEL PLIEGO: recibida el sabado a las 16:00 no vence el lunes por la manana', () => {
    // Sabado 3 de octubre a las 16:00, plazo de 8 horas laborables.
    // Sabado: queda 1 h, el centro cierra a las 17:00.
    // Domingo: cerrado, no corre nada.
    // Lunes: las 7 restantes desde las 07:00 -> 14:00.
    const vence = sumarHorasLaborables(managua('2026-10-03T16:00'), 8, CALENDARIO);
    expect(comoManagua(vence)).toBe('2026-10-05 14:00');

    // Lo esencial: el lunes por la manana la orden NO esta vencida.
    expect(vence.getTime()).toBeGreaterThan(managua('2026-10-05T08:00').getTime());

    // Con horas corridas habria vencido el domingo de madrugada, y el lunes
    // la bandeja la mostraria en rojo sin que nadie hubiera llegado tarde.
    const corridas = new Date(managua('2026-10-03T16:00').getTime() + 8 * 3_600_000);
    expect(corridas.getTime()).toBeLessThan(managua('2026-10-05T08:00').getTime());
  });

  it('un plazo que empieza en domingo arranca el lunes a la apertura', () => {
    // Domingo 4 de octubre, 10:00 + 2 h = lunes 09:00.
    expect(comoManagua(sumarHorasLaborables(managua('2026-10-04T10:00'), 2, CALENDARIO)))
      .toBe('2026-10-05 09:00');
  });

  it('salta los feriados del centro', () => {
    // Viernes 11 a las 18:00 + 4 h. Sabado 12 suma desde las 07:00.
    expect(comoManagua(sumarHorasLaborables(managua('2026-09-11T18:00'), 4, CALENDARIO)))
      .toBe('2026-09-12 09:00');

    // Pero un plazo que cruza el 14 y 15 de septiembre los saltea.
    // Domingo 13 -> lunes 14 feriado -> martes 15 feriado -> miercoles 16.
    expect(comoManagua(sumarHorasLaborables(managua('2026-09-12T16:00'), 2, CALENDARIO)))
      .toBe('2026-09-16 08:00');
  });

  it('antes de abrir, el reloj arranca a las siete', () => {
    // Martes 6 de octubre, 05:00 + 1 h = 08:00, no 06:00.
    expect(comoManagua(sumarHorasLaborables(managua('2026-10-06T05:00'), 1, CALENDARIO)))
      .toBe('2026-10-06 08:00');
  });

  it('un plazo largo cruza varias semanas sin perder cuenta', () => {
    // 120 horas laborables desde el lunes a las 07:00.
    // Semana: 5 x 13 h + sabado 10 h = 75 h. Faltan 45 h en la segunda
    // semana: 3 dias completos (39 h) mas 6 h del jueves -> 13:00.
    expect(comoManagua(sumarHorasLaborables(managua('2026-10-05T07:00'), 120, CALENDARIO)))
      .toBe('2026-10-15 13:00');
  });

  it('un plazo de cero horas no mueve el instante', () => {
    const momento = managua('2026-10-07T09:00');
    expect(sumarHorasLaborables(momento, 0, CALENDARIO).getTime()).toBe(momento.getTime());
  });
});

describe('horas laborables transcurridas', () => {
  it('cuenta solo lo que el centro estuvo abierto', () => {
    // Sabado 16:00 a lunes 08:00: 1 h del sabado + 1 h del lunes = 2 h.
    expect(horasLaborablesEntre(managua('2026-10-03T16:00'), managua('2026-10-05T08:00'), CALENDARIO))
      .toBeCloseTo(2, 5);
  });

  it('un fin de semana entero cuenta solo las horas del sabado', () => {
    // Viernes 20:00 a lunes 07:00: el sabado entero, 10 h.
    expect(horasLaborablesEntre(managua('2026-10-02T20:00'), managua('2026-10-05T07:00'), CALENDARIO))
      .toBeCloseTo(10, 5);
  });

  it('es simetrica y devuelve negativo hacia atras', () => {
    const inicio = managua('2026-10-07T09:00');
    const fin = managua('2026-10-07T15:00');
    expect(horasLaborablesEntre(inicio, fin, CALENDARIO)).toBeCloseTo(6, 5);
    expect(horasLaborablesEntre(fin, inicio, CALENDARIO)).toBeCloseTo(-6, 5);
    expect(horasLaborablesEntre(inicio, inicio, CALENDARIO)).toBe(0);
  });

  it('es la inversa de la suma', () => {
    for (const horas of [1, 5, 13, 40, 120]) {
      const inicio = managua('2026-10-05T09:00');
      const vence = sumarHorasLaborables(inicio, horas, CALENDARIO);
      expect(horasLaborablesEntre(inicio, vence, CALENDARIO)).toBeCloseTo(horas, 5);
    }
  });
});

describe('resta de horas laborables', () => {
  it('retrocede dentro de la misma jornada', () => {
    // Miercoles 14:00 menos 5 h = miercoles 09:00.
    expect(comoManagua(restarHorasLaborables(managua('2026-10-07T14:00'), 5, CALENDARIO)))
      .toBe('2026-10-07 09:00');
  });

  it('cruza la noche hacia atras', () => {
    // Jueves 09:00 menos 4 h: 2 h del jueves y 2 h del miercoles -> 18:00.
    expect(comoManagua(restarHorasLaborables(managua('2026-10-08T09:00'), 4, CALENDARIO)))
      .toBe('2026-10-07 18:00');
  });

  it('salta el domingo hacia atras', () => {
    // Lunes 09:00 menos 3 h: 2 h del lunes y 1 h del sabado -> 16:00.
    expect(comoManagua(restarHorasLaborables(managua('2026-10-05T09:00'), 3, CALENDARIO)))
      .toBe('2026-10-03 16:00');
  });

  it('desde un momento cerrado arranca en el cierre anterior', () => {
    // Domingo 10:00 menos 1 h = sabado 16:00, porque el domingo no cuenta.
    expect(comoManagua(restarHorasLaborables(managua('2026-10-04T10:00'), 1, CALENDARIO)))
      .toBe('2026-10-03 16:00');
  });

  it('es exactamente la inversa de la suma', () => {
    for (const horas of [1, 5, 13, 40, 120]) {
      const fin = managua('2026-10-15T13:00');
      const inicio = restarHorasLaborables(fin, horas, CALENDARIO);
      expect(comoManagua(sumarHorasLaborables(inicio, horas, CALENDARIO)), `${horas} h`)
        .toBe(comoManagua(fin));
    }
  });
});
