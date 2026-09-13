/**
 * Unico lugar del sistema donde un error se convierte en codigo HTTP.
 *
 * Los servicios lanzan errores de dominio y no saben que existe el HTTP;
 * los controladores los dejan propagar. Aqui se traducen, se registran con
 * su identificador de correlacion y se devuelve al cliente un mensaje
 * legible, nunca el detalle tecnico.
 */
import type { NextFunction, Request, Response } from 'express';
import {
  ErrorAplicacion, ErrorAutenticacion, ErrorAutorizacion, ErrorConflicto,
  ErrorDominio, ErrorNoEncontrado, ErrorValidacion,
} from './errores.js';
import { bitacora } from './bitacora.js';
import type { DetalleError } from '@servitotal/compartido';

const MENSAJE_GENERICO =
  'Ocurrio un problema al procesar la solicitud. Intente de nuevo; si persiste, ' +
  'reporte el identificador que aparece en este mensaje.';

function estadoDe(error: unknown): number {
  if (error instanceof ErrorValidacion) return 400;
  if (error instanceof ErrorAutenticacion) return 401;
  if (error instanceof ErrorAutorizacion) return 403;
  if (error instanceof ErrorNoEncontrado) return 404;
  if (error instanceof ErrorConflicto) return 409;
  if (error instanceof ErrorDominio) return 422;
  return 500;
}

export function manejarErrores(
  error: unknown,
  peticion: Request,
  respuesta: Response,
  siguiente: NextFunction,
): void {
  if (respuesta.headersSent) {
    siguiente(error);
    return;
  }

  const estado = estadoDe(error);
  const idCorrelacion = peticion.contexto?.idCorrelacion ?? 'sin-correlacion';
  const esEsperado = estado < 500;

  // Toda excepcion se registra o se propaga; ninguna se silencia.
  const registrar = esEsperado ? bitacora.advertencia : bitacora.error;
  registrar(`${peticion.method} ${peticion.originalUrl} termino en ${estado}`, {
    idCorrelacion,
    codigo: error instanceof ErrorAplicacion ? error.codigo : 'ERROR_NO_CONTROLADO',
    detalle: error instanceof Error ? error.message : String(error),
    ...(esEsperado ? {} : { pila: error instanceof Error ? error.stack : undefined }),
  });

  const detalle: DetalleError = {
    codigo: error instanceof ErrorAplicacion ? error.codigo : 'ERROR_INTERNO',
    mensaje: esEsperado && error instanceof ErrorAplicacion ? error.message : MENSAJE_GENERICO,
    idCorrelacion,
    ...(error instanceof ErrorValidacion && Object.keys(error.campos).length > 0
      ? { campos: error.campos }
      : {}),
  };

  respuesta.status(estado).json({ error: detalle });
}

/** Ruta inexistente: tambien responde con la forma uniforme. */
export function manejarRutaDesconocida(peticion: Request, respuesta: Response): void {
  respuesta.status(404).json({
    error: {
      codigo: 'RUTA_DESCONOCIDA',
      mensaje: `La direccion ${peticion.method} ${peticion.originalUrl} no existe en este sistema.`,
      idCorrelacion: peticion.contexto?.idCorrelacion ?? 'sin-correlacion',
    },
  });
}
