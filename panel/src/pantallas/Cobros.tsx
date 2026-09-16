/**
 * Expedientes de cobro.
 *
 * El trabajo real de esta pantalla es el bloqueo por evidencia (RF-57):
 * cuando un expediente no puede salir, la lista tiene que decir QUE falta,
 * no solo que esta bloqueado. Sin eso, el gestor abre uno por uno para
 * enterarse, y con setecientos bloqueados no lo hace.
 */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ESTADO_EXPEDIENTE, type FichaExpediente, type ResumenExpediente,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo, Vacio } from '../componentes/carga.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

function claseDeEstado(estado: string): string {
  if (estado === ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA
    || estado === ESTADO_EXPEDIENTE.RECHAZADO) return 'estado estado-critico';
  if (estado === ESTADO_EXPEDIENTE.PAGADO) return 'estado estado-exito';
  if (estado === ESTADO_EXPEDIENTE.ENVIADO) return 'estado estado-alerta';
  return 'estado';
}

export function Cobros(): JSX.Element {
  const { api } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const estado = parametros.get('estado') ?? '';
  const pagina = Number(parametros.get('pagina') ?? '1');

  const { datos, cargando, error, recargar } = useRecurso<PaginaDeDatos<ResumenExpediente>>(
    () => api.pedirPagina<ResumenExpediente>('/expedientes', {
      estado: estado === '' ? undefined : estado,
      pagina,
    }),
    [estado, pagina],
  );

  function cambiar(clave: string, valor: string): void {
    const siguientes = new URLSearchParams(parametros);
    if (valor === '') siguientes.delete(clave); else siguientes.set(clave, valor);
    siguientes.delete('pagina');
    setParametros(siguientes);
  }

  return (
    <>
      <h1>Expedientes de cobro</h1>
      <p className="subtitulo">
        Lo que el taller le reclama a las marcas y a las aseguradoras.
      </p>

      <div className="filtros">
        <div>
          <label htmlFor="estado">Estado</label>
          <select id="estado" value={estado} onChange={(e) => cambiar('estado', e.target.value)}>
            <option value="">Todos</option>
            {Object.values(ESTADO_EXPEDIENTE).map((uno) => (
              <option key={uno} value={uno}>{uno.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {cargando ? <Cargando que="los expedientes" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}

      {datos !== null && error === null ? (
        datos.datos.length === 0 ? (
          <Vacio>No hay expedientes con ese estado.</Vacio>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th className="numero">Orden</th>
                  <th>Destinatario</th>
                  <th>Cliente</th>
                  <th className="numero">Reclamado</th>
                  <th className="numero">Cobrado</th>
                  <th>Estado</th>
                  <th>Espera</th>
                </tr>
              </thead>
              <tbody>
                {datos.datos.map((expediente) => (
                  <tr key={expediente.id}>
                    <td className="numero">
                      <Link to={`/cobros/${expediente.id}`}>{expediente.numeroOrden}</Link>
                    </td>
                    <td>{expediente.marca ?? 'Poliza extendida'}</td>
                    <td className="tenue">{expediente.cliente}</td>
                    <td className="numero">C$ {expediente.montoReclamado.toFixed(2)}</td>
                    <td className="numero">
                      {expediente.montoCobrado === null
                        ? '—'
                        : `C$ ${expediente.montoCobrado.toFixed(2)}`}
                    </td>
                    <td>
                      <span className={claseDeEstado(expediente.estado)}>
                        {expediente.estado.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="tenue">
                      {expediente.diasSinRespuesta === null
                        ? '—'
                        : `${expediente.diasSinRespuesta} dias`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="paginacion">
              <button
                type="button" className="boton boton-secundario" disabled={pagina <= 1}
                onClick={() => cambiar('pagina', String(pagina - 1))}
              >
                Anterior
              </button>
              <span>Pagina {datos.paginacion.pagina} de {datos.paginacion.totalPaginas}</span>
              <button
                type="button" className="boton boton-secundario"
                disabled={pagina >= datos.paginacion.totalPaginas}
                onClick={() => cambiar('pagina', String(pagina + 1))}
              >
                Siguiente
              </button>
            </div>
          </>
        )
      ) : null}
    </>
  );
}

/** Ficha del expediente: el desglose, lo que falta, y a donde puede ir. */
export function DetalleExpediente(): JSX.Element {
  const { api } = useSesion();
  const { id = '' } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [montoCobrado, setMontoCobrado] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const { datos, cargando, error: fallo, recargar } = useRecurso<FichaExpediente>(
    () => api.pedir<FichaExpediente>(`/expedientes/${id}`), [id],
  );

  if (cargando) return <Cargando que="el expediente" />;
  if (fallo !== null) return <Fallo error={fallo} alReintentar={recargar} />;
  if (datos === null) return <Fallo error={null} alReintentar={recargar} />;

  const expediente = datos;

  async function mover(hacia: string): Promise<void> {
    setTrabajando(true);
    setError(null);
    try {
      await api.pedir(`/expedientes/${expediente.id}/estado`, {
        metodo: 'POST',
        cuerpo: {
          hacia,
          ...(motivoRechazo.trim() === '' ? {} : { motivoRechazo: motivoRechazo.trim() }),
          ...(montoCobrado.trim() === '' ? {} : { montoCobrado: Number(montoCobrado) }),
        },
      });
      setMotivoRechazo('');
      setMontoCobrado('');
      recargar();
    } catch (problema) {
      setError(problema instanceof ErrorDeApi ? problema.message : 'No se pudo mover.');
    } finally {
      setTrabajando(false);
    }
  }

  async function verificar(): Promise<void> {
    setTrabajando(true);
    setError(null);
    try {
      await api.pedir(`/expedientes/${expediente.id}/verificar`, { metodo: 'POST' });
      recargar();
    } catch (problema) {
      setError(problema instanceof ErrorDeApi ? problema.message : 'No se pudo verificar.');
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <>
      <p><Link to="/cobros">‹ Expedientes</Link></p>
      <h1>Orden {expediente.numeroOrden}</h1>
      <p className="subtitulo">
        <span className={claseDeEstado(expediente.estado)}>
          {expediente.estado.replace(/_/g, ' ')}
        </span>{' '}
        {expediente.marca ?? 'Poliza extendida'} · {expediente.cliente}
      </p>

      {expediente.evidenciaPendiente.length > 0 ? (
        <div className="aviso aviso-error">
          <p><strong>Este expediente no puede salir.</strong> Falta evidencia obligatoria:</p>
          <ul style={{ margin: '4px 0 0 18px' }}>
            {expediente.evidenciaPendiente.map((pendiente) => (
              <li key={`${pendiente.clave}-${pendiente.momento}`}>
                {pendiente.etiqueta} <span className="tenue">({pendiente.momento})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {expediente.desglose.advertencias.map((advertencia) => (
        <div key={advertencia} className="aviso aviso-alerta"><p>{advertencia}</p></div>
      ))}

      <div className="rejilla">
        <div className="tarjeta">
          <p className="etiqueta-cifra">Reclamado</p>
          <p className="cifra">C$ {expediente.montoReclamado.toFixed(2)}</p>
        </div>
        <div className="tarjeta">
          <p className="etiqueta-cifra">Cobrado</p>
          <p className={expediente.montoCobrado === null ? 'cifra tenue' : 'cifra cifra-buena'}>
            {expediente.montoCobrado === null ? '—' : `C$ ${expediente.montoCobrado.toFixed(2)}`}
          </p>
        </div>
      </div>

      <h2>Desglose</h2>
      <table>
        <tbody>
          <tr>
            <td>Repuestos consumidos</td>
            <td className="numero">C$ {expediente.desglose.totalRepuestos.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Mano de obra</td>
            <td className="numero">C$ {expediente.desglose.manoObra.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Cargo de visita</td>
            <td className="numero">C$ {expediente.desglose.cargoVisita.toFixed(2)}</td>
          </tr>
          <tr>
            <td><strong>Total</strong></td>
            <td className="numero"><strong>C$ {expediente.desglose.total.toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>

      {expediente.renglones.length === 0 ? null : (
        <>
          <h2>Repuestos</h2>
          <table>
            <thead>
              <tr>
                <th>Codigo</th><th>Descripcion</th>
                <th className="numero">Cantidad</th>
                <th className="numero">Precio</th>
                <th className="numero">Importe</th>
              </tr>
            </thead>
            <tbody>
              {expediente.renglones.map((renglon) => (
                <tr key={renglon.idRepuesto}>
                  <td>{renglon.codigo}</td>
                  <td>{renglon.descripcion}</td>
                  <td className="numero">{renglon.cantidad}</td>
                  <td className="numero">C$ {renglon.precioUnitario.toFixed(2)}</td>
                  <td className="numero">C$ {renglon.importe.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tenue" style={{ fontSize: 13 }}>
            Al precio congelado del movimiento, no al de hoy: es lo que la factura respalda.
          </p>
        </>
      )}

      <h2>Acciones</h2>
      {expediente.estado === ESTADO_EXPEDIENTE.ENVIADO ? (
        <>
          <label htmlFor="motivo">Motivo del rechazo (si lo rechazaron)</label>
          <textarea
            id="motivo"
            value={motivoRechazo}
            onChange={(evento) => setMotivoRechazo(evento.target.value)}
            placeholder="La factura de compra no es legible en el escaneo."
          />
        </>
      ) : null}
      {expediente.estado === ESTADO_EXPEDIENTE.ACEPTADO ? (
        <>
          <label htmlFor="cobrado">Cuanto pagaron</label>
          <input
            id="cobrado"
            inputMode="decimal"
            value={montoCobrado}
            onChange={(evento) => setMontoCobrado(evento.target.value)}
            placeholder="0.00"
          />
        </>
      ) : null}

      <div className="acciones">
        <button
          type="button" className="boton boton-secundario" disabled={trabajando}
          onClick={() => void verificar()}
        >
          Recalcular contra los datos de hoy
        </button>
        {expediente.estadosPosibles.map((destino) => (
          <button
            key={destino} type="button" className="boton" disabled={trabajando}
            onClick={() => void mover(destino)}
          >
            {destino.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {error === null ? null : <div className="aviso aviso-error"><p>{error}</p></div>}
    </>
  );
}
