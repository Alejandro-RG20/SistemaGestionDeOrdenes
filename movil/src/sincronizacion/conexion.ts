/**
 * Detector de conexion.
 *
 * "Hay wifi" no es lo mismo que "hay internet": en un barrio con mala
 * cobertura la tableta se queda enganchada a una celda que no pasa datos, y
 * el sistema operativo sigue diciendo que esta conectada. Por eso se exige
 * ADEMAS `isInternetReachable`, y ante la duda se responde que no hay: un
 * falso "no hay conexion" solo retrasa el envio unos minutos, mientras que
 * un falso "si hay" hace que el motor intente subir y falle con el tecnico
 * mirando la pantalla.
 */
import * as Network from 'expo-network';
import type { DetectorDeConexion } from './motor.js';

export class ConexionDelDispositivo implements DetectorDeConexion {
  async hayConexion(): Promise<boolean> {
    try {
      const estado = await Network.getNetworkStateAsync();
      return estado.isConnected === true && estado.isInternetReachable !== false;
    } catch {
      return false;
    }
  }
}

/** Para el taller, donde la red del centro siempre esta. */
export class ConexionSiempre implements DetectorDeConexion {
  async hayConexion(): Promise<boolean> {
    return true;
  }
}
