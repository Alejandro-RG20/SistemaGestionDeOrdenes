/**
 * Ejecucion de los reportes.
 *
 * Una sola funcion corre los diecisiete. Lo unico que cambia entre ellos
 * es la consulta y sus columnas, y ambas cosas viven en el catalogo.
 */
import {
  TIPO_COLUMNA,
  type DefinicionDeReporte, type ResultadoDeReporte,
} from '@servitotal/compartido';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import { ErrorNoEncontrado } from '../../comun/errores.js';
import { REPORTES, reportePorClave } from './catalogo.js';

export function catalogo(): readonly DefinicionDeReporte[] {
  return REPORTES.map(({ clave, titulo, proposito, grupo, admiteRango }) => ({
    clave, titulo, proposito, grupo, admiteRango,
  }));
}

/** Los tipos que se suman. Sumar una fecha o un texto no significa nada. */
const SUMABLES: readonly string[] = [TIPO_COLUMNA.NUMERO, TIPO_COLUMNA.DINERO];

export async function ejecutar(
  clave: string, desde: string | undefined, hasta: string | undefined,
): Promise<ResultadoDeReporte> {
  const reporte = reportePorClave(clave);
  if (reporte === undefined) {
    throw new ErrorNoEncontrado(`No existe un reporte llamado «${clave}».`);
  }

  /*
   * Un reporte que no admite rango lo ignora aunque venga: es una foto de
   * hoy, y filtrarla por fechas daria un resultado que nadie sabe leer.
   *
   * Y no se le mandan parametros, ni siquiera nulos: su consulta no
   * declara `$1` ni `$2`, y PostgreSQL rechaza un bind con parametros de
   * mas. La prueba de `catalogo.prueba.ts` ejecuta los diecisiete contra
   * la base justamente para que este desajuste no llegue a nadie.
   */
  const rango = reporte.admiteRango ? [desde ?? null, hasta ?? null] : [];

  const { rows } = await ejecutorPorDefecto()
    .query<Record<string, unknown>>(reporte.consulta, rango);

  // Los numeros llegan de PostgreSQL como texto cuando son numeric. Se
  // convierten aqui y no en el panel: el panel no tiene por que saber que
  // tipo de columna uso la consulta.
  const numericas = new Set(
    reporte.columnas.filter((columna) => columna.tipo !== TIPO_COLUMNA.TEXTO
      && columna.tipo !== TIPO_COLUMNA.FECHA).map((columna) => columna.clave),
  );

  const filas = rows.map((fila) => {
    const limpia: Record<string, string | number | null> = {};
    for (const columna of reporte.columnas) {
      const valor = fila[columna.clave];
      limpia[columna.clave] = valor === null || valor === undefined
        ? null
        : numericas.has(columna.clave)
          ? Number(valor)
          : String(valor);
    }
    return limpia;
  });

  const aSumar = reporte.sumar ?? reporte.columnas
    .filter((columna) => SUMABLES.includes(columna.tipo))
    .map((columna) => columna.clave);

  let totales: Record<string, string | number | null> | null = null;
  if (filas.length > 0 && aSumar.length > 0) {
    totales = {};
    for (const columna of reporte.columnas) {
      totales[columna.clave] = aSumar.includes(columna.clave)
        ? Number(filas.reduce(
          (suma, fila) => suma + (typeof fila[columna.clave] === 'number'
            ? fila[columna.clave] as number
            : 0),
          0,
        ).toFixed(2))
        : null;
    }
  }

  return {
    clave: reporte.clave,
    titulo: reporte.titulo,
    generadoEn: new Date().toISOString(),
    desde: reporte.admiteRango ? desde ?? null : null,
    hasta: reporte.admiteRango ? hasta ?? null : null,
    columnas: reporte.columnas,
    filas,
    totales,
    advertencia: reporte.advertencia ?? null,
  };
}
