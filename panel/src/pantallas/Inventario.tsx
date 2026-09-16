/**
 * Inventario: existencias, lo que esta bajo minimo y lo que se espera.
 *
 * La pantalla arranca en "bajo minimo" cuando se llega desde la bandeja,
 * porque esa es la pregunta que trajo a la persona hasta aqui. Abrir en el
 * catalogo completo la obligaria a filtrar otra vez lo que el aviso ya
 * habia filtrado.
 */
import { useSearchParams } from 'react-router-dom';
import type {
  ExistenciaEnBodega, ResumenBodega, ResumenSolicitudRepuesto,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo, Vacio } from '../componentes/carga.js';
import type { PaginaDeDatos } from '../api/cliente.js';

export function Inventario(): JSX.Element {
  const { api } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const idBodega = parametros.get('idBodega') ?? '';
  const bajoMinimo = parametros.get('bajoMinimo') === '1';

  const bodegas = useRecurso<PaginaDeDatos<ResumenBodega>>(
    () => api.pedirPagina<ResumenBodega>('/bodegas'), [],
  );

  const existencias = useRecurso<PaginaDeDatos<ExistenciaEnBodega>>(
    () => api.pedirPagina<ExistenciaEnBodega>('/existencias', {
      idBodega: idBodega === '' ? undefined : idBodega,
      soloBajoMinimo: bajoMinimo ? 'true' : undefined,
    }),
    [idBodega, bajoMinimo],
  );

  function cambiar(clave: string, valor: string): void {
    const siguientes = new URLSearchParams(parametros);
    if (valor === '') siguientes.delete(clave); else siguientes.set(clave, valor);
    setParametros(siguientes);
  }

  return (
    <>
      <h1>Inventario</h1>
      <p className="subtitulo">
        Los movimientos son la fuente de verdad; estas existencias son su proyeccion.
      </p>

      <div className="filtros">
        <div style={{ minWidth: 240 }}>
          <label htmlFor="bodega">Bodega</label>
          <select id="bodega" value={idBodega} onChange={(e) => cambiar('idBodega', e.target.value)}>
            <option value="">Todas</option>
            {(bodegas.datos?.datos ?? []).map((bodega) => (
              <option key={bodega.id} value={bodega.id}>
                {bodega.nombre} ({bodega.tipo})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="minimo">Existencia</label>
          <select
            id="minimo"
            value={bajoMinimo ? '1' : ''}
            onChange={(e) => cambiar('bajoMinimo', e.target.value)}
          >
            <option value="">Todas</option>
            <option value="1">Solo bajo minimo</option>
          </select>
        </div>
      </div>

      {existencias.cargando ? <Cargando que="las existencias" /> : null}
      {existencias.error !== null
        ? <Fallo error={existencias.error} alReintentar={existencias.recargar} />
        : null}

      {existencias.datos !== null && existencias.error === null ? (
        existencias.datos.datos.length === 0 ? (
          <Vacio>No hay existencias que cumplan estos filtros.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Codigo</th><th>Descripcion</th><th>Bodega</th>
                <th className="numero">Cantidad</th>
                <th className="numero">Minimo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {existencias.datos.datos.map((fila) => (
                <tr key={`${fila.idBodega}-${fila.idRepuesto}`}>
                  <td>{fila.codigo}</td>
                  <td>{fila.descripcion}</td>
                  <td className="tenue">{fila.bodega}</td>
                  <td className="numero">{fila.cantidad}</td>
                  <td className="numero tenue">{fila.stockMinimo}</td>
                  <td>
                    {/* Nunca solo por color: siempre lleva texto. */}
                    <span className={fila.bajoMinimo ? 'estado estado-alerta' : 'estado estado-exito'}>
                      {fila.bajoMinimo ? 'reponer' : 'suficiente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </>
  );
}

/** Repuestos pedidos que no han entrado. Cada uno detiene una orden. */
export function SolicitudesDeRepuesto(): JSX.Element {
  const { api } = useSesion();
  const { datos, cargando, error, recargar } = useRecurso<PaginaDeDatos<ResumenSolicitudRepuesto>>(
    () => api.pedirPagina<ResumenSolicitudRepuesto>('/solicitudes-repuesto', { soloPendientes: 'true' }),
    [],
  );

  if (cargando) return <Cargando que="las solicitudes" />;
  if (error !== null) return <Fallo error={error} alReintentar={recargar} />;

  return (
    <>
      <h1>Repuestos pedidos</h1>
      <p className="subtitulo">
        Cuando uno entra, las ordenes que lo esperaban se liberan solas por orden de llegada.
      </p>

      {datos === null || datos.datos.length === 0 ? (
        <Vacio>No hay repuestos pendientes de ingreso.</Vacio>
      ) : (
        <table>
          <thead>
            <tr>
              <th className="numero">Orden</th><th>Codigo</th><th>Descripcion</th>
              <th className="numero">Cantidad</th><th>Via</th>
              <th>Pedido</th><th>Estimado</th>
            </tr>
          </thead>
          <tbody>
            {datos.datos.map((solicitud) => (
              <tr key={solicitud.id}>
                <td className="numero">{solicitud.numeroOrden}</td>
                <td>{solicitud.codigo}</td>
                <td>{solicitud.descripcion}</td>
                <td className="numero">{solicitud.cantidad}</td>
                <td className="tenue">{solicitud.via.replace(/_/g, ' ')}</td>
                <td className="tenue">{solicitud.fechaSolicitud}</td>
                <td className="tenue">{solicitud.fechaEstimada ?? 'sin fecha'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
