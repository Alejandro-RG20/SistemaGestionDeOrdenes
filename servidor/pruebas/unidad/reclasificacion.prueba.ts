/** Que reclasificaciones manuales de garantia se permiten. Codigo puro, sin base. */
import { describe, expect, it } from 'vitest';
import { TIPO_GARANTIA, type TipoGarantia } from '@servitotal/compartido';
import { evaluarReclasificacion } from '../../src/dominio/garantias/indice.js';

function pedir(desde: TipoGarantia, hacia: TipoGarantia, cerrada = false) {
  return evaluarReclasificacion({ desde, hacia, ordenCerrada: cerrada });
}

describe('reclasificar una orden abierta', () => {
  it('entre proveedor, adicional y particular se permite en cualquier sentido', () => {
    const tipos = [TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.ADICIONAL, TIPO_GARANTIA.PARTICULAR];
    for (const desde of tipos) {
      for (const hacia of tipos) {
        if (desde === hacia) continue;
        expect(pedir(desde, hacia).permitida).toBe(true);
      }
    }
  });

  it('a la misma clasificacion no hay nada que cambiar', () => {
    const veredicto = pedir(TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.PROVEEDOR);
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/ya tiene/i);
  });
});

describe('ordenes levantadas en campo', () => {
  it('confirmar una orden por validar se permite', () => {
    const veredicto = pedir(TIPO_GARANTIA.POR_VALIDAR, TIPO_GARANTIA.PROVEEDOR);
    expect(veredicto.permitida).toBe(true);
    expect(veredicto.motivo).toMatch(/campo/i);
  });

  it('no se devuelve una orden clasificada a por validar', () => {
    expect(pedir(TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.POR_VALIDAR).permitida).toBe(false);
  });
});

describe('despues del cierre', () => {
  it('ninguna reclasificacion, y remite a la nota de correccion', () => {
    const veredicto = pedir(TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.PARTICULAR, true);
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/nota de correccion/i);
  });
});
