import { describe, expect, it } from 'vitest';
import { plazoEnPalabras } from '../src/componentes/piezas.js';

describe('plazo en palabras', () => {
  it('sin plazo, raya', () => {
    expect(plazoEnPalabras(null, false).texto).toBe('—');
  });

  it('una orden cerrada con el plazo pasado no dice «vence en» con horas negativas', () => {
    expect(plazoEnPalabras(-3754, false).texto).toBe('—');
  });

  it('una orden abierta vencida dice cuanto lleva vencida', () => {
    expect(plazoEnPalabras(-5, true).texto).toBe('vencido 5 h');
    expect(plazoEnPalabras(-96, true).texto).toBe('vencido 4 d');
  });

  it('una orden por vencer dice cuanto le queda', () => {
    expect(plazoEnPalabras(6, false).texto).toBe('vence en 6 h');
    expect(plazoEnPalabras(72, false).texto).toBe('vence en 3 d');
  });
});
