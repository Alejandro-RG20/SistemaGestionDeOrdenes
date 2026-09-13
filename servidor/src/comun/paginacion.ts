/**
 * Paginacion. Ninguna consulta de listado se sirve sin ella, sin
 * excepciones (regla de arquitectura 5).
 */
import { PAGINACION, type Paginacion } from '@servitotal/compartido';
import { ErrorValidacion } from './errores.js';

export interface ParametrosPagina {
  readonly pagina: number;
  readonly tamano: number;
  readonly desplazamiento: number;
}

/**
 * Interpreta `pagina` y `tamano` de la consulta. Un tamano por encima del
 * maximo es un error explicito, no un recorte silencioso: quien pide 5 000
 * filas debe enterarse de que no las va a recibir.
 */
export function leerParametrosPagina(consulta: Record<string, unknown>): ParametrosPagina {
  const pagina = enteroPositivo(consulta['pagina'], PAGINACION.PRIMERA_PAGINA, 'pagina');
  const tamano = enteroPositivo(consulta['tamano'], PAGINACION.TAMANO_POR_DEFECTO, 'tamano');

  if (tamano > PAGINACION.TAMANO_MAXIMO) {
    throw new ErrorValidacion(
      `No se pueden pedir mas de ${PAGINACION.TAMANO_MAXIMO} registros por pagina.`,
      { tamano: `El maximo es ${PAGINACION.TAMANO_MAXIMO}.` },
    );
  }

  return { pagina, tamano, desplazamiento: (pagina - 1) * tamano };
}

function enteroPositivo(bruto: unknown, porDefecto: number, campo: string): number {
  if (bruto === undefined || bruto === '') return porDefecto;
  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor < 1) {
    throw new ErrorValidacion(
      `El valor de "${campo}" debe ser un numero entero mayor que cero.`,
      { [campo]: `Se recibio "${String(bruto)}".` },
    );
  }
  return valor;
}

export function construirPaginacion(parametros: ParametrosPagina, total: number): Paginacion {
  return {
    pagina: parametros.pagina,
    tamano: parametros.tamano,
    total,
    totalPaginas: total === 0 ? 0 : Math.ceil(total / parametros.tamano),
  };
}
