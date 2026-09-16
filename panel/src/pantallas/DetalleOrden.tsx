/**
 * Ficha de la orden: lo que pasa cuando alguien hace clic en un aviso.
 *
 * Muestra la bitacora completa porque es lo que responde la pregunta que
 * mas se hace en el centro —"¿por que esta orden lleva nueve dias aqui?"— y
 * porque el pliego la declara inmutable: si un evento esta, se ve.
 *
 * Los botones de estado salen de `destinosPosibles`, que viene del servidor.
 * El panel no tiene su propia copia de la maquina de estados.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { EstadoOrden, FichaOrden } from '@servitotal/compartido';
import { ESTADO_ORDEN } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo } from '../componentes/carga.js';
import { ErrorDeApi } from '../api/cliente.js';

export function DetalleOrden(): JSX.Element {
  const { id = '' } = useParams();
  const { api } = useSesion();
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [moviendo, setMoviendo] = useState(false);

  const { datos, cargando, error: fallo, recargar } = useRecurso<FichaOrden>(
    () => api.pedir<FichaOrden>(`/ordenes/${id}`), [id],
  );

  if (cargando) return <Cargando que="la orden" />;
  if (fallo !== null) return <Fallo error={fallo} alReintentar={recargar} />;
  if (datos === null) return <Fallo error={null} alReintentar={recargar} />;

  const orden = datos;

  async function mover(hacia: EstadoOrden): Promise<void> {
    setMoviendo(true);
    setError(null);
    try {
      await api.pedir(`/ordenes/${orden.id}/estado`, {
        metodo: 'POST',
        cuerpo: {
          hacia,
          // Anular exige motivo escrito; el servidor lo rechaza si falta.
          ...(motivo.trim() === '' ? {} : { motivo: motivo.trim() }),
        },
      });
      setMotivo('');
      recargar();
    } catch (problema) {
      // El servidor explica por que no se puede; se muestra tal cual.
      setError(problema instanceof ErrorDeApi ? problema.message : 'No se pudo mover la orden.');
    } finally {
      setMoviendo(false);
    }
  }

  return (
    <>
      <p><Link to="/ordenes">‹ Ordenes</Link></p>
      <h1>Orden {orden.numero}</h1>
      <p className="subtitulo">
        <span className="estado">{orden.estado.replace(/_/g, ' ')}</span>{' '}
        garantia {orden.tipoGarantia.replace(/_/g, ' ')} ·{' '}
        {orden.modalidad === 'ruta' ? `ruta · ${orden.zona ?? 'sin zona'}` : 'taller'}
      </p>

      {orden.vencida ? (
        <div className="aviso aviso-error">
          <p>
            El plazo vencio hace {Math.abs(Math.round(orden.horasParaVencer ?? 0))} horas
            laborables.
          </p>
        </div>
      ) : null}

      <div className="rejilla">
        <div className="tarjeta">
          <p className="etiqueta-cifra">Cliente</p>
          <p style={{ margin: '4px 0 0' }}>{orden.cliente}</p>
          <p className="tenue" style={{ margin: 0 }}>{orden.telefonoContacto}</p>
          {orden.direccionServicio === null ? null : (
            <p className="tenue" style={{ margin: '6px 0 0' }}>{orden.direccionServicio}</p>
          )}
        </div>
        <div className="tarjeta">
          <p className="etiqueta-cifra">Articulo</p>
          <p style={{ margin: '4px 0 0' }}>{orden.articulo}</p>
          <p className="tenue" style={{ margin: 0 }}>Responsable: {orden.responsableActual ?? '—'}</p>
          <p className="tenue" style={{ margin: 0 }}>Tecnico: {orden.tecnico ?? 'sin asignar'}</p>
        </div>
        <div className="tarjeta">
          <p className="etiqueta-cifra">Total</p>
          <p className="cifra">C$ {orden.total.toFixed(2)}</p>
          <p className="tenue" style={{ margin: 0 }}>
            Cargo de visita C$ {orden.cargoVisita.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="tarjeta">
        <p className="etiqueta-cifra">Falla reportada</p>
        <p style={{ margin: '4px 0 0' }}>{orden.fallaReportada}</p>
      </div>

      <h2>Mover la orden</h2>
      {orden.destinosPosibles.length === 0 ? (
        <p className="tenue">
          Esta orden esta en un estado final y no se modifica. Si hay algo que corregir,
          adjunte una nota de correccion.
        </p>
      ) : (
        <>
          <label htmlFor="motivo">Motivo u observacion (obligatorio para anular)</label>
          <textarea
            id="motivo"
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            placeholder="Por que se mueve la orden"
          />
          <div className="acciones">
            {orden.destinosPosibles.map((destino) => (
              <button
                key={destino}
                type="button"
                className={destino === ESTADO_ORDEN.ANULADA ? 'boton boton-peligro' : 'boton'}
                disabled={moviendo}
                onClick={() => void mover(destino)}
              >
                {destino.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </>
      )}
      {error === null ? null : <div className="aviso aviso-error"><p>{error}</p></div>}

      <h2>Bitacora</h2>
      <table>
        <thead>
          <tr>
            <th>Momento</th>
            <th>Cambio</th>
            <th>Responsable</th>
            <th>Observacion</th>
          </tr>
        </thead>
        <tbody>
          {orden.eventos.map((evento) => (
            <tr key={evento.id}>
              <td className="tenue">{new Date(evento.momento).toLocaleString()}</td>
              <td>
                {evento.estadoAnterior === null
                  ? 'registrada'
                  : `${evento.estadoAnterior.replace(/_/g, ' ')} → ${evento.estadoNuevo.replace(/_/g, ' ')}`}
                {evento.registradoSinConexion ? (
                  <span className="estado estado-alerta" style={{ marginLeft: 8 }}>
                    sin conexion
                  </span>
                ) : null}
              </td>
              <td className="tenue">{evento.responsable ?? '—'}</td>
              <td className="tenue">{evento.observacion ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {orden.notas.length === 0 ? null : (
        <>
          <h2>Notas de correccion</h2>
          {orden.notas.map((nota) => (
            <div key={nota.id} className="tarjeta">
              <strong>{nota.motivo}</strong>
              <p style={{ margin: '4px 0' }}>{nota.detalle}</p>
              <p className="tenue" style={{ margin: 0, fontSize: 13 }}>
                {nota.autor} · {new Date(nota.creadoEn).toLocaleString()}
              </p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
