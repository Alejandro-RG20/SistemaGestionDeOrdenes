/**
 * Middleware de autorizacion.
 *
 * Los permisos que se comparan aqui vienen de rol_permiso, releidos en cada
 * peticion por el middleware de autenticacion. Ocultar un boton en el panel
 * no es control de acceso: esta comprobacion es la que manda, y responde
 * igual aunque la llamada venga de la interfaz o de un cliente HTTP suelto.
 */
import type { RequestHandler } from 'express';
import type { CodigoPermiso } from '@servitotal/compartido';
import { ErrorAutorizacion } from './errores.js';
import { usuarioDe } from './autenticacion.js';

/** Exige que el usuario tenga TODOS los permisos indicados. */
export function exigirPermiso(...requeridos: readonly CodigoPermiso[]): RequestHandler {
  return function comprobarPermiso(peticion, _respuesta, siguiente): void {
    try {
      const usuario = usuarioDe(peticion);
      const faltantes = requeridos.filter((permiso) => !usuario.permisos.includes(permiso));
      if (faltantes.length > 0) {
        throw new ErrorAutorizacion(
          'Su perfil no tiene autorizacion para realizar esta operacion. ' +
            'Si la necesita, solicitela a la jefatura de atencion al cliente.',
        );
      }
      siguiente();
    } catch (error) {
      siguiente(error);
    }
  };
}

/**
 * Envuelve un controlador asincrono para que sus fallos lleguen al
 * manejador de errores. Sin esto, una promesa rechazada dejaria la peticion
 * colgada: capturar y silenciar no es opcion.
 */
export function asincrono(
  controlador: (peticion: Parameters<RequestHandler>[0], respuesta: Parameters<RequestHandler>[1]) => Promise<void>,
): RequestHandler {
  return function envoltura(peticion, respuesta, siguiente): void {
    controlador(peticion, respuesta).catch(siguiente);
  };
}
