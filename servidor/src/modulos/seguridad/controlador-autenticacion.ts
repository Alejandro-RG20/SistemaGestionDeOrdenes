/**
 * Controladores de sesion. Traducen HTTP a llamadas de servicio y nada mas:
 * aqui no hay SQL ni reglas de negocio.
 */
import type { Request, Response } from 'express';
import { responderDatos, responderSinContenido } from '../../comun/respuesta.js';
import { usuarioDe } from '../../comun/autenticacion.js';
import { esquemaIniciarSesion, esquemaRefrescar, validar } from './esquemas.js';
import * as servicio from './servicio-autenticacion.js';

export async function iniciarSesion(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaIniciarSesion, peticion.body);
  const sesion = await servicio.iniciarSesion(datos);
  responderDatos(respuesta, sesion, 201);
}

export async function refrescar(peticion: Request, respuesta: Response): Promise<void> {
  const { tokenRefresco } = validar(esquemaRefrescar, peticion.body);
  const sesion = await servicio.refrescarSesion(tokenRefresco);
  responderDatos(respuesta, sesion);
}

export async function cerrarSesion(peticion: Request, respuesta: Response): Promise<void> {
  await servicio.cerrarSesion(peticion.contexto.idDispositivo);
  responderSinContenido(respuesta);
}

/** Perfil y permisos vigentes: lo que el panel usa para dibujar su menu. */
export async function perfil(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, usuarioDe(peticion));
}
