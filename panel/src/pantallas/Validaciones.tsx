/**
 * W-17 · Validacion tecnica.
 *
 * Es la pantalla donde una jefatura decide si el centro responde por una
 * reparacion. Por eso NO es una lista con un boton «aprobar»: el
 * expediente de revision pone delante lo que de verdad se juzga —el
 * diagnostico, que evidencia hay y cual falta, que repuestos se
 * declararon— antes de dejar aprobar nada.
 *
 * Dos cosas que la pantalla hace y conviene no perder:
 *
 *  - Si falta evidencia obligatoria, el boton de aprobar no esta. No
 *    aparece deshabilitado con un tooltip: no esta, y en su lugar se
 *    explica por que y que hacer. El servidor lo rechaza igual, pero
 *    ofrecerlo seria mentirle al jefe sobre lo que puede hacer.
 *  - Si la orden es suya, no puede aprobarla y se le dice a la cara.
 */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  RESULTADO_VALIDACION,
  type ExpedienteDeRevision, type ResultadoValidacion,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import {
  Aviso, Cargando, cordobas, Etiqueta, EtiquetaEstado, Fallo, Garantia, Tarjeta, Vacio,
} from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

interface OrdenPorRevisar {
  readonly idOrden: string;
  readonly codigo: string;
  readonly numero: number;
  readonly estado: string;
  readonly cliente: string;
  readonly articulo: string;
  readonly tecnico: string | null;
  readonly tipoGarantia: string;
}

export function Validaciones(): JSX.Element {
  const { api } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const pagina = Number(parametros.get('pagina') ?? '1');

  const { datos, cargando, error, recargar } = useRecurso<PaginaDeDatos<OrdenPorRevisar>>(
    () => api.pedirPagina<OrdenPorRevisar>('/validaciones/pendientes', { pagina }),
    [pagina],
  );

  return (
    <>
      <h2 className="scr">Validacion tecnica</h2>
      <p className="sub">
        Trabajo terminado que ninguna jefatura ha aprobado todavia. Mientras no se apruebe,
        el articulo no puede entregarse al cliente.
      </p>

      {cargando ? <Cargando que="las ordenes por revisar" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}

      {datos !== null && error === null ? (
        datos.datos.length === 0 ? (
          <Vacio>No hay trabajo pendiente de revision.</Vacio>
        ) : (
          <>
            <p className="tenue" style={{ fontSize: 13 }}>
              {datos.paginacion.total} orden(es) esperando revision.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Orden</th><th>Cliente</th><th>Articulo</th>
                  <th>Tecnico</th><th>Garantia</th><th>Estado</th><th />
                </tr>
              </thead>
              <tbody>
                {datos.datos.map((orden) => (
                  <tr key={orden.idOrden}>
                    <td><code>{orden.codigo}</code></td>
                    <td>{orden.cliente}</td>
                    <td>{orden.articulo}</td>
                    <td className="tenue">{orden.tecnico ?? '—'}</td>
                    <td><Garantia tipo={orden.tipoGarantia as never} /></td>
                    <td><EtiquetaEstado estado={orden.estado as never} /></td>
                    <td>
                      <Link className="btn chico" to={`/validaciones/${orden.idOrden}`}>
                        Revisar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {datos.paginacion.totalPaginas > 1 ? (
              <div className="acciones-fila" style={{ marginTop: 10 }}>
                <button
                  type="button" className="btn chico" disabled={pagina <= 1}
                  onClick={() => {
                    const p = new URLSearchParams(parametros);
                    p.set('pagina', String(pagina - 1));
                    setParametros(p);
                  }}
                >
                  Anterior
                </button>
                <span className="tenue" style={{ fontSize: 12, alignSelf: 'center' }}>
                  Pagina {pagina} de {datos.paginacion.totalPaginas}
                </span>
                <button
                  type="button" className="btn chico"
                  disabled={pagina >= datos.paginacion.totalPaginas}
                  onClick={() => {
                    const p = new URLSearchParams(parametros);
                    p.set('pagina', String(pagina + 1));
                    setParametros(p);
                  }}
                >
                  Siguiente
                </button>
              </div>
            ) : null}
          </>
        )
      ) : null}
    </>
  );
}

const ETIQUETA_RESULTADO: Record<ResultadoValidacion, string> = {
  [RESULTADO_VALIDACION.APROBADA]: 'Aprobar el trabajo',
  [RESULTADO_VALIDACION.REQUIERE_CORRECCION]: 'Devolver para corregir',
  [RESULTADO_VALIDACION.RECHAZADA]: 'Rechazar: hay que rehacerlo',
};

export function RevisarOrden(): JSX.Element {
  const { id = '' } = useParams();
  const { api } = useSesion();
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const [resultado, setResultado] = useState<ResultadoValidacion>(
    RESULTADO_VALIDACION.REQUIERE_CORRECCION,
  );
  const [observacion, setObservacion] = useState('');
  const [revisado, setRevisado] = useState({
    diagnostico: false, reparacion: false, evidencias: false, repuestos: false,
  });

  const { datos, cargando, error, recargar } = useRecurso<ExpedienteDeRevision>(
    () => api.pedir<ExpedienteDeRevision>(`/ordenes/${id}/revision`), [id, listo],
  );

  if (cargando) return <Cargando que="el expediente de revision" />;
  if (error !== null) return <Fallo error={error} alReintentar={recargar} />;
  if (datos === null) return <Vacio>No se encontro la orden.</Vacio>;

  const faltaEvidencia = datos.evidenciasFaltantes.length > 0;
  const puedeAprobar = !faltaEvidencia && !datos.esSuPropioTrabajo;
  const opciones: ResultadoValidacion[] = puedeAprobar
    ? [RESULTADO_VALIDACION.APROBADA, RESULTADO_VALIDACION.REQUIERE_CORRECCION,
      RESULTADO_VALIDACION.RECHAZADA]
    : [RESULTADO_VALIDACION.REQUIERE_CORRECCION, RESULTADO_VALIDACION.RECHAZADA];

  async function registrar(): Promise<void> {
    setGuardando(true);
    setFallo(null);
    try {
      await api.pedir(`/ordenes/${id}/validaciones`, {
        metodo: 'POST',
        cuerpo: {
          resultado,
          observacion: observacion.trim(),
          revisoDiagnostico: revisado.diagnostico,
          revisoReparacion: revisado.reparacion,
          revisoEvidencias: revisado.evidencias,
          revisoRepuestos: revisado.repuestos,
        },
      });
      setObservacion('');
      setListo(!listo);
    } catch (problema) {
      setFallo(problema instanceof ErrorDeApi ? problema.message : 'No se pudo registrar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <h2 className="scr">Revision de {datos.codigo}</h2>
      <p className="sub">
        {datos.cliente} · {datos.articulo} · <Garantia tipo={datos.tipoGarantia as never} />
        {' '}<EtiquetaEstado estado={datos.estado as never} />
      </p>

      {datos.esSuPropioTrabajo ? (
        <Aviso tono="warn">
          <b>Esta orden la atendio usted.</b> Nadie valida su propio trabajo: pidale la
          revision a otra jefatura. Puede devolverla para corregir, pero no aprobarla.
        </Aviso>
      ) : null}

      <div className="g g2">
        <Tarjeta titulo="Lo que se reporto y lo que se encontro">
          <div className="meas">
            <span>Falla reportada</span><b>{datos.fallaReportada}</b>
          </div>
          {datos.diagnostico === null ? (
            <Aviso tono="warn">
              <b>No hay diagnostico registrado.</b> Sin el, no hay nada que revisar ni con
              que sustentar la reparacion.
            </Aviso>
          ) : (
            <>
              <div className="meas">
                <span>Componente</span><b>{datos.diagnostico.componente ?? 'sin especificar'}</b>
              </div>
              <p style={{ fontSize: 13, marginTop: 8 }}>{datos.diagnostico.fallaReal}</p>
            </>
          )}
          <div className="meas" style={{ marginTop: 8 }}>
            <span>Tecnico</span><b>{datos.tecnico ?? 'sin asignar'}</b>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Evidencia">
          {datos.evidenciasPresentes.map((clave) => (
            <div key={clave} className="ev done">
              <span aria-hidden="true">✓</span><span>{clave.replace(/_/g, ' ')}</span>
            </div>
          ))}
          {datos.evidenciasFaltantes.map((clave) => (
            <div key={clave} className="ev miss">
              <span aria-hidden="true">○</span>
              <span>{clave.replace(/_/g, ' ')}</span>
              <em>falta</em>
            </div>
          ))}
          {datos.evidenciasPresentes.length === 0 && !faltaEvidencia ? (
            <p className="tenue" style={{ fontSize: 12, margin: 0 }}>
              Esta garantia no exige evidencia obligatoria.
            </p>
          ) : null}
        </Tarjeta>
      </div>

      <Tarjeta titulo="Repuestos declarados">
        {datos.repuestos.length === 0 ? (
          <p className="tenue" style={{ fontSize: 12, margin: 0 }}>
            No se consumio ningun repuesto contra esta orden.
          </p>
        ) : (
          <table>
            <thead><tr><th>Repuesto</th><th>Cantidad</th><th>Precio</th></tr></thead>
            <tbody>
              {datos.repuestos.map((repuesto, indice) => (
                <tr key={`${repuesto.descripcion}-${indice}`}>
                  <td>{repuesto.descripcion}</td>
                  <td>{repuesto.cantidad}</td>
                  <td>{cordobas(repuesto.precioUnitario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>

      {faltaEvidencia ? (
        <Aviso tono="warn">
          <b>Falta evidencia obligatoria, asi que no se puede aprobar.</b> Sin ella el
          trabajo no queda demostrado y la garantia del proveedor no lo respalda.
          Devuelva la orden para que el tecnico la complete.
        </Aviso>
      ) : null}

      {fallo !== null ? <Aviso tono="warn">{fallo}</Aviso> : null}

      <Tarjeta titulo="Su revision">
        <div className="g g2">
          <div>
            <label htmlFor="resultado">Resultado</label>
            <select
              id="resultado" value={resultado}
              onChange={(evento) => setResultado(evento.target.value as ResultadoValidacion)}
            >
              {opciones.map((opcion) => (
                <option key={opcion} value={opcion}>{ETIQUETA_RESULTADO[opcion]}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Que reviso</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12.5 }}>
              {([
                ['diagnostico', 'Diagnostico'],
                ['reparacion', 'Reparacion'],
                ['evidencias', 'Evidencias'],
                ['repuestos', 'Repuestos'],
              ] as const).map(([clave, etiqueta]) => (
                <label key={clave} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <input
                    type="checkbox" checked={revisado[clave]}
                    onChange={(evento) =>
                      setRevisado({ ...revisado, [clave]: evento.target.checked })}
                  />
                  {etiqueta}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label htmlFor="observacion">Que encontro</label>
          <textarea
            id="observacion" rows={3} value={observacion}
            onChange={(evento) => setObservacion(evento.target.value)}
            placeholder="Lo que le diria al tecnico. Esto queda en el expediente y no se borra."
          />
          {observacion.trim().length > 0 && observacion.trim().length < 10 ? (
            <p style={{ fontSize: 11, color: 'var(--amber)', margin: '4px 0 0' }}>
              Escriba un poco mas: una aprobacion sin criterio escrito no se puede defender.
            </p>
          ) : null}
        </div>

        <button
          type="button" className="btn pri" style={{ marginTop: 10 }}
          disabled={guardando || observacion.trim().length < 10}
          onClick={() => void registrar()}
        >
          {guardando ? 'Registrando…' : ETIQUETA_RESULTADO[resultado]}
        </button>
      </Tarjeta>

      <Tarjeta titulo="Revisiones anteriores">
        {datos.validaciones.length === 0 ? (
          <p className="tenue" style={{ fontSize: 12, margin: 0 }}>
            Esta es la primera revision de esta orden.
          </p>
        ) : (
          <table>
            <thead><tr><th>Resultado</th><th>Jefatura</th><th>Cuando</th><th>Observacion</th></tr></thead>
            <tbody>
              {datos.validaciones.map((validacion) => (
                <tr key={validacion.id}>
                  <td>
                    <Etiqueta tono={
                      validacion.resultado === RESULTADO_VALIDACION.APROBADA ? 't-t' : 't-r'
                    }>
                      {validacion.resultado.replace(/_/g, ' ')}
                    </Etiqueta>
                  </td>
                  <td>{validacion.validador}</td>
                  <td className="tenue">
                    {new Date(validacion.momento).toLocaleString('es-NI')}
                  </td>
                  <td style={{ fontSize: 12 }}>{validacion.observacion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>

      <Link className="btn" to="/validaciones" style={{ marginTop: 12 }}>
        Volver a la lista
      </Link>
    </>
  );
}
