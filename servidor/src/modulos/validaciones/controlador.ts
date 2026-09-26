/** Controladores de validacion tecnica. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { actorDe } from '../../comun/autenticacion.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import { esquemaValidar } from './esquemas.js';
import * as servicio from './servicio.js';

const identificador = (peticion: Request): string =>
  validar(esquemaIdentificador, peticion.params['id']);

export async function pendientes(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = await servicio.pendientes(leerParametrosPagina(peticion.query));
  responderListado(respuesta, pagina.datos, pagina.paginacion);
}

export async function expediente(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.expediente(actorDe(peticion), identificador(peticion)));
}

export async function listarDeOrden(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.listarDeOrden(identificador(peticion)));
}

export async function registrar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaValidar, peticion.body);
  responderDatos(
    respuesta,
    await servicio.registrar(actorDe(peticion), identificador(peticion), datos),
    201,
  );
}
