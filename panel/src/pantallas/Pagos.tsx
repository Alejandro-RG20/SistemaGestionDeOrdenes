/**
 * W-24 · Pagos de clientes.
 *
 * LA DISTINCION QUE SOSTIENE ESTA PANTALLA: registrado no es cobrado.
 *
 * Un deposito que el cliente dice haber hecho se anota, pero el articulo
 * no sale hasta que alguien de cobros lo vea en la cuenta. Por eso el
 * estado va en la primera columna que se lee y no escondido al final:
 * confundir los dos es entregar un equipo que nadie pago.
 *
 * Confirmar es un permiso aparte de registrar, igual que pedir una compra
 * es distinto de recibirla.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ESTADO_PAGO, type ResumenPago } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import {
  Aviso, Cargando, cordobas, Etiqueta, Fallo, Tarjeta, Vacio,
} from '../componentes/piezas.js';
import { tienePermiso } from '../sesion/navegacion.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

function tonoDeEstado(estado: string): string {
  if (estado === ESTADO_PAGO.CONFIRMADO) return 't-t';
  if (estado === ESTADO_PAGO.ANULADO) return 't-g';
  return 't-a';
}

export function Pagos(): JSX.Element {
  const { api, usuario } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const pagina = Number(parametros.get('pagina') ?? '1');
  const [ronda, setRonda] = useState(0);
  const [fallo, setFallo] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const puedeConfirmar = tienePermiso(usuario, 'cobros.pago.confirmar');

  const { datos, cargando, error, recargar } = useRecurso<PaginaDeDatos<ResumenPago>>(
    () => api.pedirPagina<ResumenPago>('/pagos', { pagina }), [pagina, ronda],
  );

  async function cambiar(id: string, estado: string, elMotivo?: string): Promise<void> {
    setFallo(null);
    try {
      await api.pedir(`/pagos/${id}/estado`, {
        metodo: 'POST',
        cuerpo: { estado, ...(elMotivo === undefined ? {} : { motivo: elMotivo }) },
      });
      setAnulando(null);
      setMotivo('');
      setRonda(ronda + 1);
    } catch (problema) {
      setFallo(problema instanceof ErrorDeApi ? problema.message : 'No se pudo cambiar el pago.');
    }
  }

  const sinConfirmar = (datos?.datos ?? [])
    .filter((pago) => pago.estado === ESTADO_PAGO.REGISTRADO);

  return (
    <>
      <h2 className="scr">Pagos de clientes</h2>
      <p className="sub">
        Un pago registrado no es un pago cobrado. Solo lo confirmado habilita la entrega
        del articulo.
      </p>

      {fallo !== null ? <Aviso tono="warn">{fallo}</Aviso> : null}

      {sinConfirmar.length > 0 ? (
        <Aviso tono="warn">
          <b>{sinConfirmar.length} pago(s) sin confirmar en esta pagina.</b> Mientras no se
          confirmen, esos articulos no pueden salir del centro.
        </Aviso>
      ) : null}

      {cargando ? <Cargando que="los pagos" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}

      {datos !== null && error === null ? (
        datos.datos.length === 0 ? <Vacio>No hay pagos registrados.</Vacio> : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Estado</th><th>Orden</th><th>Cliente</th><th>Monto</th>
                  <th>Forma</th><th>Referencia</th><th>Registro</th>
                  {puedeConfirmar ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {datos.datos.map((pago) => (
                  <tr key={pago.id}>
                    {/* El estado va primero: es lo que decide si el articulo
                        puede salir, y esconderlo al final lo hace invisible. */}
                    <td>
                      <Etiqueta tono={tonoDeEstado(pago.estado)}>{pago.estado}</Etiqueta>
                    </td>
                    <td>
                      <Link to={`/ordenes/${pago.idOrden}`}>
                        <code>{pago.codigoOrden}</code>
                      </Link>
                    </td>
                    <td>{pago.cliente}</td>
                    <td style={{ textAlign: 'right' }}>{cordobas(pago.monto)}</td>
                    <td>{pago.formaPago}</td>
                    <td className="tenue">{pago.referencia ?? '—'}</td>
                    <td className="tenue" style={{ fontSize: 12 }}>
                      {pago.registradoPor ?? '—'}
                      <br />
                      {new Date(pago.creadoEn).toLocaleDateString('es-NI')}
                    </td>
                    {puedeConfirmar ? (
                      <td>
                        {pago.estado === ESTADO_PAGO.REGISTRADO ? (
                          <div className="acciones-fila">
                            <button
                              type="button" className="btn chico"
                              onClick={() => void cambiar(pago.id, ESTADO_PAGO.CONFIRMADO)}
                            >
                              Confirmar
                            </button>
                            <button
                              type="button" className="btn chico peligro"
                              onClick={() => setAnulando(pago.id)}
                            >
                              Anular
                            </button>
                          </div>
                        ) : (
                          <span className="tenue" style={{ fontSize: 11 }}>
                            {pago.estado === ESTADO_PAGO.ANULADO
                              ? pago.motivoAnulacion ?? 'anulado'
                              : `confirmado por ${pago.confirmadoPor ?? '—'}`}
                          </span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>

            {anulando !== null ? (
              <Tarjeta titulo="Anular el pago">
                <p className="tenue" style={{ fontSize: 12.5, marginTop: 0 }}>
                  Un pago no se borra: se anula, con motivo escrito. Borrarlo dejaria una
                  orden entregada sin rastro de por que se dio por pagada.
                </p>
                <label htmlFor="motivo">Por que se anula</label>
                <input
                  id="motivo" value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value)}
                  placeholder="La transferencia nunca llego a la cuenta."
                />
                <div className="tools" style={{ marginTop: 10 }}>
                  <button
                    type="button" className="btn peligro"
                    disabled={motivo.trim().length < 5}
                    onClick={() => void cambiar(anulando, ESTADO_PAGO.ANULADO, motivo.trim())}
                  >
                    Anular el pago
                  </button>
                  <button
                    type="button" className="btn"
                    onClick={() => { setAnulando(null); setMotivo(''); }}
                  >
                    Cancelar
                  </button>
                </div>
              </Tarjeta>
            ) : null}

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
