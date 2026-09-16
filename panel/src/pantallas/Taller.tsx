/**
 * W-07 · Cola de taller.
 *
 * Los articulos que estan en el centro esperando que alguien los tome, y la
 * carga que ya lleva cada tecnico de planta. Las dos cosas juntas porque
 * son la misma decision: a quien se le da el siguiente.
 *
 * Sin el numero de carga al lado, la asignacion se hace por costumbre y
 * siempre recae en el mismo.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ESTADO_ORDEN, type CatalogosDeApoyo, type ResumenOrden } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import {
  Aviso, Cargando, Fallo, Garantia, Tarjeta, Vacio, plazoEnPalabras,
} from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

export function Taller(): JSX.Element {
  const { api } = useSesion();
  const [asignando, setAsignando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catalogos = useRecurso<CatalogosDeApoyo>(() => api.pedir<CatalogosDeApoyo>('/catalogos'), []);

  const cola = useRecurso<PaginaDeDatos<ResumenOrden>>(
    () => api.pedirPagina<ResumenOrden>('/ordenes', {
      estado: ESTADO_ORDEN.EN_COLA_TALLER, tamano: 50,
    }),
    [],
  );

  async function asignar(idOrden: string, idTecnico: string): Promise<void> {
    if (idTecnico === '') return;
    setAsignando(idOrden);
    setError(null);
    try {
      await api.pedir(`/ordenes/${idOrden}/tecnico`, {
        metodo: 'PUT', cuerpo: { idTecnico },
      });
      cola.recargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo asignar.');
    } finally {
      setAsignando(null);
    }
  }

  const deplanta = (catalogos.datos?.tecnicos ?? []).filter((uno) => uno.tipo === 'planta');
  const pendientes = cola.datos?.datos ?? [];
  const sinDiagnosticar = pendientes.filter((orden) => orden.vencida).length;

  return (
    <>
      <h2 className="scr">Cola de taller</h2>
      <p className="sub">
        {pendientes.length} articulos esperando asignacion · {deplanta.length} tecnicos de planta
      </p>

      {error === null ? null : <Aviso>{error}</Aviso>}

      {sinDiagnosticar > 0 ? (
        <Aviso>
          <b>{sinDiagnosticar} articulos superaron su plazo sin que nadie los tomara.</b>{' '}
          Corresponde asignacion forzada.
        </Aviso>
      ) : null}

      <Tarjeta titulo="Pendientes de asignacion">
        {cola.cargando ? <Cargando que="la cola" /> : null}
        {cola.error !== null ? <Fallo error={cola.error} alReintentar={cola.recargar} /> : null}
        {pendientes.length === 0 && !cola.cargando ? (
          <Vacio>No hay articulos esperando en la cola del taller.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr>
                <th>N.º</th><th>Cliente</th><th>Articulo</th>
                <th>Garantia</th><th>En cola</th><th>Asignar a</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((orden) => {
                const plazo = plazoEnPalabras(orden.horasParaVencer, orden.vencida);
                return (
                  <tr key={orden.id}>
                    <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                      <Link to={`/ordenes/${orden.id}`}>{orden.numero}</Link>
                    </td>
                    <td>{orden.cliente}</td>
                    <td>{orden.articulo}</td>
                    <td><Garantia tipo={orden.tipoGarantia} /></td>
                    <td style={plazo.color === undefined
                      ? {}
                      : { color: plazo.color, fontWeight: 600 }}
                    >
                      {plazo.texto}
                    </td>
                    <td>
                      <select
                        disabled={asignando === orden.id}
                        defaultValue=""
                        onChange={(evento) => void asignar(orden.id, evento.target.value)}
                      >
                        <option value="">Elegir tecnico…</option>
                        {deplanta.map((tecnico) => (
                          <option key={tecnico.id} value={tecnico.id}>
                            {tecnico.nombre} · {tecnico.cargaActual} abiertas
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Tarjeta>

      <Tarjeta titulo="Carga por tecnico de planta">
        {deplanta.length === 0 ? (
          <Vacio>No hay tecnicos de planta activos.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr><th>Tecnico</th><th>Especialidad</th><th>Ordenes abiertas</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {deplanta
                .slice()
                .sort((uno, otro) => otro.cargaActual - uno.cargaActual)
                .map((tecnico) => (
                  <tr key={tecnico.id}>
                    <td>{tecnico.nombre}</td>
                    <td className="tenue">{tecnico.especialidad}</td>
                    <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{tecnico.cargaActual}</td>
                    <td>
                      {tecnico.disponible
                        ? <span className="tag t-t">Disponible</span>
                        : <span className="tag t-a">No disponible</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Tarjeta>
    </>
  );
}
