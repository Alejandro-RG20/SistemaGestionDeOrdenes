/** Controlador de los indicadores de operacion y del tablero de inicio. */
import type { Request, Response } from 'express';
import { responderDatos } from '../../comun/respuesta.js';
import { actorDe } from '../../comun/autenticacion.js';
import * as servicio from './servicio.js';
import * as servicioTablero from './servicio-tablero.js';

export async function operacion(_peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.calcular());
}

/**
 * El tablero de inicio (pliego §42).
 *
 * Lleva el actor porque las cifras van cercadas: el usuario de una sucursal
 * no cuenta las ordenes del pais, y el tecnico cuenta las suyas. Un tablero
 * sin cerco es la misma fuga que la lista de ordenes, solo que agregada.
 */
export async function tablero(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicioTablero.obtener(actorDe(peticion)));
}
