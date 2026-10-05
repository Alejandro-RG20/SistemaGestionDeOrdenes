/**
 * Unico lugar del sistema donde un error se convierte en codigo HTTP.
 *
 * Los servicios lanzan errores de dominio y no saben que existe el HTTP;
 * los controladores los dejan propagar. Aqui se traducen, se registran con
 * su identificador de correlacion y se devuelve al cliente un mensaje
 * legible, nunca el detalle tecnico.
 */
import type { NextFunction, Request, Response } from 'express';
import { ErrorDemasiadasPeticiones } from './limite-peticiones.js';
import {
  ErrorAplicacion, ErrorAutenticacion, ErrorAutorizacion, ErrorConflicto,
  ErrorDominio, ErrorNoEncontrado, ErrorValidacion,
} from './errores.js';
import { bitacora } from './bitacora.js';
import type { DetalleError } from '@servitotal/compartido';

const MENSAJE_GENERICO =
  'Ocurrio un problema al procesar la solicitud. Intente de nuevo; si persiste, ' +
  'reporte el identificador que aparece en este mensaje.';

/**
 * Un cuerpo que no es JSON valido, o que excede el limite.
 *
 * Los lanza `express.json()` antes de que la peticion llegue a ninguna ruta,
 * asi que no pasan por `ErrorValidacion` y caian en el 500 generico. Un 500
 * dice «el problema es nuestro», y aqui el problema es del cuerpo que llego:
 * quien integra con la API se queda buscando un fallo del servidor que no
 * existe.
 */
function esCuerpoMalformado(error: unknown): boolean {
  if (!(error instanceof SyntaxError) && !(error instanceof Error)) return false;
  const tipo = (error as { type?: string }).type;
  return tipo === 'entity.parse.failed'
    || tipo === 'entity.too.large'
    || tipo === 'encoding.unsupported';
}

function mensajeDelCuerpo(error: unknown): string {
  const tipo = (error as { type?: string }).type;
  if (tipo === 'entity.too.large') {
    return 'El contenido enviado es demasiado grande. Las fotos y documentos no se envian por '
      + 'aqui: use la carga de evidencias, que sube por partes.';
  }
  return 'El cuerpo de la peticion no es JSON valido.';
}

function estadoDe(error: unknown): number {
  if (esCuerpoMalformado(error)) {
    return (error as { type?: string }).type === 'entity.too.large' ? 413 : 400;
  }
  if (error instanceof ErrorValidacion) return 400;
  if (error instanceof ErrorAutenticacion) return 401;
  if (error instanceof ErrorAutorizacion) return 403;
  if (error instanceof ErrorNoEncontrado) return 404;
  if (error instanceof ErrorConflicto) return 409;
  if (error instanceof ErrorDemasiadasPeticiones) return 429;
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
    codigo: esCuerpoMalformado(error)
      ? 'CUERPO_INVALIDO'
      : error instanceof ErrorAplicacion ? error.codigo : 'ERROR_NO_CONTROLADO',
    detalle: error instanceof Error ? error.message : String(error),
    ...(esEsperado ? {} : { pila: error instanceof Error ? error.stack : undefined }),
  });

  /*
   * Aqui se traduce el vocabulario interno a las claves del contrato (§50).
   * Es el unico sitio donde ocurre para los fallos, igual que
   * `comun/respuesta.ts` lo es para los exitos.
   *
   * El mensaje tecnico NO sale cuando el fallo es inesperado: queda en la
   * bitacora de arriba, localizable por el identificador de correlacion que
   * si viaja. Lo que el usuario lee es generico a proposito.
   */
  const malformado = esCuerpoMalformado(error);

  const detalle: DetalleError = {
    code: malformado
      ? 'CUERPO_INVALIDO'
      : error instanceof ErrorAplicacion ? error.codigo : 'ERROR_INTERNO',
    message: malformado
      ? mensajeDelCuerpo(error)
      : esEsperado && error instanceof ErrorAplicacion ? error.message : MENSAJE_GENERICO,
    correlationId: idCorrelacion,
    ...(error instanceof ErrorValidacion && Object.keys(error.campos).length > 0
      ? { fields: error.campos }
      : {}),
  };

  respuesta.status(estado).json({ success: false, error: detalle });
}

/** Ruta inexistente: tambien responde con la forma uniforme. */
export function manejarRutaDesconocida(peticion: Request, respuesta: Response): void {
  respuesta.status(404).json({
    success: false,
    error: {
      code: 'RUTA_DESCONOCIDA',
      message: `La direccion ${peticion.method} ${peticion.originalUrl} no existe en este sistema.`,
      correlationId: peticion.contexto?.idCorrelacion ?? 'sin-correlacion',
    },
  });
}
