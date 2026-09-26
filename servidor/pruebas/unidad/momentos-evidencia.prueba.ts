/**
 * Que evidencia se puede exigir segun donde esta la orden.
 *
 * Es una regla de dominio pequeña y de consecuencias grandes: mal puesta,
 * traba el sistema entero. La version anterior exigia SIEMPRE todas las
 * evidencias, y como `firma_cliente` se recoge en la entrega —que a su vez
 * exige la aprobacion— ninguna orden podia aprobarse jamas.
 */
import { describe, expect, it } from 'vitest';
import {
  ESTADO_ORDEN, ESTADOS_ORDEN, MOMENTO_EVIDENCIA, momentosExigiblesEn,
} from '@servitotal/compartido';

describe('momentos de evidencia exigibles', () => {
  it('una orden recien recibida solo debe lo de recepcion y garantia', () => {
    expect(momentosExigiblesEn(ESTADO_ORDEN.REGISTRADA)).toEqual([
      MOMENTO_EVIDENCIA.RECEPCION, MOMENTO_EVIDENCIA.VALIDACION_GARANTIA,
    ]);
  });

  /**
   * Es acumulativa: lo de recepcion se sigue debiendo cuando la orden ya
   * avanzo. Si nadie tomo la foto del articulo al recibirlo, alguien tiene
   * que hacerlo; no se perdona por haber pasado de etapa.
   */
  it('es acumulativa: lo anterior se sigue debiendo', () => {
    const enDiagnostico = momentosExigiblesEn(ESTADO_ORDEN.EN_DIAGNOSTICO);
    expect(enDiagnostico).toContain(MOMENTO_EVIDENCIA.RECEPCION);
    expect(enDiagnostico).toContain(MOMENTO_EVIDENCIA.DIAGNOSTICO);

    const enReparacion = momentosExigiblesEn(ESTADO_ORDEN.EN_REPARACION);
    for (const momento of enDiagnostico) expect(enReparacion).toContain(momento);
    expect(enReparacion).toContain(MOMENTO_EVIDENCIA.REPARACION);
  });

  /** La que rompia el sistema. */
  it('la entrega NO se exige mientras la orden no se haya entregado', () => {
    for (const estado of [
      ESTADO_ORDEN.REGISTRADA, ESTADO_ORDEN.EN_RUTA, ESTADO_ORDEN.EN_DIAGNOSTICO,
      ESTADO_ORDEN.EN_REPARACION, ESTADO_ORDEN.FINALIZADA,
    ]) {
      expect(momentosExigiblesEn(estado)).not.toContain(MOMENTO_EVIDENCIA.ENTREGA);
    }
  });

  it('una vez entregada, si: es el expediente completo que mira el cobro', () => {
    expect(momentosExigiblesEn(ESTADO_ORDEN.ENTREGADA))
      .toContain(MOMENTO_EVIDENCIA.ENTREGA);
  });

  it('ningun estado queda sin respuesta', () => {
    for (const estado of ESTADOS_ORDEN) {
      expect(momentosExigiblesEn(estado).length).toBeGreaterThan(0);
    }
  });

  it('nunca devuelve un momento que no exista', () => {
    const validos = new Set<string>(Object.values(MOMENTO_EVIDENCIA));
    for (const estado of ESTADOS_ORDEN) {
      for (const momento of momentosExigiblesEn(estado)) {
        expect(validos.has(momento)).toBe(true);
      }
    }
  });
});
