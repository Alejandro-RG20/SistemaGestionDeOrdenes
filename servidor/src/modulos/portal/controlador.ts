/** Controlador del portal publico. */
import type { Request, Response } from 'express';
import { responderDatos } from '../../comun/respuesta.js';
import { validar } from '../seguridad/esquemas.js';
import { esquemaConsultaPublica } from './esquemas.js';
import * as servicio from './servicio.js';

export async function consultar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaConsultaPublica, {
    numeroOrden: peticion.params['numero'],
    telefono: peticion.query['telefono'],
  });
  responderDatos(respuesta, await servicio.consultar(datos.numeroOrden, datos.telefono));
}
