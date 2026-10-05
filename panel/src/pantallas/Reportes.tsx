/**
 * W-26 · Reportes.
 *
 * UNA pantalla para los diecisiete. Todos devuelven columnas tipadas y
 * filas, asi que dibujarlos es el mismo trabajo y agregar un reporte no
 * cuesta una pantalla nueva.
 *
 * El formato de cada celda sale del TIPO que declara el servidor, no de
 * adivinar por el nombre: 4850 puede ser cordobas, dias u ordenes, y
 * pintar mal un numero en un reporte que alguien va a defender ante la
 * jefatura es peor que no mostrarlo.
 *
 * Cuando el reporte trae advertencia, se muestra ARRIBA de la tabla. Un
 * promedio calculado sobre cuatro ordenes no significa lo mismo que sobre
 * cuatrocientas, y callarlo produce decisiones equivocadas con cara de
 * dato duro.
 */
import { useSearchParams } from 'react-router-dom';
import {
  TIPO_COLUMNA,
  type ColumnaDeReporte, type DefinicionDeReporte, type ResultadoDeReporte,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, cordobas, Fallo, fechaCorta, Tarjeta, Vacio } from '../componentes/piezas.js';
import { RAIZ_API, consultaDe } from '../api/cliente.js';

const TITULO_DE_GRUPO: Record<string, string> = {
  operacion: 'Operacion',
  tecnico: 'Trabajo tecnico',
  inventario: 'Inventario y compras',
  dinero: 'Dinero',
};

/** Da formato a la celda segun el tipo que declaro el servidor. */
function celda(valor: string | number | null, tipo: ColumnaDeReporte['tipo']): string {
  if (valor === null) return '—';
  switch (tipo) {
    case TIPO_COLUMNA.DINERO:
      return cordobas(Number(valor));
    case TIPO_COLUMNA.PORCENTAJE:
      return `${Number(valor).toLocaleString('es-NI', { maximumFractionDigits: 1 })} %`;
    case TIPO_COLUMNA.HORAS: {
      const horas = Number(valor);
      // Sobre dos dias, las horas dejan de decirle algo a nadie.
      return horas >= 48
        ? `${(horas / 24).toLocaleString('es-NI', { maximumFractionDigits: 1 })} d`
        : `${horas.toLocaleString('es-NI', { maximumFractionDigits: 1 })} h`;
    }
    case TIPO_COLUMNA.NUMERO:
      return Number(valor).toLocaleString('es-NI');
    case TIPO_COLUMNA.FECHA:
      return fechaCorta(String(valor));
    default:
      return String(valor);
  }
}

/** Los numeros van a la derecha: asi se comparan de un vistazo. */
function alineacion(tipo: ColumnaDeReporte['tipo']): 'left' | 'right' {
  return tipo === TIPO_COLUMNA.TEXTO || tipo === TIPO_COLUMNA.FECHA ? 'left' : 'right';
}

export function Reportes(): JSX.Element {
  const { api } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const clave = parametros.get('reporte') ?? '';
  const desde = parametros.get('desde') ?? '';
  const hasta = parametros.get('hasta') ?? '';

  const catalogo = useRecurso<DefinicionDeReporte[]>(
    () => api.pedir<DefinicionDeReporte[]>('/reportes'), [],
  );

  const resultado = useRecurso<ResultadoDeReporte | null>(
    async () => (clave === ''
      ? null
      : api.pedir<ResultadoDeReporte>(
        `/reportes/${clave}`
        + (desde === '' ? '' : `?desde=${desde}`)
        + (hasta === '' ? '' : `${desde === '' ? '?' : '&'}hasta=${hasta}`),
      )),
    [clave, desde, hasta],
  );

  function cambiar(campo: string, valor: string): void {
    const siguientes = new URLSearchParams(parametros);
    if (valor === '') siguientes.delete(campo); else siguientes.set(campo, valor);
    setParametros(siguientes);
  }

  const definiciones = catalogo.datos ?? [];
  const elegido = definiciones.find((definicion) => definicion.clave === clave);
  const grupos = [...new Set(definiciones.map((definicion) => definicion.grupo))];

  return (
    <>
      <h2 className="scr">Reportes</h2>
      <p className="sub">
        {definiciones.length} reportes de la operacion del centro. Elija uno y, si aplica,
        el periodo.
      </p>

      {catalogo.cargando ? <Cargando que="el catalogo de reportes" /> : null}
      {catalogo.error !== null
        ? <Fallo error={catalogo.error} alReintentar={catalogo.recargar} />
        : null}

      <Tarjeta titulo="Elegir reporte">
        <div className="g g3">
          <div>
            <label htmlFor="reporte">Reporte</label>
            <select
              id="reporte" value={clave}
              onChange={(evento) => cambiar('reporte', evento.target.value)}
            >
              <option value="">Elija uno</option>
              {grupos.map((grupo) => (
                <optgroup key={grupo} label={TITULO_DE_GRUPO[grupo] ?? grupo}>
                  {definiciones
                    .filter((definicion) => definicion.grupo === grupo)
                    .map((definicion) => (
                      <option key={definicion.clave} value={definicion.clave}>
                        {definicion.titulo}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* El rango solo aparece si el reporte lo admite. Ofrecerlo en una
              foto de existencias de hoy seria ofrecer algo que no hace nada. */}
          {elegido?.admiteRango === true ? (
            <>
              <div>
                <label htmlFor="desde">Desde</label>
                <input
                  id="desde" type="date" value={desde}
                  onChange={(evento) => cambiar('desde', evento.target.value)}
                />
              </div>
              <div>
                <label htmlFor="hasta">Hasta</label>
                <input
                  id="hasta" type="date" value={hasta}
                  onChange={(evento) => cambiar('hasta', evento.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>

        {elegido !== undefined ? (
          <p className="tenue" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
            {elegido.proposito}
            {!elegido.admiteRango
              ? ' Es una foto de hoy, no de un periodo.'
              : ''}
          </p>
        ) : null}
      </Tarjeta>

      {clave === '' ? (
        <Vacio>Elija un reporte para verlo.</Vacio>
      ) : null}

      {resultado.cargando && clave !== '' ? <Cargando que="el reporte" /> : null}
      {resultado.error !== null
        ? <Fallo error={resultado.error} alReintentar={resultado.recargar} />
        : null}

      {resultado.datos !== null && resultado.datos !== undefined && resultado.error === null ? (
        <>
          <h3 style={{ marginBottom: 4 }}>{resultado.datos.titulo}</h3>
          <p className="tenue" style={{ fontSize: 12, marginTop: 0 }}>
            Generado el {new Date(resultado.datos.generadoEn).toLocaleString('es-NI')}
            {resultado.datos.desde !== null
              ? ` · desde ${fechaCorta(resultado.datos.desde)}` : ''}
            {resultado.datos.hasta !== null
              ? ` · hasta ${fechaCorta(resultado.datos.hasta)}` : ''}
          </p>

          {resultado.datos.advertencia !== null ? (
            <Aviso tono="warn">{resultado.datos.advertencia}</Aviso>
          ) : null}

          {/*
            * Descargar el reporte (§43).
            *
            * Es un enlace y no un boton con `fetch`: el navegador sabe
            * descargar archivos y la cabecera Content-Disposition del
            * servidor ya dice como se llama. Traerlo por fetch obligaria a
            * armar un Blob, una URL temporal y un `<a>` invisible para
            * acabar en el mismo sitio.
            *
            * Lleva los MISMOS filtros que la pantalla, asi que lo que se
            * descarga es exactamente lo que se esta viendo.
            */}
          <p>
            <a
              className="secundario"
              href={`${RAIZ_API}/reportes/${clave}/exportar${consultaDe({
                desde: desde === '' ? undefined : desde,
                hasta: hasta === '' ? undefined : hasta,
              })}`}
              download
            >
              Descargar en CSV ({resultado.datos.filas.length} filas)
            </a>
          </p>

          {resultado.datos.filas.length === 0 ? (
            <Vacio>Este reporte no devolvio ninguna fila para ese periodo.</Vacio>
          ) : (
            <table>
              <thead>
                <tr>
                  {resultado.datos.columnas.map((columna) => (
                    <th key={columna.clave} style={{ textAlign: alineacion(columna.tipo) }}>
                      {columna.etiqueta}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultado.datos.filas.map((fila, indice) => (
                  <tr key={indice}>
                    {resultado.datos!.columnas.map((columna) => (
                      <td key={columna.clave} style={{ textAlign: alineacion(columna.tipo) }}>
                        {celda(fila[columna.clave] ?? null, columna.tipo)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {resultado.datos.totales !== null ? (
                <tfoot>
                  <tr style={{ fontWeight: 600, borderTop: '2px solid var(--rule)' }}>
                    {resultado.datos.columnas.map((columna, indice) => (
                      <td key={columna.clave} style={{ textAlign: alineacion(columna.tipo) }}>
                        {indice === 0 && resultado.datos!.totales![columna.clave] === null
                          ? 'Total'
                          : celda(resultado.datos!.totales![columna.clave] ?? null, columna.tipo)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          )}
        </>
      ) : null}
    </>
  );
}
