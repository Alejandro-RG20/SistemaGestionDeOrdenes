/** Controladores de entregas. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos } from '../../comun/respuesta.js';
import { actorDe } from '../../comun/autenticacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import { esquemaEntregar } from './esquemas.js';
import * as servicio from './servicio.js';

const identificador = (peticion: Request): string =>
  validar(esquemaIdentificador, peticion.params['id']);

export async function verificar(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.verificar(actorDe(peticion), identificador(peticion)));
}

export async function entregar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaEntregar, peticion.body);
  responderDatos(
    respuesta, await servicio.entregar(actorDe(peticion), identificador(peticion), datos), 201,
  );
}
