/** Controlador de los indicadores de operacion. */
import type { Request, Response } from 'express';
import { responderDatos } from '../../comun/respuesta.js';
import * as servicio from './servicio.js';

export async function operacion(_peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.calcular());
}
