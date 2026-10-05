/**
 * Construccion de la respuesta uniforme de la API (pliego §50). Los
 * controladores usan estas funciones; ningun servicio las conoce.
 *
 * Este archivo y el manejador de errores son los DOS UNICOS sitios donde el
 * vocabulario interno en español se traduce a las claves del contrato en
 * ingles. Si la traduccion se repartiera por los controladores, bastaria con
 * que uno respondiera `datos` para que el contrato dejara de ser uniforme.
 */
import type { Response } from 'express';
import type { Paginacion, RespuestaExitosa } from '@servitotal/compartido';

/**
 * Respuesta de exito.
 *
 * La paginacion es opcional y sirve para el caso del kardex: el dato NO es
 * una lista —es un libro con encabezado y lineas— pero sus lineas se
 * paginan. Sin esto habria que elegir entre perder el encabezado o perder la
 * paginacion, y las dos cosas hacen falta.
 */
export function responderDatos<T>(
  respuesta: Response, datos: T, estado = 200, paginacion?: Paginacion,
): void {
  const cuerpo: RespuestaExitosa<T> = paginacion === undefined
    ? { success: true, data: datos }
    : { success: true, data: datos, pagination: paginacion };
  respuesta.status(estado).json(cuerpo);
}

export function responderListado<T>(
  respuesta: Response,
  datos: readonly T[],
  paginacion: Paginacion,
): void {
  const cuerpo: RespuestaExitosa<readonly T[]> = {
    success: true, data: datos, pagination: paginacion,
  };
  respuesta.status(200).json(cuerpo);
}

export function responderSinContenido(respuesta: Response): void {
  respuesta.status(204).send();
}
