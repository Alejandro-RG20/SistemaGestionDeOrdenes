/**
 * El kardex de un repuesto (pliego §28).
 *
 * Es el libro de una pieza: cada movimiento en orden y el saldo que quedo
 * despues de cada uno. La pantalla de existencias contesta «cuanto hay»;
 * esta contesta «como llegamos a eso», que es la pregunta de quien tiene que
 * explicar un faltante.
 *
 * El saldo lo calcula la base y no esta pantalla. Sumar aqui daria un numero
 * distinto en la pagina dos, donde el navegador no tiene las lineas
 * anteriores.
 */
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { Kardex as LibroKardex, ResumenBodega } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo, Vacio, cordobas, fechaHora } from '../componentes/piezas.js';
import type { PaginaDeDatos } from '../api/cliente.js';

/** Nombre legible del tipo de movimiento. */
const EN_PALABRAS: Record<string, string> = {
  ingreso: 'Ingreso',
  despacho_a_movil: 'Despacho a movil',
  devolucion_a_central: 'Devolucion a central',
  consumo: 'Consumo en orden',
  devolucion_pieza_sustituida: 'Pieza sustituida',
  ajuste: 'Ajuste',
};

export function Kardex(): JSX.Element {
  const { api } = useSesion();
  const { id } = useParams<{ id: string }>();
  const [parametros, setParametros] = useSearchParams();
  const idBodega = parametros.get('idBodega') ?? '';

  const bodegas = useRecurso<PaginaDeDatos<ResumenBodega>>(
    () => api.pedirPagina<ResumenBodega>('/bodegas'), [],
  );

  const libro = useRecurso<LibroKardex>(
    () => api.pedir<LibroKardex>(`/repuestos/${id!}/kardex`, {
      consulta: { idBodega: idBodega === '' ? undefined : idBodega, tamano: 100 },
    }),
    [id, idBodega],
  );

  function cambiarBodega(valor: string): void {
    const siguientes = new URLSearchParams(parametros);
    if (valor === '') siguientes.delete('idBodega'); else siguientes.set('idBodega', valor);
    setParametros(siguientes);
  }

  if (libro.cargando) return <Cargando que="el kardex" />;
  if (libro.error !== null) return <Fallo error={libro.error} alReintentar={libro.recargar} />;
  if (libro.datos === null) return <Vacio>No se pudo cargar el kardex.</Vacio>;

  const k = libro.datos;

  return (
    <>
      <h2 className="scr">Kardex · {k.codigo}</h2>
      <p className="sub">{k.descripcion}</p>

      <div className="filtros">
        <div style={{ minWidth: 260 }}>
          <label htmlFor="bodega-kardex">Bodega</label>
          <select
            id="bodega-kardex"
            value={idBodega}
            onChange={(e) => cambiarBodega(e.target.value)}
          >
            <option value="">Todo el centro</option>
            {(bodegas.datos?.datos ?? []).map((bodega) => (
              <option key={bodega.id} value={bodega.id}>{bodega.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Saldo inicial</label>
          <p className="cifra">{k.saldoInicial}</p>
        </div>
        <div>
          <label>Saldo final</label>
          <p className="cifra">{k.saldoFinal}</p>
        </div>
      </div>

      {idBodega === '' ? (
        <p className="sub">
          Sin bodega el kardex es del centro completo: los traslados internos no mueven el saldo
          porque no mueven nada hacia afuera.
        </p>
      ) : null}

      {k.lineas.length === 0 ? (
        <Vacio>Este repuesto no tiene movimientos con estos filtros.</Vacio>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Movimiento</th><th>Origen</th><th>Destino</th>
              <th className="numero">Entra</th>
              <th className="numero">Sale</th>
              <th className="numero">Saldo</th>
              <th className="numero">Precio</th>
              <th>Orden</th><th>Responsable</th>
            </tr>
          </thead>
          <tbody>
            {k.lineas.map((linea) => (
              <tr key={linea.idMovimiento}>
                <td className="tenue">{fechaHora(linea.momento)}</td>
                <td>{EN_PALABRAS[linea.tipo] ?? linea.tipo}</td>
                <td className="tenue">{linea.bodegaOrigen ?? '—'}</td>
                <td className="tenue">{linea.bodegaDestino ?? '—'}</td>
                <td className="numero">{linea.entrada === 0 ? '' : linea.entrada}</td>
                <td className="numero">{linea.salida === 0 ? '' : linea.salida}</td>
                <td className="numero"><strong>{linea.saldo}</strong></td>
                <td className="numero tenue">{cordobas(linea.precioUnitario)}</td>
                <td className="tenue">{linea.codigoOrden ?? '—'}</td>
                <td className="tenue">{linea.responsable ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {k.lineas.some((linea) => linea.justificacion !== null) ? (
        <>
          <h3>Justificaciones</h3>
          <p className="sub">
            Un ajuste sin motivo escrito no se puede auditar. Aqui estan los que lo llevan.
          </p>
          <ul>
            {k.lineas.filter((linea) => linea.justificacion !== null).map((linea) => (
              <li key={`j-${linea.idMovimiento}`}>
                <strong>{fechaHora(linea.momento)}</strong>
                {' · '}{EN_PALABRAS[linea.tipo] ?? linea.tipo}
                {' · '}{linea.justificacion}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

/**
 * Buscador de repuesto para entrar al kardex.
 *
 * Existe porque el kardex se pide por identificador y nadie se lo sabe de
 * memoria. Es la puerta, no una pantalla aparte.
 */
export function BuscarKardex(): JSX.Element {
  const { api } = useSesion();
  const [texto, setTexto] = useState('');

  const repuestos = useRecurso<PaginaDeDatos<{ id: string; codigo: string; descripcion: string }>>(
    () => api.pedirPagina('/repuestos', { texto: texto === '' ? undefined : texto, tamano: 25 }),
    [texto],
  );

  return (
    <>
      <h2 className="scr">Kardex de repuestos</h2>
      <p className="sub">Elija el repuesto para ver su libro de movimientos.</p>

      <div className="filtros">
        <div style={{ minWidth: 320 }}>
          <label htmlFor="buscar-repuesto">Codigo o descripcion</label>
          <input
            id="buscar-repuesto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="REF-TER-011, termostato…"
          />
        </div>
      </div>

      {repuestos.cargando ? <Cargando que="los repuestos" /> : null}
      {repuestos.error !== null
        ? <Fallo error={repuestos.error} alReintentar={repuestos.recargar} />
        : null}

      {(repuestos.datos?.datos ?? []).length === 0 && !repuestos.cargando ? (
        <Vacio>Ningun repuesto coincide con esa busqueda.</Vacio>
      ) : (
        <table>
          <thead><tr><th>Codigo</th><th>Descripcion</th><th /></tr></thead>
          <tbody>
            {(repuestos.datos?.datos ?? []).map((repuesto) => (
              <tr key={repuesto.id}>
                <td>{repuesto.codigo}</td>
                <td>{repuesto.descripcion}</td>
                <td><a href={`/inventario/kardex/${repuesto.id}`}>Ver kardex</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
