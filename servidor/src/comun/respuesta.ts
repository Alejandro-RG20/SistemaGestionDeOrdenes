/**
 * Construccion de la respuesta uniforme de la API. Los controladores usan
 * estas funciones; ningun servicio las conoce.
 */
import type { Response } from 'express';
import type { Paginacion, RespuestaExitosa } from '@servitotal/compartido';

export function responderDatos<T>(respuesta: Response, datos: T, estado = 200): void {
  const cuerpo: RespuestaExitosa<T> = { datos };
  respuesta.status(estado).json(cuerpo);
}

export function responderListado<T>(
  respuesta: Response,
  datos: readonly T[],
  paginacion: Paginacion,
): void {
  const cuerpo: RespuestaExitosa<readonly T[]> = { datos, paginacion };
  respuesta.status(200).json(cuerpo);
}

export function responderSinContenido(respuesta: Response): void {
  respuesta.status(204).send();
}
