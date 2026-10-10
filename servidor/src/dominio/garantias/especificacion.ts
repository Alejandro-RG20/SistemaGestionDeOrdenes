/**
 * Patron Especificacion.
 *
 * Cada condicion se escribe una vez, con nombre. Ya no deciden quien paga
 * —eso lo elige una persona—; sirven para INFORMAR: si una garantia esta
 * vigente, si aplica a quien pide el servicio y, si no, por que.
 */

export interface Especificacion<T> {
  /** Nombre legible, el que aparece en las advertencias. */
  readonly nombre: string;
  seCumple(candidato: T): boolean;
}

export function especificacion<T>(nombre: string, predicado: (candidato: T) => boolean): Especificacion<T> {
  return { nombre, seCumple: predicado };
}
