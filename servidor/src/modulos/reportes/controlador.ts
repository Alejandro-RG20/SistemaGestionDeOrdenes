/** Controladores de reportes. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos } from '../../comun/respuesta.js';
import { validar } from '../seguridad/esquemas.js';
import { esquemaConsultaReporte } from './esquemas.js';
import * as servicio from './servicio.js';

export async function catalogo(_peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, servicio.catalogo());
}

export async function ejecutar(peticion: Request, respuesta: Response): Promise<void> {
  const { clave, desde, hasta } = validar(esquemaConsultaReporte, {
    clave: peticion.params['clave'],
    ...peticion.query,
  });
  responderDatos(respuesta, await servicio.ejecutar(clave, desde, hasta));
}
