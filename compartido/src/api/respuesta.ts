/**
 * Forma unica de toda respuesta de la API (pliego §50).
 *
 *   exito  ->  { success: true,  data: … }        (+ pagination en listados)
 *   fallo  ->  { success: false, error: { code, message, … } }
 *
 * POR QUE LAS CLAVES DEL CABLE ESTAN EN INGLES
 *
 * El proyecto se escribe en español: las tablas, las funciones, los
 * comentarios y los nombres internos. Estas cuatro claves no, porque no son
 * nombres internos: son el CONTRATO de la API, y el pliego lo fija asi. Un
 * nombre de protocolo no es una decision de estilo; cambiarlo por comodidad
 * interna rompe a cualquiera que ya lea la respuesta.
 *
 * La traduccion ocurre al serializar —en `comun/respuesta.ts` y en el
 * manejador de errores— y en ningun otro sitio. Dentro del codigo el dato se
 * sigue llamando `datos`, la paginacion `paginacion` y el identificador de
 * correlacion `idCorrelacion`.
 */

export interface Paginacion {
  readonly pagina: number;
  readonly tamano: number;
  readonly total: number;
  readonly totalPaginas: number;
}

export interface RespuestaExitosa<T> {
  readonly success: true;
  readonly data: T;
  /** Solo en listados, y en el kardex, cuyas lineas se paginan. */
  readonly pagination?: Paginacion;
}

export interface DetalleError {
  readonly code: string;
  readonly message: string;
  /**
   * El identificador que une esta respuesta con su linea en la bitacora.
   *
   * El detalle tecnico nunca sale hacia el cliente: se queda en el servidor,
   * localizable por este identificador. Es lo que permite que el mensaje al
   * usuario sea legible y el diagnostico siga siendo posible.
   */
  readonly correlationId: string;
  /** Errores por campo, cuando el fallo es de validacion. */
  readonly fields?: Readonly<Record<string, string>>;
}

export interface RespuestaError {
  readonly success: false;
  readonly error: DetalleError;
}

export type Respuesta<T> = RespuestaExitosa<T> | RespuestaError;

/** Limites de paginacion. Ninguna consulta de listado se sirve sin ellos. */
export const PAGINACION = {
  TAMANO_POR_DEFECTO: 25,
  TAMANO_MAXIMO: 100,
  PRIMERA_PAGINA: 1,
} as const;
