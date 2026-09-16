/**
 * W-05 · Detalle de la orden, con las pestanas del prototipo.
 *
 * Lo que el prototipo demuestra aqui es que **el plazo comprometido esta
 * visible en todo momento** (RN-16): va en la cabecera, junto al
 * responsable y al costo para el cliente, no escondido en una pestana.
 *
 * Las pestanas cargan bajo demanda. Una orden con doscientos eventos de
 * bitacora y treinta evidencias no puede hacer esperar a quien solo queria
 * ver en que estado esta.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ESTADO_ORDEN,
  type EstadoOrden, type EvidenciaDeOrden, type FichaOrden,
  type ResumenMovimiento, type ResumenVisita,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import {
  Aviso, Cargando, Cifra, EtiquetaEstado, Fallo, Garantia, Tarjeta, Vacio,
  cordobas, fechaHora, plazoEnPalabras,
} from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

const PESTANAS = ['Resumen', 'Evidencia', 'Repuestos', 'Visitas', 'Bitacora'] as const;
type Pestana = (typeof PESTANAS)[number];

export function DetalleOrden(): JSX.Element {
  const { id = '' } = useParams();
  const { api } = useSesion();
  const [pestana, setPestana] = useState<Pestana>('Resumen');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState(false);

  const ficha = useRecurso<FichaOrden>(() => api.pedir<FichaOrden>(`/ordenes/${id}`), [id]);

  const evidencias = useRecurso<readonly EvidenciaDeOrden[]>(
    () => (pestana === 'Evidencia'
      ? api.pedir<readonly EvidenciaDeOrden[]>(`/ordenes/${id}/evidencias`)
      : Promise.resolve([])),
    [id, pestana],
  );

  const consumos = useRecurso<PaginaDeDatos<ResumenMovimiento>>(
    () => (pestana === 'Repuestos'
      ? api.pedirPagina<ResumenMovimiento>('/movimientos', { idOrden: id, tamano: 50 })
      : Promise.resolve({ datos: [], paginacion: { pagina: 1, tamano: 0, total: 0, totalPaginas: 0 } })),
    [id, pestana],
  );

  const visitas = useRecurso<readonly ResumenVisita[]>(
    () => (pestana === 'Visitas'
      ? api.pedir<readonly ResumenVisita[]>(`/ordenes/${id}/visitas`)
      : Promise.resolve([])),
    [id, pestana],
  );

  if (ficha.cargando) return <Cargando que="la orden" />;
  if (ficha.error !== null) return <Fallo error={ficha.error} alReintentar={ficha.recargar} />;
  if (ficha.datos === null) return <Fallo error={null} alReintentar={ficha.recargar} />;

  const orden = ficha.datos;
  const plazo = plazoEnPalabras(orden.horasParaVencer, orden.vencida);

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
      ficha.recargar();
    } catch (fallo) {
      // El servidor explica por qué no se puede; se muestra tal cual.
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo mover la orden.');
    } finally {
      setMoviendo(false);
    }
  }

  return (
    <>
      <h2 className="scr">Orden {orden.numero}</h2>
      <p className="sub">
        {orden.cliente} · {orden.articulo} · <Garantia tipo={orden.tipoGarantia} /> ·{' '}
        {orden.modalidad === 'ruta' ? `ruta · ${orden.zona ?? 'sin zona'}` : 'taller'}
      </p>

      {/* La cabecera del prototipo: estado, responsable, plazo y costo. */}
      <div className="g g4" style={{ marginBottom: 12 }}>
        <Cifra valor={<EtiquetaEstado estado={orden.estado} />} etiqueta="Estado actual" pequena />
        <Cifra valor={orden.responsableActual ?? 'sin responsable'} etiqueta="Responsable actual" pequena />
        <Cifra
          valor={plazo.texto}
          etiqueta="Plazo comprometido"
          color={plazo.color}
          pequena
        />
        <Cifra
          valor={orden.tipoGarantia === 'particular' ? cordobas(orden.total) : cordobas(0)}
          etiqueta="Costo al cliente"
          pequena
        />
      </div>

      <div className="tabs">
        {PESTANAS.map((nombre) => (
          <span
            key={nombre}
            className={pestana === nombre ? 'on' : ''}
            onClick={() => setPestana(nombre)}
          >
            {nombre}
          </span>
        ))}
      </div>

      {pestana === 'Resumen' ? (
        <>
          <Tarjeta titulo="Falla reportada por el cliente">
            <p style={{ fontSize: 12.5, margin: 0 }}>{orden.fallaReportada}</p>
          </Tarjeta>

          <Tarjeta titulo="Datos congelados al crearse la orden" extra="RN-22 · no cambian nunca">
            <div className="g g3">
              <div><label>Telefono de contacto</label><input value={orden.telefonoContacto} readOnly /></div>
              <div>
                <label>Direccion del servicio</label>
                <input value={orden.direccionServicio ?? 'orden de taller'} readOnly />
              </div>
              <div><label>Cargo por visita</label><input value={cordobas(orden.cargoVisita)} readOnly /></div>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '10px 0 0' }}>
              Cambiar la direccion en la ficha del cliente no altera esta orden: describe como
              eran las cosas cuando se programo el servicio.
            </p>
          </Tarjeta>

          <Tarjeta titulo="Mover la orden">
            {orden.destinosPosibles.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--soft)', margin: 0 }}>
                Esta orden esta en un estado final y no se modifica. Si hay algo que corregir,
                se le adjunta una nota de correccion.
              </p>
            ) : (
              <>
                <label>Motivo u observacion · obligatorio para anular</label>
                <textarea
                  rows={2}
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value)}
                  placeholder="Por que se mueve la orden"
                />
                <div className="tools">
                  {orden.destinosPosibles.map((destino) => (
                    <button
                      key={destino}
                      type="button"
                      className={destino === ESTADO_ORDEN.ANULADA ? 'btn peligro' : 'btn pri'}
                      disabled={moviendo}
                      onClick={() => void mover(destino)}
                    >
                      {destino.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </>
            )}
            {error === null ? null : <Aviso>{error}</Aviso>}
          </Tarjeta>

          {orden.notas.length === 0 ? null : (
            <Tarjeta titulo="Notas de correccion">
              {orden.notas.map((nota) => (
                <div key={nota.id} className="rowcard">
                  <div className="r2">{nota.motivo}</div>
                  <div className="r3">{nota.detalle}</div>
                  <div className="r3">{nota.autor} · {fechaHora(nota.creadoEn)}</div>
                </div>
              ))}
            </Tarjeta>
          )}
        </>
      ) : null}

      {pestana === 'Evidencia' ? (
        <Tarjeta titulo="Evidencia para el expediente de cobro">
          {evidencias.cargando ? <Cargando que="la evidencia" /> : null}
          {evidencias.datos === null || evidencias.datos.length === 0 ? (
            <Vacio>Todavia no se ha cargado evidencia de esta orden.</Vacio>
          ) : (
            evidencias.datos.map((evidencia) => (
              <div key={evidencia.id} className={evidencia.sincronizada ? 'ev done' : 'ev'}>
                <span>{evidencia.sincronizada ? '✓' : '◇'}</span>
                <span>{evidencia.clave.replace(/_/g, ' ')} · {evidencia.tipo}</span>
                <em>{fechaHora(evidencia.momentoDispositivo)}</em>
              </div>
            ))
          )}
          <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '9px 0 0' }}>
            Cada evidencia se guarda con autor, fecha, hora y huella digital. El expediente de
            cobro no podra enviarse mientras falte alguna obligatoria (RF-57).
          </p>
        </Tarjeta>
      ) : null}

      {pestana === 'Repuestos' ? (
        <Tarjeta titulo="Repuestos consumidos en esta orden">
          {consumos.cargando ? <Cargando que="los consumos" /> : null}
          {consumos.datos === null || consumos.datos.datos.length === 0 ? (
            <Vacio>No se ha consumido ningun repuesto en esta orden.</Vacio>
          ) : (
            <table className="d">
              <thead>
                <tr>
                  <th>Fecha</th><th>Repuesto</th><th>Tipo</th>
                  <th>Cantidad</th><th>Precio</th><th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {consumos.datos.datos.map((movimiento) => (
                  <tr key={movimiento.id}>
                    <td className="tenue">{fechaHora(movimiento.creadoEn)}</td>
                    <td>{movimiento.codigo} · {movimiento.descripcion}</td>
                    <td>{movimiento.tipo.replace(/_/g, ' ')}</td>
                    <td>{movimiento.cantidad}</td>
                    <td>{cordobas(movimiento.precioUnitario)}</td>
                    <td className="tenue">
                      {movimiento.responsable}
                      {movimiento.registradoSinConexion ? (
                        <span className="tag t-a" style={{ marginLeft: 6 }}>sin conexion</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '9px 0 0' }}>
            El precio es el <b>congelado del movimiento</b>, no el de hoy: es lo que se le
            reclama al proveedor y lo que la factura respalda.
          </p>
        </Tarjeta>
      ) : null}

      {pestana === 'Visitas' ? (
        <Tarjeta titulo="Visitas programadas y realizadas">
          {visitas.cargando ? <Cargando que="las visitas" /> : null}
          {visitas.datos === null || visitas.datos.length === 0 ? (
            <Vacio>Esta orden no tiene visitas programadas.</Vacio>
          ) : (
            <table className="d">
              <thead>
                <tr><th>Fecha</th><th>Franja</th><th>Tecnico</th><th>Resultado</th><th>Vigente</th></tr>
              </thead>
              <tbody>
                {visitas.datos.map((visita) => (
                  <tr key={visita.id}>
                    <td>{visita.fechaProgramada}</td>
                    <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{visita.franjaHoraria}</td>
                    <td>{visita.tecnico}</td>
                    <td><span className="tag t-b">{visita.resultado.replace(/_/g, ' ')}</span></td>
                    <td>{visita.vigente ? 'si' : <span className="tenue">reprogramada</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
      ) : null}

      {pestana === 'Bitacora' ? (
        <Tarjeta titulo="Bitacora" extra="inmutable · RN-18">
          <table className="d">
            <thead>
              <tr><th>Momento</th><th>Cambio</th><th>Responsable</th><th>Observacion</th></tr>
            </thead>
            <tbody>
              {orden.eventos.map((evento) => (
                <tr key={evento.id}>
                  <td className="tenue">{fechaHora(evento.momento)}</td>
                  <td>
                    {evento.estadoAnterior === null
                      ? 'registrada'
                      : `${evento.estadoAnterior.replace(/_/g, ' ')} → ${evento.estadoNuevo.replace(/_/g, ' ')}`}
                    {evento.registradoSinConexion ? (
                      <span className="tag t-a" style={{ marginLeft: 6 }}>sin conexion</span>
                    ) : null}
                  </td>
                  <td className="tenue">{evento.responsable ?? '—'}</td>
                  <td className="tenue">{evento.observacion ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      ) : null}

      <div className="tools">
        <Link className="btn" to={`/clientes/${orden.idCliente}`}>Ficha del cliente</Link>
        <Link className="btn" to={`/articulos/${orden.idArticulo}`}>Ficha del articulo</Link>
        <Link className="btn" to="/ordenes">Volver</Link>
      </div>
    </>
  );
}
