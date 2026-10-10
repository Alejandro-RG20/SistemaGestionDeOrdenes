/**
 * W-06 · Agenda y rutas del dia.
 *
 * Se agrupa por tecnico porque asi es como se reparte el trabajo: nadie
 * pregunta «que visitas hay a las diez», preguntan «que lleva Mejia hoy».
 *
 * La restriccion que sostiene esta pantalla no vive aqui: **un tecnico no
 * puede tener dos visitas en la misma franja, y eso lo impide un indice
 * unico en la base** (RN-14). Si dependiera de esta validacion, dos
 * personas programando a la vez la romperian.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogosDeApoyo, ResumenAgenda, ResumenVisita } from '@servitotal/compartido';
import { AccionesDeVisita, hora } from './AccionesDeVisita.js';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Cifra, Fallo, Tarjeta, Vacio } from '../componentes/piezas.js';
import type { PaginaDeDatos } from '../api/cliente.js';

/** Hoy en formato ISO, que es lo que el servidor espera. */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const TONO_RESULTADO: Record<string, string> = {
  programada: 't-g',
  resuelta_en_sitio: 't-t',
  requiere_traslado_taller: 't-a',
  cliente_ausente: 't-r',
  no_autorizada: 't-r',
};

export function Agenda(): JSX.Element {
  const { api } = useSesion();
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [idTecnico, setIdTecnico] = useState('');
  const [conReprogramadas, setConReprogramadas] = useState(false);

  const catalogos = useRecurso<CatalogosDeApoyo>(() => api.pedir<CatalogosDeApoyo>('/catalogos'), []);

  const visitas = useRecurso<PaginaDeDatos<ResumenVisita>>(
    () => api.pedirPagina<ResumenVisita>('/agenda', {
      desde,
      hasta,
      idTecnico: idTecnico === '' ? undefined : idTecnico,
      soloVigentes: conReprogramadas ? 'false' : undefined,
      tamano: 100,
    }),
    [desde, hasta, idTecnico, conReprogramadas],
  );
  // Los conteos los hace el servidor sobre TODAS las visitas vigentes del
  // filtro, no sobre la pagina que se ve.
  const resumen = useRecurso<ResumenAgenda>(
    () => api.pedir<ResumenAgenda>(`/agenda/resumen?desde=${desde}&hasta=${hasta}${idTecnico === '' ? '' : `&idTecnico=${idTecnico}`}`),
    [desde, hasta, idTecnico],
  );
  const recargar = (): void => { visitas.recargar(); resumen.recargar(); };

  const lista = visitas.datos?.datos ?? [];

  // Agrupadas por técnico, que es como se reparte el trabajo.
  const porTecnico = new Map<string, ResumenVisita[]>();
  for (const visita of lista) {
    const suyas = porTecnico.get(visita.tecnico) ?? [];
    suyas.push(visita);
    porTecnico.set(visita.tecnico, suyas);
  }

  return (
    <>
      <h2 className="scr">Agenda y rutas del dia</h2>
      <p className="sub">
        {desde === hasta
          ? new Date(`${desde}T12:00:00`).toLocaleDateString('es-NI', { weekday: 'long', day: 'numeric', month: 'long' })
          : `Del ${desde} al ${hasta}`} · {visitas.datos?.paginacion.total ?? 0} visitas
      </p>

      <Tarjeta titulo="Filtros">
        <div className="g g3">
          <div>
            <label>Desde</label>
            <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); if (e.target.value > hasta) setHasta(e.target.value); }} />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <label>Tecnico</label>
            <select value={idTecnico} onChange={(e) => setIdTecnico(e.target.value)}>
              <option value="">Todos</option>
              {(catalogos.datos?.tecnicos ?? [])
                .map((tecnico) => (
                  <option key={tecnico.id} value={tecnico.id}>
                    {tecnico.nombre} · {tecnico.tipo} · {tecnico.especialidad}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label>Reprogramadas</label>
            <select value={conReprogramadas ? '1' : ''} onChange={(e) => setConReprogramadas(e.target.value === '1')}>
              <option value="">Ocultar</option>
              <option value="1">Mostrar tambien</option>
            </select>
          </div>
        </div>
      </Tarjeta>

      {resumen.datos === null ? null : (
        <div className="g g4" style={{ marginBottom: 12 }}>
          <Cifra valor={resumen.datos.programadas} etiqueta="Programadas (sin llegada)" />
          <Cifra valor={resumen.datos.enCurso} etiqueta="En curso (llego, sin salida)" color="var(--blue)" />
          <Cifra valor={resumen.datos.realizadas} etiqueta="Realizadas" />
          <Cifra valor={resumen.datos.resueltasEnSitio} etiqueta="Resueltas en sitio" color="var(--teal)" />
          <Cifra valor={resumen.datos.requiereTrasladoTaller} etiqueta="Requieren traslado" color="var(--amber)" />
          <Cifra valor={resumen.datos.clienteAusente} etiqueta="Cliente ausente" color="var(--red)" />
          <Cifra valor={resumen.datos.noAutorizada} etiqueta="No autorizadas" color="var(--red)" />
        </div>
      )}

      {visitas.cargando ? <Cargando que="la agenda" /> : null}
      {visitas.error !== null ? <Fallo error={visitas.error} alReintentar={visitas.recargar} /> : null}

      {lista.length === 0 && !visitas.cargando ? (
        <Vacio>No hay visitas programadas para estas fechas.</Vacio>
      ) : null}

      {[...porTecnico.entries()].map(([tecnico, suyas]) => (
        <Tarjeta key={tecnico} titulo={`Ruta de ${tecnico}`}>
          <table className="d">
            <thead>
              <tr>
                <th>Fecha y franja</th><th>Orden</th><th>Direccion</th>
                <th>Llegada real</th><th>Salida real</th><th>Resultado</th><th>Observaciones</th><th></th>
              </tr>
            </thead>
            <tbody>
              {suyas
                .slice()
                .sort((una, otra) => `${una.fechaProgramada}${una.franjaHoraria}`.localeCompare(`${otra.fechaProgramada}${otra.franjaHoraria}`))
                .map((visita) => (
                  <tr key={visita.id}>
                    <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{visita.fechaProgramada}<br />{visita.franjaHoraria}</td>
                    <td>
                      <Link to={`/ordenes/${visita.idOrden}`}>{visita.codigoOrden ?? visita.numeroOrden}</Link>
                      {visita.vigente ? null : <><br /><span className="tag t-g">reprogramada</span></>}
                    </td>
                    <td className="tenue">{visita.direccionServicio ?? '—'}</td>
                    <td className="tenue">{hora(visita.horaLlegada)}</td>
                    <td className="tenue">{hora(visita.horaSalida)}</td>
                    <td>
                      <span className={`tag ${TONO_RESULTADO[visita.resultado] ?? 't-g'}`}>
                        {visita.resultado.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="tenue" style={{ maxWidth: 240 }}>{visita.motivo ?? '—'}</td>
                    <td><AccionesDeVisita visita={visita} alCambiar={recargar} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Tarjeta>
      ))}

      <Aviso tono="info">
        Un tecnico no puede tener dos visitas vigentes en la misma franja: lo impide un indice
        unico en la base de datos, no solo la validacion (RN-14). Reprogramar conserva la visita
        anterior marcada como no vigente, porque explica por que la orden se movio.
      </Aviso>
    </>
  );
}
