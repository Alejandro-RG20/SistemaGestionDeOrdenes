/**
 * Patron Especificacion.
 *
 * Cada condicion del negocio se escribe una vez, con nombre, y se combina
 * con otras. La ventaja no es la elegancia: es que cuando una orden sale
 * clasificada de un modo que al taller le sorprende, se puede decir cual de
 * estas condiciones se cumplio y cual no, en lugar de leer un `if` de
 * catorce lineas.
 */

export interface Especificacion<T> {
  /** Nombre legible, el que aparece en la explicacion de la decision. */
  readonly nombre: string;
  seCumple(candidato: T): boolean;
}

export function especificacion<T>(nombre: string, predicado: (candidato: T) => boolean): Especificacion<T> {
  return { nombre, seCumple: predicado };
}

export function y<T>(...partes: readonly Especificacion<T>[]): Especificacion<T> {
  return {
    nombre: partes.map((parte) => parte.nombre).join(' y '),
    seCumple: (candidato) => partes.every((parte) => parte.seCumple(candidato)),
  };
}

export function o<T>(...partes: readonly Especificacion<T>[]): Especificacion<T> {
  return {
    nombre: partes.map((parte) => parte.nombre).join(' o '),
    seCumple: (candidato) => partes.some((parte) => parte.seCumple(candidato)),
  };
}

export function no<T>(parte: Especificacion<T>): Especificacion<T> {
  return {
    nombre: `no ${parte.nombre}`,
    seCumple: (candidato) => !parte.seCumple(candidato),
  };
}

/** Se cumple siempre. Es el ultimo recurso de una cadena de estrategias. */
export function siempre<T>(nombre: string): Especificacion<T> {
  return especificacion<T>(nombre, () => true);
}

export interface ParteEvaluada {
  readonly nombre: string;
  readonly seCumplio: boolean;
}

/**
 * Evalua cada parte por separado. Sirve para explicar la decision al
 * asistente del taller: que condicion fallo, no solo que el resultado fue
 * `particular`.
 */
export function desglosar<T>(
  partes: readonly Especificacion<T>[],
  candidato: T,
): readonly ParteEvaluada[] {
  return partes.map((parte) => ({ nombre: parte.nombre, seCumplio: parte.seCumple(candidato) }));
}
