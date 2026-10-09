/**
 * Bandeja de excepciones de sincronizacion.
 *
 * Cada renglon es algo que llego de campo y el servidor no pudo aplicar, o
 * aplico con una diferencia por conciliar. No son errores que se descartan:
 * la carga original esta guardada integra y alguien tiene que decidir que
 * hacer con ella.
 *
 * Antes la pantalla mostraba la carga en JSON y nada mas. Ahora muestra la
 * LECTURA que hace el servidor —que se intento, cuando, sobre que orden, en
 * que estado esta la orden hoy y si los datos del registro se contradicen—
 * y deja la carga original a un clic, intacta, para la auditoria.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ResumenExcepcion } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio, fechaHora } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

/** El servidor exige al menos esto en la resolucion. */
const MINIMO_RESOLUCION = 10;

const nombreEstado = (estado: string | null): string => (estado === null ? '—' : estado.replace(/_/g, ' '));

const ESTADOS = [
  { valor: 'pendiente', nombre: 'Pendientes' },
  { valor: 'resuelta', nombre: 'Conciliadas' },
  { valor: 'descartada', nombre: 'Descartadas' },
  { valor: '', nombre: 'Todas' },
] as const;

export function Excepciones(): JSX.Element {
  const { api } = useSesion();
  const { id: idEnRuta } = useParams();
  const navegar = useNavigate();
  const [estado, setEstado] = useState<string>('pendiente');
  const [pagina, setPagina] = useState(1);

  const lista = useRecurso<PaginaDeDatos<ResumenExcepcion>>(
    () => api.pedirPagina<ResumenExcepcion>('/sincronizacion/excepciones', {
      estado: estado === '' ? undefined : estado, pagina, tamano: 20,
    }),
    [estado, pagina],
  );

  return (
    <>
      <h2 className="scr">Trabajo de campo sin conciliar</h2>
      <p className="sub">
        Lo que un tecnico registro sin conexion y el servidor no pudo aplicar, o aplico con una
        diferencia. Nada se perdio: la carga original se conserva completa.
      </p>

      {idEnRuta === undefined ? null : (
        <DetalleDeExcepcion id={idEnRuta} alCerrar={() => navegar('/excepciones')} alResolver={lista.recargar} />
      )}

      <div className="tabs">
        {ESTADOS.map((uno) => (
          <span
            key={uno.valor} className={estado === uno.valor ? 'on' : ''}
            onClick={() => { setEstado(uno.valor); setPagina(1); }}
          >
            {uno.nombre}
          </span>
        ))}
      </div>

      {lista.cargando ? <Cargando que="las excepciones" /> : null}
      {lista.error !== null ? <Fallo error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.datos !== null && lista.error === null ? (
        lista.datos.datos.length === 0 ? (
          <Vacio>
            {estado === 'pendiente'
              ? 'No hay excepciones pendientes. Todo lo de campo esta aplicado.'
              : 'No hay excepciones con este estado.'}
          </Vacio>
        ) : (
          <table>
            <thead>
              <tr><th>Recibida</th><th>Orden</th><th>Operacion</th><th>Tecnico</th><th>Motivo</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {lista.datos.datos.map((excepcion) => (
                <tr key={excepcion.id}>
                  <td className="tenue">{fechaHora(excepcion.creadoEn)}</td>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                    {excepcion.idOrden === null ? '—' : (
                      <Link to={`/ordenes/${excepcion.idOrden}`}>{excepcion.codigoOrden ?? excepcion.numeroOrden}</Link>
                    )}
                  </td>
                  <td>
                    {excepcion.lectura.operacion}
                    {excepcion.lectura.advertencias.length > 0 ? (
                      <span className="tag t-a" style={{ marginLeft: 6 }} title="El registro tiene datos que no cuadran">
                        revisar datos
                      </span>
                    ) : null}
                  </td>
                  <td className="tenue">{excepcion.tecnico ?? 'no identificado'}</td>
                  <td style={{ maxWidth: 340 }}>{excepcion.motivo}</td>
                  <td><EtiquetaDeEstado estado={excepcion.estado} /></td>
                  <td>
                    <Link className="btn chico" to={`/excepciones/${excepcion.id}`}>
                      {excepcion.estado === 'pendiente' ? 'Revisar' : 'Ver'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      {lista.datos !== null && lista.datos.paginacion.totalPaginas > 1 ? (
        <div className="paginacion">
          <button type="button" className="btn chico" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </button>
          <span>Pagina {lista.datos.paginacion.pagina} de {lista.datos.paginacion.totalPaginas}</span>
          <button
            type="button" className="btn chico" disabled={pagina >= lista.datos.paginacion.totalPaginas}
            onClick={() => setPagina(pagina + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </>
  );
}

function EtiquetaDeEstado({ estado }: { estado: string }): JSX.Element {
  if (estado === 'pendiente') return <span className="tag t-a">pendiente</span>;
  if (estado === 'resuelta') return <span className="tag t-t">conciliada</span>;
  return <span className="tag t-g">{estado}</span>;
}

function DetalleDeExcepcion(
  { id, alCerrar, alResolver }: { id: string; alCerrar: () => void; alResolver: () => void },
): JSX.Element {
  const { api } = useSesion();
  const ficha = useRecurso<ResumenExcepcion>(() => api.pedir<ResumenExcepcion>(`/sincronizacion/excepciones/${id}`), [id]);
  const [resolucion, setResolucion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  if (ficha.cargando) return <Cargando que="la excepcion" />;
  if (ficha.error !== null || ficha.datos === null) return <Fallo error={ficha.error} alReintentar={ficha.recargar} />;
  const excepcion = ficha.datos;
  const { lectura } = excepcion;

  async function resolver(estado: 'resuelta' | 'descartada'): Promise<void> {
    const accion = estado === 'resuelta' ? 'marcar como conciliada' : 'descartar';
    if (!window.confirm(`¿Seguro que desea ${accion} esta excepcion? La decision queda registrada y no se puede reabrir.`)) return;
    setTrabajando(true);
    setError(null);
    try {
      await api.pedir(`/sincronizacion/excepciones/${id}/resolver`, {
        metodo: 'POST', cuerpo: { estado, resolucion: resolucion.trim() },
      });
      setResolucion('');
      ficha.recargar();
      alResolver();
    } catch (problema) {
      setError(problema instanceof ErrorDeApi ? problema.message : 'No se pudo registrar la decision.');
    } finally {
      setTrabajando(false);
    }
  }

  const faltan = MINIMO_RESOLUCION - resolucion.trim().length;

  return (
    <Tarjeta
      titulo={lectura.operacion}
      extra={<a style={{ cursor: 'pointer' }} onClick={alCerrar}>cerrar</a>}
      acento={excepcion.estado === 'pendiente' ? 'var(--amber)' : undefined}
    >
      <p style={{ marginTop: 0 }}><b>Por que quedo aqui:</b> {excepcion.motivo}</p>

      {lectura.advertencias.length === 0 ? null : (
        <Aviso tono="warn">
          <b>Los datos de este registro no cuadran entre si.</b>
          <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
            {lectura.advertencias.map((texto) => <li key={texto}>{texto}</li>)}
          </ul>
        </Aviso>
      )}

      <div className="g g3">
        <Dato etiqueta="Orden">
          {excepcion.idOrden === null ? 'sin orden asociada' : (
            <Link to={`/ordenes/${excepcion.idOrden}`}>{excepcion.codigoOrden ?? excepcion.numeroOrden}</Link>
          )}
        </Dato>
        <Dato etiqueta="Tecnico">{excepcion.tecnico ?? 'no identificado'}</Dato>
        <Dato etiqueta="Recibida en el servidor">{fechaHora(excepcion.creadoEn)}</Dato>
        <Dato etiqueta="Hecha en el dispositivo">
          {lectura.momentoDispositivo === null ? '—' : fechaHora(lectura.momentoDispositivo)}
          {lectura.registradoSinConexion === true ? ' · sin conexion' : ''}
        </Dato>
        <Dato etiqueta="Estado que anota el registro">{nombreEstado(lectura.estadoAnotado)}</Dato>
        <Dato etiqueta="Estado de la orden hoy">{nombreEstado(lectura.estadoActualOrden)}</Dato>
      </div>

      {lectura.condicion === null ? null : (
        <p className="tenue" style={{ fontSize: 13 }}><b>Que exige el servidor para aplicarla:</b> {lectura.condicion}</p>
      )}

      {lectura.detalles.length === 0 ? null : (
        <>
          <h4 style={{ margin: '10px 0 4px' }}>Lo que envio el dispositivo</h4>
          <table className="d">
            <tbody>
              {lectura.detalles.map((dato, indice) => (
                <tr key={`${dato.etiqueta}-${indice}`}><td className="tenue" style={{ width: 220 }}>{dato.etiqueta}</td><td>{dato.valor}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <details style={{ margin: '10px 0' }}>
        <summary style={{ cursor: 'pointer' }}>Datos tecnicos (carga original, para auditoria)</summary>
        <p className="tenue" style={{ fontSize: 12 }}>
          Identificador de la operacion: {excepcion.idOperacion ?? '—'} · tipo: {lectura.codigoOperacion ?? '—'}
        </p>
        <pre style={{ background: '#f1f5f9', padding: 12, borderRadius: 6, overflowX: 'auto', fontSize: 12 }}>
          {JSON.stringify(excepcion.cargaOriginal, null, 2)}
        </pre>
      </details>

      {excepcion.estado !== 'pendiente' ? (
        <Aviso tono="info">
          {excepcion.estado === 'resuelta' ? 'Conciliada' : 'Descartada'} por {excepcion.resueltaPor ?? '—'}
          {' '}el {fechaHora(excepcion.resueltaEn)}: {excepcion.resolucion}
        </Aviso>
      ) : (
        <>
          {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
          <label htmlFor="resolucion">Que se hizo con esto (queda registrado, minimo {MINIMO_RESOLUCION} caracteres)</label>
          <textarea
            id="resolucion" value={resolucion} onChange={(evento) => setResolucion(evento.target.value)}
            placeholder="Se confirmo con el tecnico y se aplico el consumo a mano contra su bodega."
          />
          {faltan > 0 && resolucion.length > 0 ? <small className="tenue">Faltan {faltan} caracteres.</small> : null}
          <div className="tools">
            <button
              type="button" className="btn pri" disabled={trabajando || faltan > 0}
              onClick={() => { void resolver('resuelta'); }}
            >
              Conciliada
            </button>
            <button
              type="button" className="btn peligro" disabled={trabajando || faltan > 0}
              onClick={() => { void resolver('descartada'); }}
            >
              Descartar
            </button>
          </div>
        </>
      )}
    </Tarjeta>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <label>{etiqueta}</label>
      <div style={{ padding: '4px 0' }}>{children}</div>
    </div>
  );
}
