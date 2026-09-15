/** Controladores de sincronizacion. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { actorDe } from '../../comun/autenticacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import { esquemaResolverExcepcion, esquemaSincronizar } from './esquemas.js';
import * as servicio from './servicio.js';
import * as excepciones from './servicio-excepciones.js';

const identificador = (peticion: Request): string => validar(esquemaIdentificador, peticion.params['id']);

function textoDeConsulta(peticion: Request, clave: string): string | undefined {
  const valor = peticion.query[clave];
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

export async function sincronizar(peticion: Request, respuesta: Response): Promise<void> {
  const { operaciones } = validar(esquemaSincronizar, peticion.body);
  responderDatos(respuesta, await servicio.procesarCola(actorDe(peticion), operaciones));
}

export async function listarExcepciones(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const idOrden = textoDeConsulta(peticion, 'idOrden');
  const idTecnico = textoDeConsulta(peticion, 'idTecnico');
  const resultado = await excepciones.listar({
    estado: textoDeConsulta(peticion, 'estado'),
    idOrden: idOrden === undefined ? undefined : validar(esquemaIdentificador, idOrden),
    idTecnico: idTecnico === undefined ? undefined : validar(esquemaIdentificador, idTecnico),
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function obtenerExcepcion(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await excepciones.obtener(identificador(peticion)));
}

export async function resolverExcepcion(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaResolverExcepcion, peticion.body);
  responderDatos(respuesta, await excepciones.resolver(actorDe(peticion), identificador(peticion), datos));
}
