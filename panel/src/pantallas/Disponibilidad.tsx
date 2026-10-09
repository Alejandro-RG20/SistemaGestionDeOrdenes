/**
 * W-30 · Disponibilidad de repuestos.
 *
 * Contesta lo que bodega necesita saber antes de aprobar una solicitud:
 * cuanto hay, cuanto ya esta prometido y cuanto se puede prometer todavia.
 *
 *   En bodega      lo que hay fisicamente en las bodegas que surten.
 *   Con tecnicos   lo que ya se entrego y esta en bodegas personales.
 *   Reservado      solicitudes aprobadas o preparadas, aun en bodega.
 *   Pedido         solicitudes sin revisar: demanda que viene.
 *   Disponible     en bodega menos reservado. Es lo unico que se aprueba.
 */
import { Link, useSearchParams } from 'react-router-dom';
import type { DisponibilidadRepuesto } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo, Tarjeta, Vacio } from '../componentes/piezas.js';
import type { PaginaDeDatos } from '../api/cliente.js';

export function Disponibilidad(): JSX.Element {
  const { api } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const texto = parametros.get('texto') ?? '';
  const soloConMovimiento = parametros.get('soloConMovimiento') === '1';
  const soloBajoMinimo = parametros.get('soloBajoMinimo') === '1';
  const pagina = Number(parametros.get('pagina') ?? '1');

  const { datos, cargando, error, recargar } = useRecurso<PaginaDeDatos<DisponibilidadRepuesto>>(
    () => api.pedirPagina<DisponibilidadRepuesto>('/disponibilidad', {
      texto: texto === '' ? undefined : texto,
      soloConMovimiento: soloConMovimiento ? 'true' : undefined,
      soloBajoMinimo: soloBajoMinimo ? 'true' : undefined,
      pagina,
      tamano: 50,
    }),
    [texto, soloConMovimiento, soloBajoMinimo, pagina],
  );

  function cambiar(clave: string, valor: string): void {
    const siguientes = new URLSearchParams(parametros);
    if (valor === '') siguientes.delete(clave); else siguientes.set(clave, valor);
    siguientes.delete('pagina');
    setParametros(siguientes);
  }

  return (
    <>
      <h2 className="scr">Disponibilidad de repuestos</h2>
      <p className="sub">
        Disponible = en bodega menos reservado. Bodega solo puede aprobar una solicitud si hay
        disponible suficiente; si no, la solicitud queda pendiente con su historial.
      </p>

      <Tarjeta titulo="Filtros">
        <div className="g g3">
          <div>
            <label htmlFor="texto-disp">Codigo o nombre</label>
            <input
              id="texto-disp" defaultValue={texto} placeholder="Escriba y presione Enter"
              onKeyDown={(e) => { if (e.key === 'Enter') cambiar('texto', e.currentTarget.value.trim()); }}
            />
          </div>
          <div>
            <label htmlFor="mov-disp">Mostrar</label>
            <select id="mov-disp" value={soloConMovimiento ? '1' : ''}
              onChange={(e) => cambiar('soloConMovimiento', e.target.value)}>
              <option value="">Todos los repuestos</option>
              <option value="1">Solo con reservas o pedidos</option>
            </select>
          </div>
          <div>
            <label htmlFor="min-disp">Minimo</label>
            <select id="min-disp" value={soloBajoMinimo ? '1' : ''}
              onChange={(e) => cambiar('soloBajoMinimo', e.target.value)}>
              <option value="">Todos</option>
              <option value="1">Disponible en o bajo el minimo</option>
            </select>
          </div>
        </div>
      </Tarjeta>

      {cargando ? <Cargando que="la disponibilidad" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}
      {datos !== null && !cargando && error === null ? (
        datos.datos.length === 0 ? <Vacio>No hay repuestos con estos filtros.</Vacio> : (
          <Tarjeta>
            <table className="d">
              <thead>
                <tr>
                  <th>Repuesto</th><th className="numero">En bodega</th>
                  <th className="numero">Con tecnicos</th><th className="numero">Reservado</th>
                  <th className="numero">Pedido</th><th className="numero">Disponible</th>
                  <th className="numero">Minimo</th>
                </tr>
              </thead>
              <tbody>
                {datos.datos.map((fila) => (
                  <tr key={fila.idRepuesto}>
                    <td>
                      <Link to={`/inventario/kardex/${fila.idRepuesto}`}>{fila.codigo}</Link>
                      {' '}<span className="tenue">{fila.descripcion}</span>
                    </td>
                    <td className="numero">{fila.existenciaBodegas}</td>
                    <td className="numero">{fila.enTecnicos}</td>
                    <td className="numero">{fila.reservado}</td>
                    <td className="numero">{fila.comprometido}</td>
                    <td className="numero">
                      <span className={fila.bajoMinimo ? 'estado estado-alerta' : 'estado'}>
                        {fila.disponible}{fila.bajoMinimo ? ' · bajo minimo' : ''}
                      </span>
                    </td>
                    <td className="numero tenue">{fila.stockMinimo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="paginacion">
              <button type="button" className="btn chico" disabled={pagina <= 1}
                onClick={() => cambiar('pagina', String(pagina - 1))}>Anterior</button>
              <span>Pagina {datos.paginacion.pagina} de {datos.paginacion.totalPaginas}</span>
              <button type="button" className="btn chico" disabled={pagina >= datos.paginacion.totalPaginas}
                onClick={() => cambiar('pagina', String(pagina + 1))}>Siguiente</button>
            </div>
          </Tarjeta>
        )
      ) : null}
    </>
  );
}
