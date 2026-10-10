/**
 * Regla de referencia de un articulo.
 *
 * Las reglas de cobertura ya no deciden quien paga una reparacion. Siguen
 * sirviendo para una cosa: decir cuantos meses dura, de ordinario, la
 * garantia del proveedor de una marca y categoria, y asi calcular su
 * vencimiento cuando la ficha del articulo no tiene una registrada.
 *
 * Que la seleccion viva aqui y no en una consulta SQL es deliberado: es una
 * regla de negocio, y las reglas no viven en la base (regla de
 * arquitectura 4).
 */

/**
 * Elige la regla mas especifica de las vigentes: marca y categoria, luego
 * categoria, luego marca, y por ultimo la general.
 */
export function elegirReglaAplicable<T extends { idMarca: string | null; idCategoria: string | null }>(
  reglasVigentes: readonly T[],
  idMarca: string,
  idCategoria: string,
): T | null {
  return (
    reglasVigentes.find((r) => r.idMarca === idMarca && r.idCategoria === idCategoria)
    ?? reglasVigentes.find((r) => r.idMarca === null && r.idCategoria === idCategoria)
    ?? reglasVigentes.find((r) => r.idMarca === idMarca && r.idCategoria === null)
    ?? reglasVigentes.find((r) => r.idMarca === null && r.idCategoria === null)
    ?? null
  );
}
