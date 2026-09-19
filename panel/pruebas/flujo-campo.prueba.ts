/**
 * El subconjunto de transiciones que la app ofrece tiene que ser un
 * SUBCONJUNTO de lo que la maquina de estados del servidor permite. Un
 * boton de mas no es un error de interfaz: es trabajo que termina en la
 * bandeja de excepciones.
 */
import { describe, expect, it } from 'vitest';
import { ESTADO_ORDEN, ESTADOS_ORDEN } from '@servitotal/compartido';
import { avancesDisponibles, porQueNoSePuedeMover } from '../src/campo/flujo-campo.js';

/**
 * Copia del grafo del servidor (`dominio/ordenes/estados.ts`), escrita a
 * mano a proposito: si alguien cambia el grafo alla y no aqui, esta prueba
 * lo tiene que decir en vez de dejar que la app ofrezca algo que ya no vale.
 */
const TRANSICIONES_DEL_SERVIDOR: Readonly<Record<string, readonly string[]>> = {
  registrada: ['asignada', 'anulada'],
  asignada: ['en_ruta', 'en_cola_taller', 'anulada'],
  en_ruta: ['en_diagnostico', 'en_cola_taller', 'anulada'],
  en_cola_taller: ['en_diagnostico', 'anulada'],
  en_diagnostico: ['cotizada', 'esperando_repuesto', 'en_reparacion', 'cerrada_sin_reparar', 'anulada'],
  cotizada: ['esperando_autorizacion', 'en_reparacion', 'esperando_repuesto', 'cerrada_sin_reparar', 'anulada'],
  esperando_autorizacion: ['en_reparacion', 'esperando_repuesto', 'cerrada_sin_reparar', 'anulada'],
  esperando_repuesto: ['en_reparacion', 'cerrada_sin_reparar', 'anulada'],
  en_reparacion: ['finalizada', 'esperando_repuesto', 'cerrada_sin_reparar', 'anulada'],
  finalizada: ['entregada', 'anulada'],
  entregada: [],
  cerrada_sin_reparar: [],
  anulada: [],
};

describe('flujo de campo', () => {
  it('todo lo que la app ofrece existe en la maquina del servidor', () => {
    for (const estado of ESTADOS_ORDEN) {
      const permitidas = TRANSICIONES_DEL_SERVIDOR[estado] ?? [];
      for (const opcion of avancesDisponibles(estado)) {
        expect(
          permitidas,
          `la app ofrece ${estado} -> ${opcion.hacia} y el servidor no lo permite`,
        ).toContain(opcion.hacia);
      }
    }
  });

  it('no ofrece anular ni cerrar sin reparar desde ningun estado', () => {
    // Son decisiones de cierre: no se toman solo, sin senal, en el domicilio.
    for (const estado of ESTADOS_ORDEN) {
      const destinos = avancesDisponibles(estado).map((opcion) => opcion.hacia);
      expect(destinos).not.toContain(ESTADO_ORDEN.ANULADA);
      expect(destinos).not.toContain(ESTADO_ORDEN.CERRADA_SIN_REPARAR);
    }
  });

  it('solo ofrece avances donde el responsable es el tecnico asignado', () => {
    // En el servidor, el responsable de estos tres estados es TECNICO_ASIGNADO.
    const delTecnico = [ESTADO_ORDEN.EN_RUTA, ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.EN_REPARACION];
    for (const estado of ESTADOS_ORDEN) {
      if (avancesDisponibles(estado).length > 0) expect(delTecnico).toContain(estado);
    }
  });

  it('cuando no hay nada que ofrecer, explica por que', () => {
    for (const estado of ESTADOS_ORDEN) {
      if (avancesDisponibles(estado).length === 0) {
        expect(porQueNoSePuedeMover(estado)).toBeTruthy();
      } else {
        expect(porQueNoSePuedeMover(estado)).toBeNull();
      }
    }
  });

  it('no ofrece mover una orden que ya esta cerrada', () => {
    for (const estado of [ESTADO_ORDEN.ENTREGADA, ESTADO_ORDEN.CERRADA_SIN_REPARAR, ESTADO_ORDEN.ANULADA]) {
      expect(avancesDisponibles(estado)).toHaveLength(0);
    }
  });
});
