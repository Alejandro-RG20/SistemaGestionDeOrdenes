/**
 * Limite de peticiones por origen.
 *
 * Existe por el portal publico, que responde a "numero de orden + telefono"
 * sin sesion. Sin freno, cualquiera puede recorrer numeros de orden con un
 * telefono cualquiera hasta dar con uno que case, y eso convierte una
 * consulta comoda para el cliente en un raspador de datos ajenos.
 *
 * Es una ventana deslizante en memoria del proceso. Con un solo servidor
 * —que es el caso del centro— alcanza; si algun dia hay varios detras de un
 * balanceador, esto hay que mover a un almacen compartido, y por eso el
 * limitador esta aparte y no incrustado en la ruta.
 */
import type { NextFunction, Request, Response } from 'express';
import { ErrorAplicacion } from './errores.js';

export class ErrorDemasiadasPeticiones extends ErrorAplicacion {
  constructor(mensaje: string) {
    super('DEMASIADAS_PETICIONES', mensaje);
  }
}

interface Ventana {
  intentos: number;
  reiniciaEn: number;
}

export interface OpcionesLimite {
  readonly maximo: number;
  readonly ventanaMs: number;
  readonly mensaje: string;
}

/** Cada cuanto se barren las ventanas vencidas. */
const LIMPIEZA_MS = 60_000;

export function limitarPeticiones(opciones: OpcionesLimite) {
  const ventanas = new Map<string, Ventana>();

  // Sin esto el mapa crece con cada IP que pase por aqui y no baja nunca.
  const barrido = setInterval(() => {
    const ahora = Date.now();
    for (const [clave, ventana] of ventanas) {
      if (ventana.reiniciaEn <= ahora) ventanas.delete(clave);
    }
  }, LIMPIEZA_MS);
  // Que el temporizador no impida que el proceso termine.
  barrido.unref?.();

  return (peticion: Request, _respuesta: Response, siguiente: NextFunction): void => {
    const origen = peticion.ip ?? peticion.socket.remoteAddress ?? 'desconocido';
    const ahora = Date.now();
    const ventana = ventanas.get(origen);

    if (ventana === undefined || ventana.reiniciaEn <= ahora) {
      ventanas.set(origen, { intentos: 1, reiniciaEn: ahora + opciones.ventanaMs });
      siguiente();
      return;
    }

    ventana.intentos += 1;
    if (ventana.intentos > opciones.maximo) {
      siguiente(new ErrorDemasiadasPeticiones(opciones.mensaje));
      return;
    }
    siguiente();
  };
}
