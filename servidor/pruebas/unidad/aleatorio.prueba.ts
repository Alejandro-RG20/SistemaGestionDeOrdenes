import { describe, expect, it } from 'vitest';
import { Aleatorio, comoFecha, sumarDias, sumarHoras } from '../../src/infraestructura/semillas/aleatorio.js';

describe('Aleatorio', () => {
  it('produce la misma secuencia con la misma semilla', () => {
    const primera = new Aleatorio(20260913);
    const segunda = new Aleatorio(20260913);
    const unos = Array.from({ length: 200 }, () => primera.siguiente());
    const otros = Array.from({ length: 200 }, () => segunda.siguiente());
    expect(unos).toEqual(otros);
  });

  it('produce secuencias distintas con semillas distintas', () => {
    const unos = Array.from({ length: 50 }, () => new Aleatorio(1).siguiente());
    const otros = Array.from({ length: 50 }, () => new Aleatorio(2).siguiente());
    expect(unos).not.toEqual(otros);
  });

  it('genera UUID con formato de version 4 y sin repetirse', () => {
    const azar = new Aleatorio(7);
    const patron = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const generados = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      const uuid = azar.uuid();
      expect(uuid).toMatch(patron);
      generados.add(uuid);
    }
    expect(generados.size).toBe(10_000);
  });

  it('respeta los limites de entero, ambos incluidos', () => {
    const azar = new Aleatorio(3);
    const vistos = new Set<number>();
    for (let i = 0; i < 2_000; i += 1) {
      const valor = azar.entero(5, 8);
      expect(valor).toBeGreaterThanOrEqual(5);
      expect(valor).toBeLessThanOrEqual(8);
      vistos.add(valor);
    }
    expect([...vistos].sort()).toEqual([5, 6, 7, 8]);
  });

  it('reparte segun los pesos indicados', () => {
    const azar = new Aleatorio(11);
    let frecuentes = 0;
    for (let i = 0; i < 10_000; i += 1) {
      if (azar.elegirPonderado([['mucho', 90], ['poco', 10]]) === 'mucho') frecuentes += 1;
    }
    expect(frecuentes).toBeGreaterThan(8_500);
    expect(frecuentes).toBeLessThan(9_500);
  });

  it('baraja sin alterar la lista original ni perder elementos', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const barajada = new Aleatorio(5).barajar(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...barajada].sort((a, b) => a - b)).toEqual(original);
  });

  it('suma horas y dias sin desbordar el cambio de mes', () => {
    const base = new Date('2026-01-31T22:00:00.000Z');
    expect(sumarHoras(base, 4).toISOString()).toBe('2026-02-01T02:00:00.000Z');
    expect(comoFecha(sumarDias(base, 1))).toBe('2026-02-01');
  });
});
