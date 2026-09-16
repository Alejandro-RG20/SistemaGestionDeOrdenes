/**
 * Bandeja de ordenes.
 *
 * Los filtros viven en la URL, no en el estado del componente. Quien atiende
 * telefono necesita poder mandarle a la jefatura el enlace de "las vencidas"
 * sin explicar que botones apretar, y volver atras en el navegador tiene que
 * devolver la busqueda anterior y no la lista entera.
 *
 * Los filtros son los que el servidor admite de verdad —numero, estado,
 * tecnico, cliente, activas, vencidas— y ni uno mas. Una caja de busqueda
 * libre que el backend ignora es peor que no tenerla: la gente teclea, no
 * pasa nada, y deja de confiar en la pantalla. Para llegar a una orden por
 * cliente se entra por Clientes, que si tiene busqueda incremental.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { ESTADOS_ORDEN, type ResumenOrden } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo, Vacio } from '../componentes/carga.js';
import type { PaginaDeDatos } from '../api/cliente.js';

function claseDePlazo(orden: ResumenOrden): string {
  if (orden.vencida) return 'estado estado-critico';
  if (orden.enAlerta) return 'estado estado-alerta';
  return 'estado';
}

/** El plazo, dicho en palabras y no solo en color. */
function plazoEnPalabras(orden: ResumenOrden): string {
  if (orden.horasParaVencer === null) return 'sin plazo';
  if (orden.vencida) return `vencida hace ${Math.abs(Math.round(orden.horasParaVencer))} h`;
  return `faltan ${Math.round(orden.horasParaVencer)} h`;
}

export function Ordenes(): JSX.Element {
  const { api } = useSesion();
  const [parametros, setParametros] = useSearchParams();

  const estado = parametros.get('estado') ?? '';
  const numero = parametros.get('numero') ?? '';
  const idCliente = parametros.get('idCliente') ?? '';
  const soloVencidas = parametros.get('soloVencidas') === '1';
  const soloActivas = parametros.get('soloActivas') === '1';
  // RF-60: lo vencido y lo que esta por vencer tiene su propio endpoint.
  const enAlerta = parametros.get('enAlerta') === '1';
  const pagina = Number(parametros.get('pagina') ?? '1');

  const { datos, cargando, error, recargar } = useRecurso<PaginaDeDatos<ResumenOrden>>(
    () => (enAlerta
      ? api.pedirPagina<ResumenOrden>('/ordenes/alertas', { pagina })
      : api.pedirPagina<ResumenOrden>('/ordenes', {
        estado: estado === '' ? undefined : estado,
        numero: numero === '' ? undefined : numero,
        idCliente: idCliente === '' ? undefined : idCliente,
        soloVencidas: soloVencidas ? 'true' : undefined,
        soloActivas: soloActivas ? 'true' : undefined,
        pagina,
      })),
    [estado, numero, idCliente, soloVencidas, soloActivas, enAlerta, pagina],
  );

  function cambiar(clave: string, valor: string): void {
    const siguientes = new URLSearchParams(parametros);
    if (valor === '') siguientes.delete(clave);
    else siguientes.set(clave, valor);
    // Cambiar un filtro y quedarse en la pagina siete no tiene sentido.
    siguientes.delete('pagina');
    setParametros(siguientes);
  }

  return (
    <>
      <h1>{enAlerta ? 'Ordenes vencidas o por vencer' : 'Ordenes de servicio'}</h1>
      <p className="subtitulo">
        {datos === null ? '' : `${datos.paginacion.total} ordenes con estos filtros`}
      </p>

      {enAlerta ? (
        <p>
          <button
            type="button"
            className="boton boton-secundario"
            onClick={() => setParametros(new URLSearchParams())}
          >
            Ver todas las ordenes
          </button>
        </p>
      ) : (
        <div className="filtros">
          <div style={{ minWidth: 150 }}>
            <label htmlFor="numero">Numero de orden</label>
            <input
              id="numero"
              defaultValue={numero}
              inputMode="numeric"
              placeholder="10234"
              onKeyDown={(evento) => {
                if (evento.key === 'Enter') cambiar('numero', evento.currentTarget.value.trim());
              }}
            />
          </div>
          <div>
            <label htmlFor="estado">Estado</label>
            <select id="estado" value={estado} onChange={(e) => cambiar('estado', e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS_ORDEN.map((uno) => (
                <option key={uno} value={uno}>{uno.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="plazo">Plazo</label>
            <select
              id="plazo"
              value={soloVencidas ? '1' : ''}
              onChange={(e) => cambiar('soloVencidas', e.target.value)}
            >
              <option value="">Todas</option>
              <option value="1">Solo vencidas</option>
            </select>
          </div>
          <div>
            <label htmlFor="activas">Vigencia</label>
            <select
              id="activas"
              value={soloActivas ? '1' : ''}
              onChange={(e) => cambiar('soloActivas', e.target.value)}
            >
              <option value="">Todas</option>
              <option value="1">Solo abiertas</option>
            </select>
          </div>
        </div>
      )}

      {cargando ? <Cargando que="las ordenes" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}

      {datos !== null && !cargando && error === null ? (
        datos.datos.length === 0 ? (
          <Vacio>No hay ordenes que cumplan estos filtros.</Vacio>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th className="numero">Orden</th>
                  <th>Cliente</th>
                  <th>Articulo</th>
                  <th>Estado</th>
                  <th>Garantia</th>
                  <th>Tecnico</th>
                  <th>Plazo</th>
                </tr>
              </thead>
              <tbody>
                {datos.datos.map((orden) => (
                  <tr key={orden.id}>
                    <td className="numero">
                      <Link to={`/ordenes/${orden.id}`}>{orden.numero}</Link>
                    </td>
                    <td>{orden.cliente}</td>
                    <td>{orden.articulo}</td>
                    <td><span className="estado">{orden.estado.replace(/_/g, ' ')}</span></td>
                    <td className="tenue">{orden.tipoGarantia.replace(/_/g, ' ')}</td>
                    <td className="tenue">{orden.tecnico ?? '—'}</td>
                    <td>
                      <span className={claseDePlazo(orden)}>{plazoEnPalabras(orden)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="paginacion">
              <button
                type="button"
                className="boton boton-secundario"
                disabled={pagina <= 1}
                onClick={() => cambiar('pagina', String(pagina - 1))}
              >
                Anterior
              </button>
              <span>
                Pagina {datos.paginacion.pagina} de {datos.paginacion.totalPaginas}
              </span>
              <button
                type="button"
                className="boton boton-secundario"
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
