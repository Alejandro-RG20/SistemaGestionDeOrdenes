/**
 * Visitas de una orden: cada una con su fecha y franja programadas, las
 * horas REALES de llegada y salida, el resultado y las observaciones.
 *
 * Varias visitas de la misma orden conservan cada una su registro: una ya
 * realizada no se pisa al programar la siguiente. Las ordenes de taller no
 * llevan visita; si tienen alguna (por ejemplo, empezo en ruta y se
 * convirtio), se muestra porque ocurrio.
 */
import { useState } from 'react';
import {
  FRANJAS_HORARIAS, MODALIDAD_SERVICIO,
  type CatalogosDeApoyo, type FichaOrden, type ResumenVisita,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio } from '../componentes/piezas.js';
import { ErrorDeApi } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';
import { AccionesDeVisita, hora } from './AccionesDeVisita.js';

export function VisitasDeOrden({ orden, alCambiar }: { orden: FichaOrden; alCambiar: () => void }): JSX.Element {
  const { api, usuario } = useSesion();
  const visitas = useRecurso<readonly ResumenVisita[]>(
    () => api.pedir<readonly ResumenVisita[]>(`/ordenes/${orden.id}/visitas`), [orden.id],
  );
  const puedeProgramar = tienePermiso(usuario, 'agenda.programar');
  const catalogos = useRecurso<CatalogosDeApoyo | null>(
    () => (puedeProgramar ? api.pedir<CatalogosDeApoyo>('/catalogos') : Promise.resolve(null)), [puedeProgramar],
  );
  const [nueva, setNueva] = useState({ fecha: '', franja: '', idTecnico: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const esRuta = orden.modalidad === MODALIDAD_SERVICIO.RUTA;
  const abierta = orden.destinosPosibles.length > 0;
  const lista = visitas.datos ?? [];
  const hayPendiente = lista.some((v) => v.vigente && v.resultado === 'programada');
  const recargar = (): void => { visitas.recargar(); alCambiar(); };

  async function programar(): Promise<void> {
    setGuardando(true); setError(null); setAviso(null);
    try {
      const creada = await api.pedir<ResumenVisita>(`/ordenes/${orden.id}/visitas`, {
        metodo: 'POST',
        cuerpo: { idTecnico: nueva.idTecnico, fechaProgramada: nueva.fecha, franjaHoraria: nueva.franja },
      });
      setAviso(`Visita programada para el ${creada.fechaProgramada}, ${creada.franjaHoraria}, con ${creada.tecnico}.`);
      setNueva({ fecha: '', franja: '', idTecnico: '' });
      recargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo programar la visita.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Tarjeta titulo="Visitas de la orden" extra={esRuta ? 'visita a domicilio' : 'orden de taller'}>
      {!esRuta ? (
        <Aviso tono="info">Es una orden de taller: el cliente lleva el articulo y no se programan visitas a domicilio.</Aviso>
      ) : null}
      {aviso === null ? null : <Aviso tono="ok">{aviso}</Aviso>}
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
      {visitas.cargando ? <Cargando que="las visitas" /> : null}
      {visitas.error !== null ? <Fallo error={visitas.error} alReintentar={visitas.recargar} /> : null}
      {!visitas.cargando && lista.length === 0 ? <Vacio>Esta orden no tiene visitas.</Vacio> : null}
      {lista.length === 0 ? null : (
        <table className="d">
          <thead>
            <tr>
              <th>Programada</th><th>Tecnico</th><th>Llegada real</th><th>Salida real</th>
              <th>Resultado</th><th>Observaciones</th><th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((visita) => (
              <tr key={visita.id}>
                <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                  {visita.fechaProgramada} {visita.franjaHoraria}
                  {visita.vigente ? null : <><br /><span className="tag t-g">reprogramada</span></>}
                </td>
                <td>{visita.tecnico}</td>
                <td className="tenue">{hora(visita.horaLlegada)}</td>
                <td className="tenue">{hora(visita.horaSalida)}</td>
                <td><span className="tag t-b">{visita.resultado.replace(/_/g, ' ')}</span></td>
                <td className="tenue" style={{ maxWidth: 260 }}>{visita.motivo ?? '—'}</td>
                <td>{abierta ? <AccionesDeVisita visita={visita} alCambiar={recargar} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {esRuta && abierta && puedeProgramar && !hayPendiente ? (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ margin: '6px 0' }}>{lista.length === 0 ? 'Programar la visita' : 'Programar otra visita'}</h4>
          <div className="g g4">
            <div><label>Fecha</label><input type="date" min={new Date().toISOString().slice(0, 10)} value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} /></div>
            <div>
              <label>Franja</label>
              <select value={nueva.franja} onChange={(e) => setNueva({ ...nueva, franja: e.target.value })}>
                <option value="">Elija…</option>
                {FRANJAS_HORARIAS.map((franja) => <option key={franja} value={franja}>{franja}</option>)}
              </select>
            </div>
            <div>
              <label>Tecnico</label>
              <select value={nueva.idTecnico} onChange={(e) => setNueva({ ...nueva, idTecnico: e.target.value })}>
                <option value="">Elija…</option>
                {(catalogos.datos?.tecnicos ?? []).filter((t) => t.tipo === 'ruta').map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}{t.id === orden.idTecnico ? ' · ASIGNADO' : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ alignSelf: 'end' }}>
              <button
                type="button" className="btn pri"
                disabled={guardando || nueva.fecha === '' || nueva.franja === '' || nueva.idTecnico === ''}
                onClick={() => { void programar(); }}
              >
                Programar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {esRuta && hayPendiente ? (
        <p className="tenue" style={{ fontSize: 12 }}>Hay una visita pendiente: para moverla, reprogramela desde la agenda.</p>
      ) : null}
    </Tarjeta>
  );
}
