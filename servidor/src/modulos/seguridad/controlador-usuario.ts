/** Controladores de usuarios. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado, responderSinContenido } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { actorDe } from '../../comun/autenticacion.js';
import {
  esquemaActualizarUsuario, esquemaCambiarContrasena, esquemaCrearUsuario,
  esquemaIdentificador, esquemaMotivo, validar,
} from './esquemas.js';
import * as servicio from './servicio-usuario.js';

function identificador(peticion: Request): string {
  return validar(esquemaIdentificador, peticion.params['id']);
}

export async function listar(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await servicio.listar({
    texto: typeof peticion.query['texto'] === 'string' ? peticion.query['texto'] : undefined,
    codigoRol: typeof peticion.query['rol'] === 'string' ? peticion.query['rol'] : undefined,
    soloActivos: peticion.query['soloActivos'] !== 'false',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function obtener(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.obtener(identificador(peticion)));
}

export async function crear(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaCrearUsuario, peticion.body);
  responderDatos(respuesta, await servicio.crear(actorDe(peticion), datos), 201);
}

export async function actualizar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaActualizarUsuario, peticion.body);
  responderDatos(respuesta, await servicio.actualizar(actorDe(peticion), identificador(peticion), datos));
}

export async function cambiarContrasena(peticion: Request, respuesta: Response): Promise<void> {
  const { contrasena } = validar(esquemaCambiarContrasena, peticion.body);
  await servicio.cambiarContrasena(actorDe(peticion), identificador(peticion), contrasena);
  responderSinContenido(respuesta);
}

export async function desbloquear(peticion: Request, respuesta: Response): Promise<void> {
  const { motivo } = validar(esquemaMotivo, peticion.body);
  await servicio.desbloquear(actorDe(peticion), identificador(peticion), motivo);
  responderSinContenido(respuesta);
}

export async function desactivar(peticion: Request, respuesta: Response): Promise<void> {
  const { motivo } = validar(esquemaMotivo, peticion.body);
  await servicio.desactivar(actorDe(peticion), identificador(peticion), motivo);
  responderSinContenido(respuesta);
}
