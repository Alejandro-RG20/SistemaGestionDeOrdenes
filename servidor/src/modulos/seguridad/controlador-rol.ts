/** Controladores de roles, permisos y bitacora. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { actorDe } from '../../comun/autenticacion.js';
import { esquemaAsignarPermisos, esquemaIdentificador, validar } from './esquemas.js';
import * as servicio from './servicio-rol.js';

export async function listarRoles(peticion: Request, respuesta: Response): Promise<void> {
  const resultado = await servicio.listarRoles(leerParametrosPagina(peticion.query as Record<string, unknown>));
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function listarPermisos(peticion: Request, respuesta: Response): Promise<void> {
  const resultado = await servicio.listarPermisos(leerParametrosPagina(peticion.query as Record<string, unknown>));
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function listarPermisosDeRol(peticion: Request, respuesta: Response): Promise<void> {
  const idRol = validar(esquemaIdentificador, peticion.params['id']);
  responderDatos(respuesta, await servicio.listarPermisosDeRol(idRol));
}

export async function asignarPermisos(peticion: Request, respuesta: Response): Promise<void> {
  const idRol = validar(esquemaIdentificador, peticion.params['id']);
  const datos = validar(esquemaAsignarPermisos, peticion.body);
  const permisos = await servicio.asignarPermisos(actorDe(peticion), idRol, datos);
  responderDatos(respuesta, permisos);
}

export async function listarBitacora(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await servicio.listarBitacora({
    tabla: typeof peticion.query['tabla'] === 'string' ? peticion.query['tabla'] : undefined,
    idRegistro: typeof peticion.query['idRegistro'] === 'string'
      ? validar(esquemaIdentificador, peticion.query['idRegistro'])
      : undefined,
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}
