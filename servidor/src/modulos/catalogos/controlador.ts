/** Controlador de catalogos de apoyo. */
import type { Request, Response } from 'express';
import { responderDatos } from '../../comun/respuesta.js';
import { actorDe } from '../../comun/autenticacion.js';
import * as servicio from './servicio.js';

export async function obtener(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.obtener(actorDe(peticion)));
}
