/**
 * Exportacion de un reporte a CSV (pliego §43).
 *
 * POR QUE CSV Y NO XLSX NI PDF
 *
 * El CSV lo abre Excel con doble clic y no obliga a meter una biblioteca de
 * ofimatica —ni la fuente de un PDF— en el servidor para resolver algo que
 * son cuatro reglas de escapado. Lo que la jefatura hace con el reporte es
 * pegarlo en una hoja y sumar columnas; para eso el CSV es el formato, no un
 * PDF del que hay que volver a teclear los numeros.
 *
 * DOS DETALLES QUE NO SON ADORNO
 *
 *  1. El BOM al principio. Sin el, Excel en Windows abre el archivo en su
 *     pagina de codigos local y «Garantia de proveedor» sale como
 *     «GarantÃ­a». El reporte queda ilegible y nadie entiende por que.
 *
 *  2. Las celdas que empiezan por `=`, `+`, `-` o `@` se prefijan con una
 *     comilla simple. Excel interpreta esas celdas como FORMULAS, y un
 *     nombre de cliente que empiece con un guion se convierte en un error
 *     de hoja de calculo —o, con datos puestos a proposito, en algo peor—.
 *     Es inyeccion de formulas, y el sitio donde se evita es aqui, al
 *     serializar.
 */

/** Caracteres con los que Excel interpreta la celda como formula. */
const ARRANQUES_PELIGROSOS = ['=', '+', '-', '@', '\t', '\r'];

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';

  let texto = valor instanceof Date ? valor.toISOString() : String(valor);

  if (ARRANQUES_PELIGROSOS.some((inicio) => texto.startsWith(inicio))) {
    texto = `'${texto}`;
  }

  // Comillas, comas y saltos de linea obligan a entrecomillar la celda; las
  // comillas de dentro se duplican.
  if (/[",\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export interface ReporteParaExportar {
  readonly columnas: readonly { readonly clave: string; readonly etiqueta: string }[];
  readonly filas: readonly Record<string, unknown>[];
}

/**
 * Arma el CSV completo. El BOM va al principio por lo dicho arriba.
 *
 * Las filas se recorren por las COLUMNAS declaradas y no por las claves del
 * objeto: asi el orden de las columnas del archivo es el mismo que el de la
 * pantalla, y una fila a la que le falte un campo deja la celda vacia en vez
 * de correr todas las demas una posicion.
 */
export function aCsv(reporte: ReporteParaExportar): string {
  const lineas = [reporte.columnas.map((columna) => celda(columna.etiqueta)).join(',')];
  for (const fila of reporte.filas) {
    lineas.push(reporte.columnas.map((columna) => celda(fila[columna.clave])).join(','));
  }
  return `\ufeff${lineas.join('\r\n')}\r\n`;
}

/** Nombre de archivo seguro: sin rutas, sin espacios, con la fecha. */
export function nombreDeArchivo(clave: string): string {
  const dia = new Date().toISOString().slice(0, 10);
  const limpia = clave.replace(/[^a-z0-9_-]/gi, '_');
  return `servitotal_${limpia}_${dia}.csv`;
}
