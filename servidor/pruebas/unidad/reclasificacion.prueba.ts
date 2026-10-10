/** Que reclasificaciones manuales de garantia se permiten. Codigo puro, sin base. */
import { describe, expect, it } from 'vitest';
import { TIPO_GARANTIA, type TipoGarantia } from '@servitotal/compartido';
import { evaluarReclasificacion } from '../../src/dominio/garantias/indice.js';

function pedir(desde: TipoGarantia, hacia: TipoGarantia, cerrada = false) {
  return evaluarReclasificacion({ desde, hacia, ordenCerrada: cerrada });
}

describe('reclasificar una orden abierta', () => {
  it('particular a una garantia, y entre garantias, se permite (el servicio exige que aplique)', () => {
    expect(pedir(TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.PROVEEDOR).permitida).toBe(true);
    expect(pedir(TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.ADICIONAL).permitida).toBe(true);
    expect(pedir(TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.ADICIONAL).permitida).toBe(true);
    expect(pedir(TIPO_GARANTIA.ADICIONAL, TIPO_GARANTIA.PROVEEDOR).permitida).toBe(true);
  });

  it('una orden de garantia NO pasa a particular: se confirma la exclusion', () => {
    for (const desde of [TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.ADICIONAL]) {
      const veredicto = pedir(desde, TIPO_GARANTIA.PARTICULAR);
      expect(veredicto.permitida).toBe(false);
      expect(veredicto.motivo).toMatch(/confirme la exclusion/);
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
    const veredicto = pedir(TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.PROVEEDOR, true);
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/nota de correccion/i);
  });
});
