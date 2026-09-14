/** Que reclasificaciones de garantia se permiten. Codigo puro, sin base. */
import { describe, expect, it } from 'vitest';
import { TIPO_GARANTIA, type TipoGarantia } from '@servitotal/compartido';
import {
  CAUSA_RECLASIFICACION, evaluarReclasificacion, type CausaReclasificacion,
} from '../../src/dominio/garantias/indice.js';

function pedir(
  desde: TipoGarantia,
  hacia: TipoGarantia,
  ajustes: { causa?: CausaReclasificacion; entregada?: boolean; documento?: boolean } = {},
) {
  return evaluarReclasificacion({
    desde, hacia,
    causa: ajustes.causa ?? CAUSA_RECLASIFICACION.DOCUMENTO_PRESENTADO,
    ordenEntregada: ajustes.entregada ?? false,
    tieneDocumentoDeRespaldo: ajustes.documento ?? false,
  });
}

describe('degradar la cobertura', () => {
  it('de garantia del fabricante a particular se permite', () => {
    expect(pedir(TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.PARTICULAR, {
      causa: CAUSA_RECLASIFICACION.DIAGNOSTICO,
    }).permitida).toBe(true);
  });

  it('de poliza extendida a particular se permite', () => {
    expect(pedir(TIPO_GARANTIA.ADICIONAL, TIPO_GARANTIA.PARTICULAR, {
      causa: CAUSA_RECLASIFICACION.DIAGNOSTICO,
    }).permitida).toBe(true);
  });

  it('no hace falta documento para degradar', () => {
    expect(pedir(TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.PARTICULAR, { documento: false }).permitida).toBe(true);
  });
});

describe('mejorar la cobertura', () => {
  it('de particular a fabricante exige documento', () => {
    const sinDocumento = pedir(TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.PROVEEDOR, { documento: false });
    expect(sinDocumento.permitida).toBe(false);
    expect(sinDocumento.motivo).toMatch(/factura|poliza/i);

    expect(pedir(TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.PROVEEDOR, { documento: true }).permitida).toBe(true);
  });

  it('el diagnostico por si solo nunca mejora la cobertura', () => {
    const veredicto = pedir(TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.PROVEEDOR, {
      causa: CAUSA_RECLASIFICACION.DIAGNOSTICO, documento: true,
    });
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/no mejora/i);
  });

  it('de particular a poliza extendida tambien exige documento', () => {
    expect(pedir(TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.ADICIONAL, { documento: false }).permitida).toBe(false);
    expect(pedir(TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.ADICIONAL, { documento: true }).permitida).toBe(true);
  });
});

describe('despues de la entrega', () => {
  it('no se reclasifica en ninguna direccion', () => {
    const combinaciones: readonly (readonly [TipoGarantia, TipoGarantia])[] = [
      [TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.PARTICULAR],
      [TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.PROVEEDOR],
      [TIPO_GARANTIA.ADICIONAL, TIPO_GARANTIA.PARTICULAR],
      [TIPO_GARANTIA.PARTICULAR, TIPO_GARANTIA.ADICIONAL],
      [TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.ADICIONAL],
    ];
    for (const [desde, hacia] of combinaciones) {
      const veredicto = pedir(desde, hacia, { entregada: true, documento: true });
      expect(veredicto.permitida, `${desde} -> ${hacia}`).toBe(false);
      expect(veredicto.motivo).toMatch(/nota de correccion/i);
    }
  });
});

describe('ordenes levantadas en campo', () => {
  it('confirmar una orden por validar siempre se permite', () => {
    for (const hacia of [TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.ADICIONAL, TIPO_GARANTIA.PARTICULAR]) {
      expect(pedir(TIPO_GARANTIA.POR_VALIDAR, hacia).permitida).toBe(true);
    }
  });

  it('pero no se puede volver a por_validar una vez clasificada', () => {
    expect(pedir(TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.POR_VALIDAR, { documento: true }).permitida).toBe(false);
  });

  it('ni siquiera una orden por validar se reclasifica tras la entrega', () => {
    expect(pedir(TIPO_GARANTIA.POR_VALIDAR, TIPO_GARANTIA.PROVEEDOR, { entregada: true }).permitida).toBe(false);
  });
});

describe('casos sin efecto', () => {
  it('reclasificar al mismo tipo se rechaza con un mensaje claro', () => {
    const veredicto = pedir(TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.PROVEEDOR, { documento: true });
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/ya tiene ese tipo/i);
  });
});
