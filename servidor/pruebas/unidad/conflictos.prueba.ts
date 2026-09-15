/**
 * Resolucion de conflictos de sincronizacion, sin base de datos.
 *
 * Los tres casos del pliego y el criterio que los ordena: ante la duda,
 * prevalece lo que ocurrio fisicamente en el domicilio.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASE_CONFLICTO, RESOLUCION, clasificarPorCodigo, resolverConflicto, resolverPrecio,
} from '../../src/dominio/sincronizacion/indice.js';

describe('los tres conflictos del pliego', () => {
  it('orden anulada mientras el tecnico trabajaba: se conserva el trabajo integro', () => {
    const conflicto = resolverConflicto(CLASE_CONFLICTO.ORDEN_ANULADA_EN_CAMPO);
    expect(conflicto.resolucion).toBe(RESOLUCION.CONSERVAR_EN_EXCEPCION);
    expect(conflicto.motivo).toMatch(/no se descarta nada/i);
  });

  it('repuesto que no figuraba en la bodega movil: se acepta y se compensa', () => {
    const conflicto = resolverConflicto(CLASE_CONFLICTO.REPUESTO_NO_FIGURABA);
    expect(conflicto.resolucion).toBe(RESOLUCION.ACEPTAR_Y_COMPENSAR);
    expect(conflicto.motivo).toMatch(/pieza esta instalada/i);
    expect(conflicto.motivo).toMatch(/diferencia de inventario/i);
  });

  it('precio cambiado entre la descarga y el consumo: prevalece el firmado', () => {
    const conflicto = resolverConflicto(CLASE_CONFLICTO.PRECIO_CAMBIADO);
    expect(conflicto.resolucion).toBe(RESOLUCION.ACEPTAR_Y_COMPENSAR);
    expect(conflicto.motivo).toMatch(/cliente firmo/i);
  });
});

describe('ningun conflicto descarta trabajo de campo', () => {
  it('toda clase de conflicto se acepta o se conserva, nunca se pierde', () => {
    for (const clase of Object.values(CLASE_CONFLICTO)) {
      const conflicto = resolverConflicto(clase);
      expect([RESOLUCION.ACEPTAR_Y_COMPENSAR, RESOLUCION.CONSERVAR_EN_EXCEPCION], clase)
        .toContain(conflicto.resolucion);
      expect(conflicto.motivo.length, clase).toBeGreaterThan(30);
    }
  });

  it('el cajon de sastre tambien conserva', () => {
    expect(resolverConflicto(CLASE_CONFLICTO.OTRO).resolucion).toBe(RESOLUCION.CONSERVAR_EN_EXCEPCION);
  });
});

describe('clasificacion por codigo de error del dominio', () => {
  it('una orden cerrada es el caso de la orden anulada en campo', () => {
    expect(clasificarPorCodigo('ORDEN_CERRADA')).toBe(CLASE_CONFLICTO.ORDEN_ANULADA_EN_CAMPO);
  });

  it('la falta de existencia es el caso del repuesto que no figuraba', () => {
    expect(clasificarPorCodigo('EXISTENCIA_INSUFICIENTE')).toBe(CLASE_CONFLICTO.REPUESTO_NO_FIGURABA);
  });

  it('los rechazos de la maquina de estados son estado incompatible', () => {
    for (const codigo of ['TRANSICION_INVALIDA', 'NO_ES_RESPONSABLE', 'REQUISITO_INCUMPLIDO']) {
      expect(clasificarPorCodigo(codigo), codigo).toBe(CLASE_CONFLICTO.ESTADO_INCOMPATIBLE);
    }
  });

  it('un codigo desconocido cae en el cajon de sastre, no revienta', () => {
    expect(clasificarPorCodigo('ALGO_QUE_NADIE_PREVIO')).toBe(CLASE_CONFLICTO.OTRO);
  });
});

describe('precio que prevalece', () => {
  it('el firmado en campo manda sobre el del catalogo', () => {
    const veredicto = resolverPrecio(4200, 4800);
    expect(veredicto.precioQuePrevalece).toBe(4200);
    expect(veredicto.huboDiferencia).toBe(true);
    expect(veredicto.diferencia).toBe(-600);
  });

  it('tambien cuando el firmado es mayor', () => {
    const veredicto = resolverPrecio(5000, 4800);
    expect(veredicto.precioQuePrevalece).toBe(5000);
    expect(veredicto.diferencia).toBe(200);
  });

  it('sin precio firmado se usa el del catalogo y no hay diferencia', () => {
    const veredicto = resolverPrecio(undefined, 4800);
    expect(veredicto.precioQuePrevalece).toBe(4800);
    expect(veredicto.huboDiferencia).toBe(false);
  });

  it('precios iguales no generan diferencia', () => {
    expect(resolverPrecio(4800, 4800).huboDiferencia).toBe(false);
  });
});
