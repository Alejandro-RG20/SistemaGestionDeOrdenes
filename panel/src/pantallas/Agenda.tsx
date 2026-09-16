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
import type { CatalogosDeApoyo, ResumenVisita } from '@servitotal/compartido';
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
  const [fecha, setFecha] = useState(hoyISO());
  const [idTecnico, setIdTecnico] = useState('');

  const catalogos = useRecurso<CatalogosDeApoyo>(() => api.pedir<CatalogosDeApoyo>('/catalogos'), []);

  const visitas = useRecurso<PaginaDeDatos<ResumenVisita>>(
    () => api.pedirPagina<ResumenVisita>('/agenda', {
      desde: fecha,
      hasta: fecha,
      idTecnico: idTecnico === '' ? undefined : idTecnico,
      tamano: 100,
    }),
    [fecha, idTecnico],
  );

  const lista = visitas.datos?.datos ?? [];
  const cuenta = (resultado: string): number =>
    lista.filter((visita) => visita.resultado === resultado).length;

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
        {new Date(`${fecha}T12:00:00`).toLocaleDateString('es-NI', {
          weekday: 'long', day: 'numeric', month: 'long',
        })} · {lista.length} visitas
      </p>

      <Tarjeta titulo="Filtros">
        <div className="g g3">
          <div>
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label>Tecnico</label>
            <select value={idTecnico} onChange={(e) => setIdTecnico(e.target.value)}>
              <option value="">Todos</option>
              {(catalogos.datos?.tecnicos ?? [])
                .filter((tecnico) => tecnico.tipo === 'ruta')
                .map((tecnico) => (
                  <option key={tecnico.id} value={tecnico.id}>
                    {tecnico.nombre} · {tecnico.especialidad}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </Tarjeta>

      <div className="g g4" style={{ marginBottom: 12 }}>
        <Cifra valor={cuenta('programada')} etiqueta="Programadas" />
        <Cifra valor={cuenta('resuelta_en_sitio')} etiqueta="Resueltas en sitio" color="var(--teal)" />
        <Cifra
          valor={cuenta('requiere_traslado_taller')}
          etiqueta="Requieren traslado"
          color="var(--amber)"
        />
        <Cifra valor={cuenta('cliente_ausente')} etiqueta="Cliente ausente" color="var(--red)" />
      </div>

      {visitas.cargando ? <Cargando que="la agenda" /> : null}
      {visitas.error !== null ? <Fallo error={visitas.error} alReintentar={visitas.recargar} /> : null}

      {lista.length === 0 && !visitas.cargando ? (
        <Vacio>No hay visitas programadas para esta fecha.</Vacio>
      ) : null}

      {[...porTecnico.entries()].map(([tecnico, suyas]) => (
        <Tarjeta key={tecnico} titulo={`Ruta de ${tecnico}`}>
          <table className="d">
            <thead>
              <tr>
                <th>Franja</th><th>Orden</th><th>Direccion</th>
                <th>Llegada</th><th>Salida</th><th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {suyas
                .slice()
                .sort((una, otra) => una.franjaHoraria.localeCompare(otra.franjaHoraria))
                .map((visita) => (
                  <tr key={visita.id}>
                    <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{visita.franjaHoraria}</td>
                    <td>
                      <Link to={`/ordenes/${visita.idOrden}`}>{visita.numeroOrden}</Link>
                    </td>
                    <td className="tenue">{visita.direccionServicio ?? '—'}</td>
                    <td className="tenue">
                      {visita.horaLlegada === null
                        ? '—'
                        : new Date(visita.horaLlegada).toLocaleTimeString('es-NI', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                    </td>
                    <td className="tenue">
                      {visita.horaSalida === null
                        ? '—'
                        : new Date(visita.horaSalida).toLocaleTimeString('es-NI', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                    </td>
                    <td>
                      <span className={`tag ${TONO_RESULTADO[visita.resultado] ?? 't-g'}`}>
                        {visita.resultado.replace(/_/g, ' ')}
                      </span>
                    </td>
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
