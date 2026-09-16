/** Controlador de la bandeja de avisos. */
import type { Request, Response } from 'express';
import { responderDatos } from '../../comun/respuesta.js';
import { actorDe } from '../../comun/autenticacion.js';
import * as servicio from './servicio.js';

export async function bandeja(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.bandejaDe(actorDe(peticion)));
}
