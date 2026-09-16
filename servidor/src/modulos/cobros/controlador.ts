/** Controladores de cobros. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { actorDe } from '../../comun/autenticacion.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import {
  esquemaFiltroExpedientes, esquemaMoverExpediente, esquemaRegistrarPago,
} from './esquemas.js';
import * as servicio from './servicio.js';

const identificador = (peticion: Request, clave = 'id'): string =>
  validar(esquemaIdentificador, peticion.params[clave]);

export async function listar(peticion: Request, respuesta: Response): Promise<void> {
  const filtro = validar(esquemaFiltroExpedientes, peticion.query);
  const pagina = await servicio.listar(filtro, leerParametrosPagina(peticion.query));
  responderListado(respuesta, pagina.datos, pagina.paginacion);
}

export async function obtener(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.obtener(identificador(peticion)));
}

export async function conformar(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(
    respuesta, await servicio.conformar(actorDe(peticion), identificador(peticion)), 201,
  );
}

export async function verificar(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.verificar(actorDe(peticion), identificador(peticion)));
}

export async function mover(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaMoverExpediente, peticion.body);
  responderDatos(respuesta, await servicio.mover(actorDe(peticion), identificador(peticion), datos));
}

export async function listarPagos(peticion: Request, respuesta: Response): Promise<void> {
  const idOrden = peticion.query['idOrden'] === undefined
    ? undefined
    : validar(esquemaIdentificador, peticion.query['idOrden']);
  const pagina = await servicio.listarPagos(idOrden, leerParametrosPagina(peticion.query));
  responderListado(respuesta, pagina.datos, pagina.paginacion);
}

export async function registrarPago(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaRegistrarPago, peticion.body);
  responderDatos(
    respuesta, await servicio.registrarPago(actorDe(peticion), identificador(peticion), datos), 201,
  );
}

export async function indicadores(_peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.indicadores());
}
