/** Cierre de sesion por inactividad (RF-06). */
import { describe, expect, it } from 'vitest';
import { MINUTOS_DE_INACTIVIDAD, debeCerrarPorInactividad } from '../src/sesion/inactividad.js';

const MINUTO = 60_000;

describe('cierre por inactividad', () => {
  it('cierra el panel tras el tiempo sin actividad, no antes', () => {
    const inicio = 1_000_000;
    expect(debeCerrarPorInactividad(inicio, inicio + (MINUTOS_DE_INACTIVIDAD - 1) * MINUTO, '/ordenes')).toBe(false);
    expect(debeCerrarPorInactividad(inicio, inicio + MINUTOS_DE_INACTIVIDAD * MINUTO, '/ordenes')).toBe(true);
  });
  it('nunca en la aplicacion de campo: el tecnico puede estar sin señal', () => {
    expect(debeCerrarPorInactividad(0, 10 * 60 * MINUTO, '/campo')).toBe(false);
    expect(debeCerrarPorInactividad(0, 10 * 60 * MINUTO, '/campo/ordenes/x/diagnostico')).toBe(false);
    expect(debeCerrarPorInactividad(0, 10 * 60 * MINUTO, '/campos')).toBe(true);
  });
});
