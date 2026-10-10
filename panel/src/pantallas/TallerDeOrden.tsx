/**
 * Diagnostico, cotizacion y decision del cliente, dentro del resumen de la
 * orden.
 *
 * Cada formulario aparece solo si el usuario tiene el permiso y la orden
 * esta en el estado en que el servidor lo admite; el servidor lo vuelve a
 * comprobar todo. Registrar algo aqui NO mueve la orden: los pasos de
 * estado se dan en «Mover la orden».
 */
import { useState } from 'react';
import {
  ESTADO_ORDEN,
  type DatosDeTaller, type FichaOrden,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Garantia, Tarjeta, cordobas, fechaHora } from '../componentes/piezas.js';
import { ErrorDeApi } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';

const FORMAS = [
  { valor: 'llamada', nombre: 'Por llamada' },
  { valor: 'mensaje', nombre: 'Por mensaje' },
  { valor: 'correo', nombre: 'Por correo' },
  { valor: 'firma_presencial', nombre: 'Firma presencial' },
] as const;

export function TallerDeOrden({ orden, alCambiar }: { orden: FichaOrden; alCambiar: () => void }): JSX.Element | null {
  const { api, usuario } = useSesion();
  const datos = useRecurso<DatosDeTaller>(() => api.pedir<DatosDeTaller>(`/ordenes/${orden.id}/taller`), [orden.id, orden.estado]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [diagnostico, setDiagnostico] = useState({ fallaReal: '', componente: '', observaciones: '', noCubierta: false, exclusion: '' });
  const [cotizacion, setCotizacion] = useState({ manoObra: '', totalRepuestos: '', cargoVisita: '' });
  const [decision, setDecision] = useState({ forma: 'llamada', observacion: '' });

  const puedeDiagnosticar = tienePermiso(usuario, 'taller.diagnostico.registrar') && orden.estado === ESTADO_ORDEN.EN_DIAGNOSTICO;
  const puedeCotizar = tienePermiso(usuario, 'taller.cotizacion.registrar')
    && (orden.estado === ESTADO_ORDEN.EN_DIAGNOSTICO || orden.estado === ESTADO_ORDEN.COTIZADA);
  const puedeDecidir = tienePermiso(usuario, 'taller.cotizacion.autorizar')
    && (orden.estado === ESTADO_ORDEN.COTIZADA || orden.estado === ESTADO_ORDEN.ESPERANDO_AUTORIZACION);

  if (datos.cargando) return <Cargando que="diagnostico y cotizacion" />;
  if (datos.error !== null || datos.datos === null) return <Fallo error={datos.error} alReintentar={datos.recargar} />;
  const taller = datos.datos;
  if (taller.diagnosticos.length === 0 && taller.cotizaciones.length === 0 && !puedeDiagnosticar && !puedeCotizar) {
    return null;
  }
  const pendiente = [...taller.cotizaciones].reverse().find((c) => c.aceptada === null) ?? null;

  async function enviar(ruta: string, cuerpo: unknown, mensaje: string, limpiar: () => void): Promise<void> {
    setGuardando(true); setError(null); setAviso(null);
    try {
      await api.pedir(ruta, { metodo: 'POST', cuerpo });
      limpiar();
      setAviso(mensaje);
      datos.recargar();
      alCambiar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  const numero = (valor: string): number => Number(valor.replace(',', '.'));

  return (
    <Tarjeta titulo="Diagnostico y cotizacion" extra={<span>quien paga hoy: <Garantia tipo={taller.tipoGarantia as never} /></span>}>
      {aviso === null ? null : <Aviso tono="ok">{aviso}</Aviso>}
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}

      {taller.diagnosticos.length === 0 ? <p className="tenue" style={{ fontSize: 12.5 }}>Sin diagnostico registrado.</p> : (
        <table className="d">
          <thead><tr><th>Diagnostico</th><th>Componente</th><th>Tecnico</th><th>Momento</th></tr></thead>
          <tbody>
            {taller.diagnosticos.map((d) => (
              <tr key={d.id}><td>{d.fallaReal}</td><td>{d.componente ?? '—'}</td><td>{d.tecnico}</td><td className="tenue">{fechaHora(d.momento)}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      {puedeDiagnosticar ? (
        <div style={{ marginTop: 10 }}>
          <div className="g g3">
            <div><label>Falla real encontrada *</label><input value={diagnostico.fallaReal} onChange={(e) => setDiagnostico({ ...diagnostico, fallaReal: e.target.value })} /></div>
            <div><label>Componente</label><input value={diagnostico.componente} onChange={(e) => setDiagnostico({ ...diagnostico, componente: e.target.value })} /></div>
            <div>
              <label>¿Constato una posible exclusion?</label>
              <select value={diagnostico.noCubierta ? '1' : ''} onChange={(e) => setDiagnostico({ ...diagnostico, noCubierta: e.target.value === '1' })}>
                <option value="">No</option>
                <option value="1">Si: golpe, mal uso u otra</option>
              </select>
            </div>
          </div>
          <label>Observaciones</label>
          <textarea rows={2} value={diagnostico.observaciones} onChange={(e) => setDiagnostico({ ...diagnostico, observaciones: e.target.value })}
            placeholder="Lo que encontro, pruebas realizadas, estado del articulo…" />
          {diagnostico.noCubierta ? (
            <>
              <label>Exclusion constatada *</label>
              <input value={diagnostico.exclusion} onChange={(e) => setDiagnostico({ ...diagnostico, exclusion: e.target.value })}
                placeholder="Golpe en la carcasa trasera; tarjeta con humedad…" />
            </>
          ) : null}
          <p className="tenue" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
            El diagnostico no cambia la garantia de la orden. Las observaciones y la exclusion quedan en el historial;
            las fotos se cargan en la pestaña de evidencias. Si la garantia debe cambiar, la reclasifica quien tiene
            permiso, con motivo, desde el bloque «Garantia de la orden».
          </p>
          <button
            type="button" className="btn pri" style={{ marginTop: 8 }}
            disabled={guardando || diagnostico.fallaReal.trim().length < 5 || (diagnostico.noCubierta && diagnostico.exclusion.trim().length < 5)}
            onClick={() => {
              void enviar(`/ordenes/${orden.id}/diagnostico`, {
                fallaReal: diagnostico.fallaReal.trim(),
                componente: diagnostico.componente.trim() === '' ? null : diagnostico.componente.trim(),
                observaciones: diagnostico.observaciones.trim() === '' ? null : diagnostico.observaciones.trim(),
                exclusion: diagnostico.noCubierta ? diagnostico.exclusion.trim() : null,
              }, 'Diagnostico registrado. La garantia de la orden no cambio.',
              () => setDiagnostico({ fallaReal: '', componente: '', observaciones: '', noCubierta: false, exclusion: '' }));
            }}
          >
            Registrar diagnostico
          </button>
        </div>
      ) : null}

      {taller.cotizaciones.length === 0 ? null : (
        <table className="d" style={{ marginTop: 10 }}>
          <thead><tr><th>Cotizacion</th><th>Mano de obra</th><th>Repuestos</th><th>Visita</th><th>Total</th><th>Cliente</th></tr></thead>
          <tbody>
            {taller.cotizaciones.map((c) => (
              <tr key={c.id}>
                <td className="tenue">{fechaHora(c.creadoEn)} · {c.registradoPor ?? '—'}</td>
                <td>{cordobas(c.manoObra)}</td><td>{cordobas(c.totalRepuestos)}</td><td>{cordobas(c.cargoVisita)}</td>
                <td><b>{cordobas(c.total)}</b></td>
                <td>
                  {c.aceptada === null ? <span className="tag t-a">sin decision</span>
                    : c.aceptada ? <span className="tag t-t">acepto · {c.formaAceptacion?.replace(/_/g, ' ')}</span>
                    : <span className="tag t-r">no acepto</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {puedeCotizar && pendiente === null && taller.diagnosticos.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <div className="g g4">
            <div><label>Mano de obra (C$)</label><input inputMode="decimal" value={cotizacion.manoObra} onChange={(e) => setCotizacion({ ...cotizacion, manoObra: e.target.value })} /></div>
            <div><label>Repuestos (C$)</label><input inputMode="decimal" value={cotizacion.totalRepuestos} onChange={(e) => setCotizacion({ ...cotizacion, totalRepuestos: e.target.value })} /></div>
            <div><label>Cargo por visita (C$)</label><input inputMode="decimal" value={cotizacion.cargoVisita} onChange={(e) => setCotizacion({ ...cotizacion, cargoVisita: e.target.value })} /></div>
            <div style={{ alignSelf: 'end' }}>
              <button
                type="button" className="btn pri"
                disabled={guardando || cotizacion.manoObra === '' || cotizacion.totalRepuestos === ''
                  || Number.isNaN(numero(cotizacion.manoObra)) || Number.isNaN(numero(cotizacion.totalRepuestos))}
                onClick={() => {
                  void enviar(`/ordenes/${orden.id}/cotizaciones`, {
                    manoObra: numero(cotizacion.manoObra),
                    totalRepuestos: numero(cotizacion.totalRepuestos),
                    ...(cotizacion.cargoVisita === '' ? {} : { cargoVisita: numero(cotizacion.cargoVisita) }),
                  }, 'Cotizacion registrada.', () => setCotizacion({ manoObra: '', totalRepuestos: '', cargoVisita: '' }));
                }}
              >
                Registrar cotizacion
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {puedeDecidir && pendiente !== null ? (
        <div style={{ marginTop: 10 }}>
          <label>Decision del cliente sobre la cotizacion de {cordobas(pendiente.total)}</label>
          <div className="g g3">
            <div>
              <select value={decision.forma} onChange={(e) => setDecision({ ...decision, forma: e.target.value })}>
                {FORMAS.map((f) => <option key={f.valor} value={f.valor}>{f.nombre}</option>)}
              </select>
            </div>
            <div><input placeholder="Observacion (opcional)" value={decision.observacion} onChange={(e) => setDecision({ ...decision, observacion: e.target.value })} /></div>
            <div className="tools">
              {[true, false].map((aceptada) => (
                <button
                  key={String(aceptada)} type="button" className={aceptada ? 'btn pri' : 'btn peligro'} disabled={guardando}
                  onClick={() => {
                    if (!window.confirm(aceptada ? '¿Registrar que el cliente ACEPTO la cotizacion?' : '¿Registrar que el cliente NO acepto la cotizacion?')) return;
                    void enviar(`/ordenes/${orden.id}/cotizaciones/decision`, {
                      aceptada, forma: decision.forma,
                      observacion: decision.observacion.trim() === '' ? null : decision.observacion.trim(),
                    }, aceptada ? 'Aceptacion del cliente registrada. Falta autorizar la orden.' : 'Rechazo del cliente registrado.',
                    () => setDecision({ forma: 'llamada', observacion: '' }));
                  }}
                >
                  {aceptada ? 'El cliente acepto' : 'El cliente no acepto'}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Tarjeta>
  );
}
