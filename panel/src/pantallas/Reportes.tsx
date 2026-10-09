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
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ESTADOS_ORDEN, TIPO_COLUMNA,
  type CatalogosDeApoyo, type ColumnaDeReporte, type DefinicionDeReporte, type FiltroDeReporte,
  type ResultadoDeReporte, type ResumenBodega,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, cordobas, Fallo, fechaCorta, Tarjeta, Vacio } from '../componentes/piezas.js';
import { consultaDe } from '../api/cliente.js';

const TITULO_DE_GRUPO: Record<string, string> = {
  operacion: 'Operacion',
  tecnico: 'Trabajo tecnico',
  inventario: 'Inventario y reposicion',
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
  const filtros: Record<FiltroDeReporte, string> = {
    estado: parametros.get('estado') ?? '',
    tecnico: parametros.get('tecnico') ?? '',
    tienda: parametros.get('tienda') ?? '',
    repuesto: parametros.get('repuesto') ?? '',
    bodega: parametros.get('bodega') ?? '',
  };
  const [falloDescarga, setFalloDescarga] = useState<string | null>(null);

  const catalogo = useRecurso<DefinicionDeReporte[]>(
    () => api.pedir<DefinicionDeReporte[]>('/reportes'), [],
  );

  const definicionesCargadas = catalogo.datos ?? [];
  const admitidos = definicionesCargadas.find((d) => d.clave === clave)?.filtros ?? [];
  // Solo viajan los filtros que el reporte admite: los demas no harian nada.
  const consulta: Record<string, string | undefined> = {
    desde: desde === '' ? undefined : desde,
    hasta: hasta === '' ? undefined : hasta,
    ...Object.fromEntries(admitidos.map((filtro) => [filtro, filtros[filtro] === '' ? undefined : filtros[filtro]])),
  };
  const claveDeConsulta = consultaDe(consulta);

  const resultado = useRecurso<ResultadoDeReporte | null>(
    async () => (clave === '' || catalogo.datos === null
      ? null
      : api.pedir<ResultadoDeReporte>(`/reportes/${clave}`, { consulta })),
    [clave, claveDeConsulta, catalogo.datos === null],
  );

  // Opciones de los filtros: tecnicos y tiendas del catalogo de apoyo, y las
  // bodegas. Si alguna no carga, ese filtro no se ofrece.
  const apoyo = useRecurso<CatalogosDeApoyo | null>(
    () => api.pedir<CatalogosDeApoyo>('/catalogos').catch(() => null), [],
  );
  const bodegas = useRecurso<readonly ResumenBodega[] | null>(
    () => api.pedir<readonly ResumenBodega[]>('/bodegas').catch(() => null), [],
  );

  async function descargar(): Promise<void> {
    setFalloDescarga(null);
    try {
      await api.descargar(`/reportes/${clave}/exportar${claveDeConsulta}`, `${clave}.csv`);
    } catch (error) {
      setFalloDescarga(error instanceof Error ? error.message : 'No se pudo descargar el reporte.');
    }
  }

  function cambiar(campo: string, valor: string): void {
    const siguientes = new URLSearchParams(parametros);
    if (valor === '') siguientes.delete(campo); else siguientes.set(campo, valor);
    setParametros(siguientes);
  }

  const definiciones = definicionesCargadas;
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

        {elegido !== undefined && elegido.filtros.length > 0 ? (
          <div className="g g3" style={{ marginTop: 8 }}>
            {elegido.filtros.includes('estado') ? (
              <div>
                <label htmlFor="f-estado">Estado de la orden</label>
                <select id="f-estado" value={filtros.estado} onChange={(e) => cambiar('estado', e.target.value)}>
                  <option value="">Todos</option>
                  {ESTADOS_ORDEN.map((uno) => <option key={uno} value={uno}>{uno.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            ) : null}
            {elegido.filtros.includes('tecnico') && apoyo.datos !== null ? (
              <div>
                <label htmlFor="f-tecnico">Tecnico</label>
                <select id="f-tecnico" value={filtros.tecnico} onChange={(e) => cambiar('tecnico', e.target.value)}>
                  <option value="">Todos</option>
                  {apoyo.datos.tecnicos.map((uno) => <option key={uno.id} value={uno.id}>{uno.nombre}</option>)}
                </select>
              </div>
            ) : null}
            {elegido.filtros.includes('tienda') && apoyo.datos !== null ? (
              <div>
                <label htmlFor="f-tienda">Tienda</label>
                <select id="f-tienda" value={filtros.tienda} onChange={(e) => cambiar('tienda', e.target.value)}>
                  <option value="">Todas</option>
                  {apoyo.datos.tiendas.map((una) => <option key={una.id} value={una.id}>{una.nombre}</option>)}
                </select>
              </div>
            ) : null}
            {elegido.filtros.includes('bodega') && bodegas.datos !== null ? (
              <div>
                <label htmlFor="f-bodega">Bodega</label>
                <select id="f-bodega" value={filtros.bodega} onChange={(e) => cambiar('bodega', e.target.value)}>
                  <option value="">Todas</option>
                  {bodegas.datos.map((una) => <option key={una.id} value={una.id}>{una.nombre}</option>)}
                </select>
              </div>
            ) : null}
            {elegido.filtros.includes('repuesto') ? (
              <div>
                <label htmlFor="f-repuesto">Repuesto (identificador del kardex)</label>
                <input
                  id="f-repuesto" defaultValue={filtros.repuesto}
                  placeholder="Pegue el identificador y presione Enter"
                  onKeyDown={(e) => { if (e.key === 'Enter') cambiar('repuesto', e.currentTarget.value.trim()); }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

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
            <button type="button" className="btn chico" onClick={() => { void descargar(); }}>
              Descargar en CSV ({resultado.datos.filas.length} filas)
            </button>
          </p>
          {falloDescarga === null ? null : <Aviso tono="warn">{falloDescarga}</Aviso>}

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
