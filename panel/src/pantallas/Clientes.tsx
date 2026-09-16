/**
 * Clientes, con busqueda incremental (RF-07).
 *
 * La busqueda espera a que la persona deje de teclear. Sin eso, escribir
 * "Maria Gonzalez" dispara catorce consultas y las respuestas llegan
 * desordenadas, de modo que la lista termina mostrando los resultados de
 * "Maria Gonzal". El retardo no es por ahorrar servidor: es para que lo que
 * se ve corresponda a lo que esta escrito.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ResumenCliente } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo, Vacio } from '../componentes/carga.js';
import type { PaginaDeDatos } from '../api/cliente.js';

/** Lo que se espera desde la ultima tecla. */
const RETARDO_MS = 300;

export function Clientes(): JSX.Element {
  const { api } = useSesion();
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');

  useEffect(() => {
    const temporizador = setTimeout(() => setConsulta(texto.trim()), RETARDO_MS);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const { datos, cargando, error, recargar } = useRecurso<PaginaDeDatos<ResumenCliente>>(
    () => api.pedirPagina<ResumenCliente>('/clientes', {
      texto: consulta === '' ? undefined : consulta,
    }),
    [consulta],
  );

  return (
    <>
      <h1>Clientes</h1>
      <p className="subtitulo">
        Busque por nombre, identificacion o telefono. La busqueda ignora acentos y mayusculas.
      </p>

      <div className="filtros">
        <div style={{ minWidth: 320 }}>
          <label htmlFor="texto">Buscar</label>
          <input
            id="texto"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Maria Gonzalez, 001-120380, 8888-7777"
            autoFocus
          />
        </div>
      </div>

      {cargando ? <Cargando que="los clientes" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}

      {datos !== null && error === null ? (
        datos.datos.length === 0 ? (
          <Vacio>
            {consulta === ''
              ? 'Escriba algo para buscar.'
              : `Ningun cliente coincide con "${consulta}".`}
          </Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Identificacion</th>
                <th>Telefono</th>
                <th>Direccion</th>
                <th>Ordenes</th>
              </tr>
            </thead>
            <tbody>
              {datos.datos.map((cliente) => (
                <tr key={cliente.id}>
                  <td>
                    {cliente.nombres} {cliente.apellidos ?? ''}
                    {cliente.idClientePrincipal === null ? null : (
                      <span className="estado estado-alerta" style={{ marginLeft: 8 }}>
                        fusionado
                      </span>
                    )}
                  </td>
                  <td className="tenue">{cliente.identificacion ?? '—'}</td>
                  <td>{cliente.telefonoVigente ?? '—'}</td>
                  <td className="tenue">{cliente.direccionPrincipal ?? '—'}</td>
                  <td>
                    <Link to={`/ordenes?idCliente=${cliente.id}`}>Ver ordenes</Link>
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
