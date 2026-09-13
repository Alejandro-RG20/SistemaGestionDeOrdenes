/**
 * Forma unica de toda respuesta de la API.
 *
 * En exito: `datos`, y `paginacion` cuando es un listado.
 * En fallo: `error` con codigo, mensaje legible e identificador de
 * correlacion. El detalle tecnico nunca sale hacia el cliente; se queda en
 * la bitacora del servidor, localizable por ese identificador.
 */

export interface Paginacion {
  readonly pagina: number;
  readonly tamano: number;
  readonly total: number;
  readonly totalPaginas: number;
}

export interface RespuestaExitosa<T> {
  readonly datos: T;
  readonly paginacion?: Paginacion;
}

export interface DetalleError {
  readonly codigo: string;
  readonly mensaje: string;
  readonly idCorrelacion: string;
  /** Errores por campo, cuando el fallo es de validacion. */
  readonly campos?: Readonly<Record<string, string>>;
}

export interface RespuestaError {
  readonly error: DetalleError;
}

export type Respuesta<T> = RespuestaExitosa<T> | RespuestaError;

/** Limites de paginacion. Ninguna consulta de listado se sirve sin ellos. */
export const PAGINACION = {
  TAMANO_POR_DEFECTO: 25,
  TAMANO_MAXIMO: 100,
  PRIMERA_PAGINA: 1,
} as const;
