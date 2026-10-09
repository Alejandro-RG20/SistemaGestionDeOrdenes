/**
 * W-25 · Entrega del articulo.
 *
 * ES LA PANTALLA DEL MOSTRADOR, CON EL CLIENTE DELANTE. Por eso no dice
 * «no se puede entregar» y se calla: lista cada requisito, cual falta y
 * QUE HACER con el. Quien atiende necesita saber a donde mandar al
 * cliente, no que se le niegue la entrega sin explicacion.
 *
 * La lista de requisitos la calcula el servidor contra los datos —no es
 * una casilla de «todo revisado»— y depende de la orden: una garantia de
 * proveedor no necesita autorizacion del cliente, y pedirsela seria inventar un
 * tramite que el negocio no tiene.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { VerificacionDeEntrega } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio } from '../componentes/piezas.js';
import { ErrorDeApi } from '../api/cliente.js';

export function Entrega(): JSX.Element {
  const { id = '' } = useParams();
  const { api } = useSesion();
  const [ronda, setRonda] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [recibidoPor, setRecibidoPor] = useState('');
  const [documento, setDocumento] = useState('');
  const [esElCliente, setEsElCliente] = useState(true);
  const [observacion, setObservacion] = useState('');

  const { datos, cargando, error, recargar } = useRecurso<VerificacionDeEntrega>(
    () => api.pedir<VerificacionDeEntrega>(`/ordenes/${id}/entrega`), [id, ronda],
  );

  if (cargando) return <Cargando que="los requisitos de entrega" />;
  if (error !== null) return <Fallo error={error} alReintentar={recargar} />;
  if (datos === null) return <Vacio>No se encontro la orden.</Vacio>;

  async function entregar(): Promise<void> {
    // La entrega cierra la orden y no se reescribe: se confirma.
    if (!window.confirm(`Registrar la entrega a ${recibidoPor.trim()} y cerrar la orden?`)) return;
    setGuardando(true);
    setFallo(null);
    try {
      await api.pedir(`/ordenes/${id}/entrega`, {
        metodo: 'POST',
        cuerpo: {
          recibidoPor: recibidoPor.trim(),
          ...(documento.trim() === '' ? {} : { documentoReceptor: documento.trim() }),
          esElCliente,
          ...(observacion.trim() === '' ? {} : { observacion: observacion.trim() }),
        },
      });
      setRonda(ronda + 1);
    } catch (problema) {
      setFallo(problema instanceof ErrorDeApi ? problema.message : 'No se pudo registrar.');
    } finally {
      setGuardando(false);
    }
  }

  // Si retira un tercero, su documento es lo unico que lo identifica.
  const faltaDocumento = !esElCliente && documento.trim().length < 4;
  const puedeGuardar = datos.puedeEntregarse
    && recibidoPor.trim().length >= 4
    && !faltaDocumento;

  return (
    <>
      <h2 className="scr">Entrega del articulo</h2>

      {datos.entrega !== null ? (
        <>
          <Aviso tono="ok">
            <b>Este articulo ya se entrego.</b> Si el dato esta mal, adjunte una nota de
            correccion a la orden: una entrega no se reescribe.
          </Aviso>
          <Tarjeta titulo="Como se entrego">
            <div className="meas">
              <span>Lo recibio</span><b>{datos.entrega.recibidoPor}</b>
            </div>
            <div className="meas">
              <span>Es el titular</span><b>{datos.entrega.esElCliente ? 'si' : 'no'}</b>
            </div>
            {datos.entrega.documentoReceptor !== null ? (
              <div className="meas">
                <span>Documento</span><b>{datos.entrega.documentoReceptor}</b>
              </div>
            ) : null}
            <div className="meas">
              <span>Lo entrego</span><b>{datos.entrega.responsable}</b>
            </div>
            <div className="meas">
              <span>Cuando</span>
              <b>{new Date(datos.entrega.momento).toLocaleString('es-NI')}</b>
            </div>
            {datos.entrega.observacion !== null ? (
              <p style={{ fontSize: 12.5, marginTop: 8 }}>{datos.entrega.observacion}</p>
            ) : null}
          </Tarjeta>
        </>
      ) : (
        <>
          <Tarjeta titulo="Antes de entregar">
            {datos.requisitos.map((requisito) => (
              <div
                key={requisito.clave}
                className={requisito.cumplido ? 'ev done' : 'ev miss'}
                style={{ alignItems: 'flex-start' }}
              >
                <span aria-hidden="true">{requisito.cumplido ? '✓' : '○'}</span>
                <span>
                  {requisito.etiqueta}
                  {requisito.cumplido ? null : (
                    <>
                      <br />
                      <small style={{ color: 'var(--soft)' }}>{requisito.queHacer}</small>
                    </>
                  )}
                </span>
              </div>
            ))}
          </Tarjeta>

          {datos.puedeEntregarse ? (
            <Aviso tono="ok">
              Todo en regla. Registre a quien se le entrega y el articulo puede salir.
            </Aviso>
          ) : (
            <Aviso tono="warn">
              <b>Todavia no se puede entregar.</b> Resuelva lo que aparece arriba; cada
              punto dice a donde acudir.
            </Aviso>
          )}

          {fallo !== null ? <Aviso tono="warn">{fallo}</Aviso> : null}

          <Tarjeta titulo="Quien retira el articulo">
            <div className="g g2">
              <div>
                <label htmlFor="recibido">Nombre de quien retira</label>
                <input
                  id="recibido" value={recibidoPor}
                  onChange={(evento) => setRecibidoPor(evento.target.value)}
                  disabled={!datos.puedeEntregarse}
                  placeholder="Como aparece en su documento"
                />
              </div>
              <div>
                <label htmlFor="documento">
                  Documento {esElCliente ? '(opcional)' : '(obligatorio)'}
                </label>
                <input
                  id="documento" value={documento}
                  onChange={(evento) => setDocumento(evento.target.value)}
                  disabled={!datos.puedeEntregarse}
                />
              </div>
            </div>

            <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
              <input
                type="checkbox" checked={esElCliente}
                disabled={!datos.puedeEntregarse}
                onChange={(evento) => setEsElCliente(evento.target.checked)}
              />
              <span style={{ fontSize: 12.5 }}>
                Es el titular de la orden. Si retira otra persona, desmarque y anote su
                documento: es lo unico que la identifica si despues se reclama.
              </span>
            </label>

            <div style={{ marginTop: 10 }}>
              <label htmlFor="observacion">Observacion (opcional)</label>
              <textarea
                id="observacion" rows={2} value={observacion}
                disabled={!datos.puedeEntregarse}
                onChange={(evento) => setObservacion(evento.target.value)}
              />
            </div>

            <button
              type="button" className="btn pri" style={{ marginTop: 10 }}
              disabled={guardando || !puedeGuardar}
              onClick={() => void entregar()}
            >
              {guardando ? 'Registrando…' : 'Registrar la entrega'}
            </button>
          </Tarjeta>
        </>
      )}

      <Link className="btn" to={`/ordenes/${id}`} style={{ marginTop: 12 }}>
        Volver a la orden
      </Link>
    </>
  );
}
