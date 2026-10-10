/**
 * Vencimiento por meses de calendario: una sola regla para la garantia
 * adicional, la del fabricante calculada por la regla, y la vista previa
 * del panel.
 */
import { describe, expect, it } from 'vitest';
import { mesesCompletos, mesesDeLaVigencia, ultimoDiaCubierto } from '@servitotal/compartido';
import { mesesTranscurridos } from '../../src/dominio/garantias/contexto-cobertura.js';

describe('ultimo dia cubierto', () => {
  it('cubre hasta el dia anterior al mismo dia, N meses despues', () => {
    expect(ultimoDiaCubierto('2025-01-15', 12)).toBe('2026-01-14');
    expect(ultimoDiaCubierto('2025-03-01', 1)).toBe('2025-03-31');
    expect(ultimoDiaCubierto('2025-12-10', 3)).toBe('2026-03-09');
  });

  it('a fin de mes, hasta el ultimo dia del mes destino', () => {
    expect(ultimoDiaCubierto('2026-01-31', 1)).toBe('2026-02-28');
    expect(ultimoDiaCubierto('2024-01-31', 1)).toBe('2024-02-29');
    expect(ultimoDiaCubierto('2026-01-30', 1)).toBe('2026-02-28');
    expect(ultimoDiaCubierto('2024-02-29', 12)).toBe('2025-02-28');
    expect(ultimoDiaCubierto('2026-08-31', 6)).toBe('2027-02-28');
    expect(ultimoDiaCubierto('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('es la misma regla que el motor: el ultimo dia todavia no completa los meses, el siguiente si', () => {
    const casos: Array<[string, number]> = [
      ['2026-01-31', 1], ['2024-02-29', 12], ['2025-01-15', 12], ['2026-08-31', 6], ['2025-05-01', 24],
    ];
    for (const [desde, meses] of casos) {
      const ultimo = ultimoDiaCubierto(desde, meses);
      const siguiente = new Date(`${ultimo}T00:00:00Z`);
      siguiente.setUTCDate(siguiente.getUTCDate() + 1);
      expect(mesesTranscurridos(new Date(`${desde}T00:00:00Z`), new Date(`${ultimo}T00:00:00Z`))).toBeLessThan(meses);
      expect(mesesTranscurridos(new Date(`${desde}T00:00:00Z`), siguiente)).toBeGreaterThanOrEqual(meses);
      expect(mesesCompletos(desde, ultimo)).toBeLessThan(meses);
    }
  });

  it('recupera los meses de una vigencia calculada, y null si las fechas no son meses exactos', () => {
    expect(mesesDeLaVigencia('2026-01-31', '2026-02-28')).toBe(1);
    expect(mesesDeLaVigencia('2025-01-15', '2026-01-14')).toBe(12);
    expect(mesesDeLaVigencia('2025-01-15', '2026-01-20')).toBeNull();
  });

  it('rechaza meses que no son enteros positivos', () => {
    expect(() => ultimoDiaCubierto('2026-01-01', 0)).toThrow();
    expect(() => ultimoDiaCubierto('2026-01-01', 1.5)).toThrow();
  });
});
