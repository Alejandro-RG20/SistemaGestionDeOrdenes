/**
 * Garantia de la orden: la decision vigente, su historial y la
 * reclasificacion.
 *
 * La garantia la elige quien registra la orden. El sistema no la cambia: ni
 * el diagnostico ni un cambio en la ficha del articulo la sustituyen. Las
 * advertencias (vencida, sin datos, a nombre de otro) son informativas.
 * Reclasificar exige el permiso `garantias.reclasificar` y un motivo; queda
 * la clasificacion anterior, la nueva, quien, cuando y por que.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  FichaOrden, GarantiaDeOrden as DatosGarantia, OrigenDecisionGarantia, ResultadoExclusion,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Garantia, Tarjeta, fechaHora } from '../componentes/piezas.js';
import { ErrorDeApi } from '../api/cliente.js';

const ORIGEN: Readonly<Record<OrigenDecisionGarantia, string>> = {
  registro: 'Elegida al registrar',
  reclasificacion: 'Reclasificacion',
  campo: 'Levantada en campo',
  automatica_anterior: 'Cambio automatico (sistema anterior)',
  sin_registro: 'Alta de la orden (sin decision anotada)',
};

const OPCIONES = [
  { valor: 'proveedor', nombre: 'Garantia del proveedor' },
  { valor: 'adicional', nombre: 'Garantia adicional' },
  { valor: 'particular', nombre: 'Servicio particular' },
] as const;

export function GarantiaDeOrden({ orden, alCambiar }: { orden: FichaOrden; alCambiar: () => void }): JSX.Element {
  const { api } = useSesion();
  const navegar = useNavigate();
  const [excluyendo, setExcluyendo] = useState(false);
  const [exclusion, setExclusion] = useState({ motivo: '', crear: true });
  const datos = useRecurso<DatosGarantia>(
    () => api.pedir<DatosGarantia>(`/ordenes/${orden.id}/garantia`), [orden.id, orden.tipoGarantia, orden.estado],
  );
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (datos.cargando) return <Cargando que="la garantia de la orden" />;
  if (datos.error !== null || datos.datos === null) return <Fallo error={datos.error} alReintentar={datos.recargar} />;
  const garantia = datos.datos;
  const vigente = garantia.vigente;

  async function confirmarExclusion(): Promise<void> {
    if (!window.confirm('La orden se cerrara sin reparar y conservara su garantia, diagnostico, evidencias e historial. ¿Confirmar que la garantia no aplica?')) return;
    setGuardando(true); setError(null); setAviso(null);
    try {
      const resultado = await api.pedir<ResultadoExclusion>(`/ordenes/${orden.id}/exclusion`, {
        metodo: 'POST', cuerpo: { motivo: exclusion.motivo.trim(), crearOrdenParticular: exclusion.crear },
      });
      setExcluyendo(false);
      alCambiar();
      datos.recargar();
      if (resultado.idOrdenNueva !== null) {
        navegar(`/ordenes/${resultado.idOrdenNueva}`);
      } else {
        setAviso('Exclusion confirmada: la orden se cerro sin reparar.');
      }
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo confirmar la exclusion.');
    } finally {
      setGuardando(false);
    }
  }

  async function reclasificar(): Promise<void> {
    setGuardando(true); setError(null); setAviso(null);
    try {
      await api.pedir(`/ordenes/${orden.id}/garantia`, { metodo: 'POST', cuerpo: { tipo, motivo: motivo.trim() } });
      setAviso('Garantia reclasificada. El cambio quedo en el historial con su motivo.');
      setAbierto(false); setTipo(''); setMotivo('');
      datos.recargar();
      alCambiar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo reclasificar la garantia.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Tarjeta titulo="Garantia de la orden" extra={<span>vigente: <Garantia tipo={garantia.tipoActual} /></span>}>
      <p style={{ fontSize: 12.5, margin: 0 }}>
        <b>{ORIGEN[vigente.origen]}</b> · {fechaHora(vigente.momento)}
        {vigente.responsable === null ? null : <> · {vigente.responsable}</>}
        {vigente.motivo === null ? null : <><br /><span className="tenue">{vigente.motivo}</span></>}
      </p>

      {garantia.advertencias.length === 0 ? null : (
        <Aviso tono="warn">
          <b>Advertencias (informativas, no cambian la decision):</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {garantia.advertencias.map((texto) => <li key={texto}>{texto}</li>)}
          </ul>
        </Aviso>
      )}

      {garantia.historial.length <= 1 ? null : (
        <table className="d" style={{ marginTop: 8 }}>
          <thead><tr><th>Fecha</th><th>Cambio</th><th>Como</th><th>Responsable</th><th>Motivo</th></tr></thead>
          <tbody>
            {garantia.historial.map((decision, indice) => (
              <tr key={`${decision.momento}-${indice}`}>
                <td>{fechaHora(decision.momento)}</td>
                <td>
                  {decision.tipoAnterior === null ? null : <><Garantia tipo={decision.tipoAnterior} /> → </>}
                  <Garantia tipo={decision.tipo} />
                </td>
                <td>{ORIGEN[decision.origen]}</td>
                <td>{decision.responsable ?? '—'}</td>
                <td className="tenue">{decision.motivo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {garantia.relacionadas.map((r) => (
        <Aviso key={r.id} tono="info">
          {r.relacion === 'origen' ? 'Continua la orden ' : 'Continua en la orden particular '}
          <Link to={`/ordenes/${r.id}`}>{r.codigo}</Link> ({r.estado.replace(/_/g, ' ')}).
          {r.motivo === null ? null : <span className="tenue"> {r.motivo}</span>}
        </Aviso>
      ))}
      {garantia.exclusion === null ? null : (
        <Aviso tono="warn">
          <b>Garantia no aplicable</b> · {fechaHora(garantia.exclusion.momento)} · {garantia.exclusion.responsable ?? '—'}:{' '}
          {garantia.exclusion.motivo}
        </Aviso>
      )}

      {aviso === null ? null : <Aviso tono="ok">{aviso}</Aviso>}

      {!garantia.puedeConfirmarExclusion ? null : excluyendo ? (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <label>Por que no aplica la garantia * <small className="tenue">(minimo 10 caracteres; queda en la bitacora)</small></label>
          <input value={exclusion.motivo} onChange={(e) => setExclusion({ ...exclusion, motivo: e.target.value })}
            placeholder="Golpe en la carcasa constatado en el diagnostico…" />
          <label className="opcion">
            <input type="checkbox" checked={exclusion.crear} onChange={(e) => setExclusion({ ...exclusion, crear: e.target.checked })} />{' '}
            Abrir una orden particular nueva para el mismo cliente y articulo (con su propia cotizacion)
          </label>
          {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn peligro" disabled={guardando || exclusion.motivo.trim().length < 10}
              onClick={() => { void confirmarExclusion(); }}>
              Confirmar exclusion y cerrar la orden
            </button>
            <button type="button" className="btn" onClick={() => setExcluyendo(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn peligro" style={{ marginTop: 10, marginRight: 8 }} onClick={() => setExcluyendo(true)}>
          La garantia no aplica…
        </button>
      )}

      {!garantia.puedeReclasificar ? null : abierto ? (
        <div style={{ marginTop: 10 }}>
          <div className="g g2">
            <div>
              <label>Nueva clasificacion *</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">Elija…</option>
                {OPCIONES.filter((opcion) => opcion.valor !== garantia.tipoActual
                  // De garantia a particular no se reclasifica: se confirma la exclusion.
                  && !(opcion.valor === 'particular' && (garantia.tipoActual === 'proveedor' || garantia.tipoActual === 'adicional'))
                  // Hacia una garantia, solo si aplica (a la fecha de recepcion).
                  && (opcion.valor === 'particular' || garantia.garantias === null || garantia.garantias[opcion.valor].aplicable))
                  .map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>{opcion.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Motivo * <small className="tenue">(minimo 10 caracteres; queda en la bitacora)</small></label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Cliente presento la factura; diagnostico constato golpe…" />
            </div>
          </div>
          {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button" className="btn pri"
              disabled={guardando || tipo === '' || motivo.trim().length < 10}
              onClick={() => { void reclasificar(); }}
            >
              Reclasificar
            </button>
            <button type="button" className="btn" onClick={() => { setAbierto(false); setError(null); }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => setAbierto(true)}>
          Reclasificar garantia
        </button>
      )}
    </Tarjeta>
  );
}
