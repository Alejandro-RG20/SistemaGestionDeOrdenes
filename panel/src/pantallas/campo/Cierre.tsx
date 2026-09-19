/**
 * M-07 · Cierre del servicio, y la cola de envio.
 *
 * El tecnico NO cierra la orden. La mueve a terminada o la manda al taller,
 * y la jefatura cierra. Tomar una decision de cierre solo, en la casa del
 * cliente y sin señal para consultar, es justo lo que no debe pasar: es
 * donde se regalan garantias y se pierden cobros.
 *
 * Lo que si hace esta pantalla es enseñarle, antes de irse, QUE QUEDA SIN
 * ENVIAR y con nombre propio. Un contador que dice «3 pendientes» no le
 * sirve: necesita saber si lo que falta es su trabajo de la mañana o una
 * foto suelta, porque de eso depende si se va tranquilo o se queda a buscar
 * señal.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCampo } from '../../campo/contexto.js';
import { Aviso, Garantia, EtiquetaEstado } from '../../componentes/piezas.js';
import { BarraDeSincronizacion, Pasos } from '../../componentes/ArmazonCampo.js';
import { avancesDisponibles, porQueNoSePuedeMover } from '../../campo/flujo-campo.js';
import { useDelCampo } from './datos.js';

export function Cierre(): JSX.Element {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { campo, pendientes, enLinea, refrescar } = useCampo();
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const { datos, cargando } = useDelCampo(async (coordinador) => {
    const orden = await coordinador.orden(id);
    if (orden === null) return null;
    return {
      orden,
      reglas: await coordinador.evidenciaRequerida(orden),
      cola: await coordinador.colaPendiente(),
    };
  }, [id, pendientes]);

  if (cargando) return <p className="sub">Leyendo el trabajo guardado…</p>;
  if (datos === null) return <Aviso tono="warn">Esta orden no esta en la ruta que bajo.</Aviso>;

  const { orden, reglas, cola } = datos;
  const capturadas = new Set(orden.evidenciasRegistradas);
  const hechas = reglas.filter((regla) => capturadas.has(regla.clave)).length;
  const avances = avancesDisponibles(orden.estado);
  const bloqueo = porQueNoSePuedeMover(orden.estado);

  const mover = async (hacia: (typeof avances)[number]['hacia']): Promise<void> => {
    if (campo === null) return;
    setGuardando(true);
    setFallo(null);
    try {
      await campo.coordinador.moverOrden(orden.id, hacia);
      await refrescar();
      navegar('/campo');
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se pudo guardar.');
      setGuardando(false);
    }
  };

  return (
    <>
      <BarraDeSincronizacion />
      <Pasos de={6} />

      <h2 className="scr">Cierre del servicio</h2>
      <p className="sub">N.º {orden.numero} · {orden.cliente}</p>

      <div className="card">
        <h3>Resumen</h3>
        <div className="meas"><span>Articulo</span><b>{orden.articulo}</b></div>
        <div className="meas">
          <span>Estado</span><b><EtiquetaEstado estado={orden.estado} /></b>
        </div>
        <div className="meas">
          <span>Quien paga</span><b><Garantia tipo={orden.tipoGarantia} /></b>
        </div>
        <div className={hechas < reglas.length ? 'meas bad' : 'meas'}>
          <span>Evidencia obligatoria</span><b>{hechas} de {reglas.length}</b>
        </div>
      </div>

      {hechas < reglas.length
        ? (
          <Aviso tono="warn">
            Le falta evidencia. <Link to={`/campo/ordenes/${orden.id}/evidencia`}>Complete
            la lista</Link> antes de despedirse del cliente: volver por una fotografia cuesta
            otra visita.
          </Aviso>
        )
        : null}

      {fallo === null ? null : <Aviso tono="warn">{fallo}</Aviso>}

      {bloqueo === null
        ? (
          <div className="card">
            <h3>Como queda la orden</h3>
            {avances.map((avance) => (
              <div key={avance.hacia} style={{ marginBottom: 9 }}>
                <button
                  type="button"
                  className="btn teal"
                  disabled={guardando}
                  onClick={() => { void mover(avance.hacia); }}
                >
                  {avance.etiqueta}
                </button>
                {avance.advertencia === undefined
                  ? null
                  : (
                    <p style={{ fontSize: 11, color: 'var(--soft)', margin: '4px 0 0' }}>
                      {avance.advertencia}
                    </p>
                  )}
              </div>
            ))}
            <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: 0 }}>
              El cierre definitivo y la entrega los registra la jefatura en el taller. Usted
              deja constancia de como quedo.
            </p>
          </div>
        )
        : <Aviso>{bloqueo}</Aviso>}

      <ColaDeEnvio cola={cola} enLinea={enLinea} />

      <div className="stickybar">
        <button type="button" className="btn" onClick={() => navegar('/campo')}>
          Volver a la ruta
        </button>
      </div>
    </>
  );
}

/** La cola, con nombre y apellido de cada cosa que falta por subir. */
function ColaDeEnvio(
  { cola, enLinea }: { cola: readonly {
    clave: string; descripcion: string; numeroOrden: number | null;
    intentos: number; detalle: string | null;
  }[]; enLinea: boolean },
): JSX.Element {
  if (cola.length === 0) {
    return (
      <Aviso tono="ok">
        <b>No queda nada por enviar.</b> Todo su trabajo esta en el servidor.
      </Aviso>
    );
  }

  return (
    <>
      <div className="card">
        <h3>Falta por enviar</h3>
        {cola.map((fila) => (
          <div key={fila.clave} className="ev">
            <span aria-hidden="true">◇</span>
            <span>
              {fila.numeroOrden === null ? '' : `N.º ${fila.numeroOrden} · `}
              {fila.descripcion}
              {fila.detalle === null
                ? null
                : (
                  <>
                    <br />
                    <small style={{ color: 'var(--soft)' }}>{fila.detalle}</small>
                  </>
                )}
            </span>
            <em>{fila.intentos > 1 ? `${fila.intentos} intentos` : 'pendiente'}</em>
          </div>
        ))}
      </div>
      <Aviso tono={enLinea ? '' : 'ok'}>
        <b>El trabajo ya esta guardado en este dispositivo.</b> Se envia solo cuando vuelva
        la señal. No hace falta esperar aqui ni volver a digitarlo en el taller.
      </Aviso>
    </>
  );
}

/** La pestaña de envios: la misma cola, sin orden de por medio. */
export function Envios(): JSX.Element {
  const {
    enLinea, pendientes, sincronizando, sincronizar, descargadaEn,
  } = useCampo();
  const { datos, cargando } = useDelCampo(
    (coordinador) => coordinador.colaPendiente(), [pendientes],
  );

  return (
    <>
      <BarraDeSincronizacion />
      <h2 className="scr">Envios</h2>
      <p className="sub">
        Ruta bajada {descargadaEn === null ? 'nunca' : new Date(descargadaEn).toLocaleString('es-NI')}
      </p>

      {cargando ? <p className="sub">Leyendo la cola…</p> : null}

      <ColaDeEnvio cola={datos ?? []} enLinea={enLinea} />

      {!enLinea
        ? (
          <Aviso tono="warn">
            Sin señal no hay nada que hacer desde aqui. En cuanto el celular recupere datos,
            el envio arranca solo.
          </Aviso>
        )
        : null}

      {enLinea && pendientes > 0
        ? (
          <div className="stickybar">
            <button
              type="button"
              className="btn teal"
              disabled={sincronizando}
              onClick={() => { void sincronizar(); }}
            >
              {sincronizando ? 'Enviando…' : 'Enviar ahora'}
            </button>
          </div>
        )
        : null}
    </>
  );
}
