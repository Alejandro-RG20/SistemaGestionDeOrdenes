/**
 * Cuando la aplicacion intenta vaciar la cola sola.
 *
 * Esto sostiene la promesa que se le hace al tecnico en pantalla: «se envia
 * solo cuando vuelva la señal». Si falla, no se rompe nada visible —el
 * trabajo sigue guardado— pero se queda en el telefono, el taller no se
 * entera, y el tecnico acaba anotando en papel por si acaso. Ahi el sistema
 * ya perdio aunque funcione.
 */
import { describe, expect, it } from 'vitest';
import { convieneSincronizar, type SituacionDeEnvio } from '../src/campo/contexto.js';

function situacion(cambios: Partial<SituacionDeEnvio> = {}): SituacionDeEnvio {
  return {
    enLinea: true,
    listo: true,
    pendientes: 3,
    sincronizando: false,
    faltaVincularDispositivo: false,
    ...cambios,
  };
}

describe('envio automatico', () => {
  it('con señal, cola por enviar y todo en regla, se envia solo', () => {
    expect(convieneSincronizar(situacion())).toBe(true);
  });

  /**
   * EL FALLO QUE MOTIVA ESTA PRUEBA. Al abrir la aplicacion, la capa de
   * campo se arma antes de que se haya leido cuanto hay en cola: en ese
   * instante `pendientes` vale 0. Una version anterior se iba ahi y no
   * volvia a mirar, asi que el trabajo del dia se quedaba en el telefono
   * hasta que alguien pulsara «Enviar ahora».
   *
   * La proteccion no esta en este `false` —que es correcto— sino en que la
   * decision se vuelve a tomar cuando el numero real aparece. Por eso las
   * dos lineas van juntas.
   */
  it('con la cola aun sin leer no se envia, y si en cuanto se sabe que hay', () => {
    expect(convieneSincronizar(situacion({ pendientes: 0 }))).toBe(false);
    expect(convieneSincronizar(situacion({ pendientes: 2 }))).toBe(true);
  });

  it('sin señal no se intenta: solo gastaria bateria', () => {
    expect(convieneSincronizar(situacion({ enLinea: false }))).toBe(false);
  });

  it('antes de que la base local este abierta no se intenta', () => {
    expect(convieneSincronizar(situacion({ listo: false }))).toBe(false);
  });

  it('con un envio ya en marcha no se arranca otro', () => {
    expect(convieneSincronizar(situacion({ sincronizando: true }))).toBe(false);
  });

  /**
   * Sin dispositivo vinculado el servidor rechaza la cola entera, y va a
   * seguir rechazandola hasta que la jefatura autorice el navegador.
   * Reintentar cada vez que cambia algo seria machacar la bateria del
   * telefono del tecnico por nada.
   */
  it('sin el dispositivo autorizado no se reintenta en vano', () => {
    expect(convieneSincronizar(situacion({ faltaVincularDispositivo: true }))).toBe(false);
  });
});
