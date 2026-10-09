/**
 * W-04 · Ordenes de servicio.
 *
 * Los filtros viven en la URL: quien atiende telefono manda a la jefatura
 * el enlace de «las vencidas» sin explicar que botones apretar, y volver
 * atras devuelve la busqueda anterior y no la lista entera.
 *
 * Son los filtros que el servidor admite de verdad. El prototipo dibujaba
 * cinco desplegables; dos de ellos —marca y modalidad— el backend no los
 * acepta, y una caja que no filtra nada es peor que no tenerla: la gente
 * la usa, no pasa nada, y deja de confiar en la pantalla.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { ESTADOS_ORDEN, type CatalogosDeApoyo, type ResumenOrden } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import {
  Cargando, EtiquetaEstado, Fallo, Garantia, Tarjeta, Vacio, plazoEnPalabras,
} from '../componentes/piezas.js';
import type { PaginaDeDatos } from '../api/cliente.js';

export function Ordenes(): JSX.Element {
  const { api } = useSesion();
  const [parametros, setParametros] = useSearchParams();

  const estado = parametros.get('estado') ?? '';
  const numero = parametros.get('numero') ?? '';
  const idCliente = parametros.get('idCliente') ?? '';
  const idTecnico = parametros.get('idTecnico') ?? '';
  const idTienda = parametros.get('idTienda') ?? '';
  // Se aceptan «1» y «true»: los enlaces del tablero usan la segunda forma.
  const activo = (clave: string): boolean => ['1', 'true'].includes(parametros.get(clave) ?? '');
  const soloVencidas = activo('soloVencidas');
  const soloActivas = activo('soloActivas');
  // RF-60: lo vencido y lo por vencer tiene su propio endpoint.
  const enAlerta = activo('enAlerta');
  const pagina = Number(parametros.get('pagina') ?? '1');

  const { datos, cargando, error, recargar } = useRecurso<PaginaDeDatos<ResumenOrden>>(
    () => (enAlerta
      ? api.pedirPagina<ResumenOrden>('/ordenes/alertas', { pagina })
      : api.pedirPagina<ResumenOrden>('/ordenes', {
        estado: estado === '' ? undefined : estado,
        numero: numero === '' ? undefined : numero,
        idCliente: idCliente === '' ? undefined : idCliente,
        idTecnico: idTecnico === '' ? undefined : idTecnico,
        idTienda: idTienda === '' ? undefined : idTienda,
        soloVencidas: soloVencidas ? 'true' : undefined,
        soloActivas: soloActivas ? 'true' : undefined,
        pagina,
      })),
    [estado, numero, idCliente, idTecnico, idTienda, soloVencidas, soloActivas, enAlerta, pagina],
  );

  // Tecnicos y tiendas para los filtros. Si no carga, los filtros no se
  // ofrecen: un desplegable vacio que no filtra es peor que no tenerlo.
  const catalogos = useRecurso<CatalogosDeApoyo | null>(
    () => api.pedir<CatalogosDeApoyo>('/catalogos').catch(() => null), [],
  );

  function cambiar(clave: string, valor: string): void {
    const siguientes = new URLSearchParams(parametros);
    if (valor === '') siguientes.delete(clave); else siguientes.set(clave, valor);
    // Cambiar un filtro y quedarse en la página siete no tiene sentido.
    siguientes.delete('pagina');
    setParametros(siguientes);
  }

  return (
    <>
      <h2 className="scr">{enAlerta ? 'Ordenes vencidas o por vencer' : 'Ordenes de servicio'}</h2>
      <p className="sub">
        {datos === null ? '' : `${datos.paginacion.total} ordenes con estos filtros`}
      </p>

      {enAlerta ? (
        <div className="tools" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn"
            onClick={() => setParametros(new URLSearchParams())}
          >
            Ver todas las ordenes
          </button>
        </div>
      ) : (
        <Tarjeta titulo="Filtros">
          <div className="g g4">
            <div>
              <label>N.º de orden</label>
              {/*
                Acepta las dos formas en que la gente nombra una orden: el
                codigo del comprobante o el numero interno. Quien atiende
                teclea lo que el cliente le dicta y no tiene por que saber
                cual de los dos es.
              */}
              <input
                defaultValue={numero}
                placeholder="OS-2026-000123"
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter') cambiar('numero', evento.currentTarget.value.trim());
                }}
              />
            </div>
            <div>
              <label>Estado</label>
              <select value={estado} onChange={(e) => cambiar('estado', e.target.value)}>
                <option value="">Todos</option>
                {ESTADOS_ORDEN.map((uno) => (
                  <option key={uno} value={uno}>{uno.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Plazo</label>
              <select
                value={soloVencidas ? '1' : ''}
                onChange={(e) => cambiar('soloVencidas', e.target.value)}
              >
                <option value="">Todas</option>
                <option value="1">Solo vencidas</option>
              </select>
            </div>
            <div>
              <label>Vigencia</label>
              <select
                value={soloActivas ? '1' : ''}
                onChange={(e) => cambiar('soloActivas', e.target.value)}
              >
                <option value="">Todas</option>
                <option value="1">Solo abiertas</option>
              </select>
            </div>
          </div>
          {catalogos.datos === null ? null : (
            <div className="g g4" style={{ marginTop: 8 }}>
              <div>
                <label>Tecnico</label>
                <select value={idTecnico} onChange={(e) => cambiar('idTecnico', e.target.value)}>
                  <option value="">Todos</option>
                  {catalogos.datos.tecnicos.map((uno) => (
                    <option key={uno.id} value={uno.id}>{uno.nombre} · {uno.tipo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Tienda de procedencia</label>
                <select value={idTienda} onChange={(e) => cambiar('idTienda', e.target.value)}>
                  <option value="">Todas</option>
                  {catalogos.datos.tiendas.map((una) => (
                    <option key={una.id} value={una.id}>{una.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </Tarjeta>
      )}

      {cargando ? <Cargando que="las ordenes" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}

      {datos !== null && !cargando && error === null ? (
        datos.datos.length === 0 ? (
          <Vacio>No hay ordenes que cumplan estos filtros.</Vacio>
        ) : (
          <Tarjeta>
            <table className="d">
              <thead>
                <tr>
                  <th>N.º</th><th>Cliente</th><th>Articulo</th><th>Garantia</th>
                  <th>Modalidad</th><th>Tecnico</th><th>Estado</th><th>Plazo</th>
                </tr>
              </thead>
              <tbody>
                {datos.datos.map((orden) => {
                  const plazo = plazoEnPalabras(orden.horasParaVencer, orden.vencida);
                  return (
                    <tr key={orden.id}>
                      <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                        <Link to={`/ordenes/${orden.id}`}>{orden.codigo}</Link>
                      </td>
                      <td>{orden.cliente}</td>
                      <td>{orden.articulo}</td>
                      <td><Garantia tipo={orden.tipoGarantia} /></td>
                      <td>{orden.modalidad}</td>
                      <td className="tenue">{orden.tecnico ?? 'sin asignar'}</td>
                      <td><EtiquetaEstado estado={orden.estado} /></td>
                      <td style={plazo.color === undefined
                        ? {}
                        : { color: plazo.color, fontWeight: 600 }}
                      >
                        {plazo.texto}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="paginacion">
              <button
                type="button" className="btn chico" disabled={pagina <= 1}
                onClick={() => cambiar('pagina', String(pagina - 1))}
              >
                Anterior
              </button>
              <span>Pagina {datos.paginacion.pagina} de {datos.paginacion.totalPaginas}</span>
              <button
                type="button" className="btn chico"
                disabled={pagina >= datos.paginacion.totalPaginas}
                onClick={() => cambiar('pagina', String(pagina + 1))}
              >
                Siguiente
              </button>
            </div>
          </Tarjeta>
        )
      ) : null}

      <div className="tools">
        <Link className="btn pri" to="/ordenes/nueva">Nueva orden</Link>
      </div>
    </>
  );
}
