/**
 * Detector de conexion del navegador.
 *
 * `navigator.onLine` NO SIRVE SOLO. Dice si hay una interfaz de red
 * levantada, no si se llega al servidor: en un barrio con mala cobertura el
 * telefono sigue enganchado a una celda que no pasa datos, y `onLine`
 * responde `true` tan contento. Por eso, cuando dice que hay red, se
 * comprueba de verdad contra el endpoint de salud.
 *
 * Al reves si es fiable: si dice que NO hay red, no la hay, y se ahorra el
 * viaje.
 */
import type { DetectorDeConexion } from './motor.js';

/** Cuanto se espera a la comprobacion antes de darla por perdida. */
const ESPERA_MS = 4000;

export class ConexionDelNavegador implements DetectorDeConexion {
  constructor(private readonly raizApi: string) {}

  async hayConexion(): Promise<boolean> {
    if (navigator.onLine === false) return false;

    try {
      const aborto = new AbortController();
      const temporizador = setTimeout(() => aborto.abort(), ESPERA_MS);
      const respuesta = await fetch(`${this.raizApi}/salud`, {
        method: 'GET',
        // Sin cache: una respuesta guardada diria que hay servidor cuando no.
        cache: 'no-store',
        signal: aborto.signal,
      });
      clearTimeout(temporizador);
      return respuesta.ok;
    } catch {
      return false;
    }
  }
}

/** Para las pruebas y para el taller, donde la red del centro siempre esta. */
export class ConexionSiempre implements DetectorDeConexion {
  async hayConexion(): Promise<boolean> {
    return true;
  }
}
