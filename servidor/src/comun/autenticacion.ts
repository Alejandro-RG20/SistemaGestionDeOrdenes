/**
 * Middleware de autenticacion.
 *
 * Resuelve el token de acceso a un usuario vigente con sus permisos
 * actuales. No conoce el modulo de seguridad: recibe inyectada la funcion
 * que lo carga, de modo que la comunicacion entre modulos sigue pasando por
 * la capa de servicios (regla de arquitectura 3).
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UsuarioAutenticado } from '@servitotal/compartido';
import type { Actor } from './contexto-peticion.js';
import { ErrorAutenticacion } from './errores.js';
import { TIPO_TOKEN, verificar } from './tokens.js';

export type CargarUsuarioAutenticado = (idUsuario: string) => Promise<UsuarioAutenticado | null>;

const PREFIJO_PORTADOR = 'Bearer ';

/** Todas las peticiones llevan identificador de correlacion, tengan sesion o no. */
export function asignarCorrelacion(peticion: Request, _respuesta: Response, siguiente: NextFunction): void {
  const recibido = peticion.header('X-Id-Correlacion');
  peticion.contexto = {
    idCorrelacion: recibido !== undefined && recibido.length <= 64 ? recibido : randomUUID(),
  };
  siguiente();
}

function leerToken(peticion: Request): string {
  const cabecera = peticion.header('Authorization');
  if (cabecera === undefined || !cabecera.startsWith(PREFIJO_PORTADOR)) {
    throw new ErrorAutenticacion('Debe iniciar sesion para realizar esta operacion.');
  }
  return cabecera.slice(PREFIJO_PORTADOR.length).trim();
}

/**
 * Exige sesion valida. El usuario y sus permisos se releen en cada peticion:
 * un usuario desactivado o un permiso retirado surten efecto de inmediato.
 */
export function crearExigirSesion(cargarUsuario: CargarUsuarioAutenticado): RequestHandler {
  return function exigirSesion(peticion, _respuesta, siguiente): void {
    const token = leerToken(peticion);
    verificar(token, TIPO_TOKEN.ACCESO)
      .then(async (contenido) => {
        const usuario = await cargarUsuario(contenido.idUsuario);
        if (usuario === null) {
          throw new ErrorAutenticacion('Su cuenta ya no esta activa. Consulte con la jefatura.');
        }
        peticion.contexto = {
          ...peticion.contexto,
          usuario,
          ...(contenido.idDispositivo !== undefined ? { idDispositivo: contenido.idDispositivo } : {}),
        };
        siguiente();
      })
      .catch(siguiente);
  };
}

/**
 * Actor de la peticion, tal como lo esperan los servicios. Un solo sitio lo
 * arma, en lugar de repetir el mismo mapeo en cada controlador.
 */
export function actorDe(peticion: Request): Actor {
  const usuario = usuarioDe(peticion);
  return {
    id: usuario.id,
    nombreUsuario: usuario.nombreUsuario,
    idCentro: usuario.idCentro,
    rol: usuario.rol,
    permisos: usuario.permisos,
  };
}

/** Usuario de la peticion. Solo se llama despues de exigirSesion. */
export function usuarioDe(peticion: Request): UsuarioAutenticado {
  const usuario = peticion.contexto?.usuario;
  if (usuario === undefined) {
    throw new ErrorAutenticacion('Debe iniciar sesion para realizar esta operacion.');
  }
  return usuario;
}
