/** Controladores de tiendas. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos } from '../../comun/respuesta.js';
import { actorDe } from '../../comun/autenticacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import { esquemaTienda } from './esquemas.js';
import * as servicio from './servicio.js';

const identificador = (peticion: Request): string =>
  validar(esquemaIdentificador, peticion.params['id']);

export async function listar(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.listar(peticion.query['soloActivas'] === 'true'));
}

export async function obtener(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.obtener(identificador(peticion)));
}

export async function crear(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(
    respuesta, await servicio.crear(actorDe(peticion), validar(esquemaTienda, peticion.body)), 201,
  );
}

export async function editar(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(
    respuesta,
    await servicio.editar(
      actorDe(peticion), identificador(peticion), validar(esquemaTienda, peticion.body),
    ),
  );
}

export async function desactivar(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.desactivar(actorDe(peticion), identificador(peticion)));
}

export async function activar(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.activar(actorDe(peticion), identificador(peticion)));
}
