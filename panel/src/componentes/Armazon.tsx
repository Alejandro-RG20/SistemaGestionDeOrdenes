/**
 * Armazon del panel: menu lateral y contenido.
 *
 * El menu lleva la cuenta de avisos criticos porque la bandeja es el unico
 * canal del sistema: si alguien esta trabajando en otra pantalla y aparece
 * algo urgente, el numero en el menu es lo unico que se lo va a decir. Se
 * refresca cada pocos minutos, no en tiempo real: un aviso que llega cuatro
 * minutos tarde no cambia nada, y una conexion abierta todo el dia por cada
 * puesto del centro, si.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { BandejaDeAvisos } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { seccionesDe } from '../sesion/navegacion.js';

/** Cada cuanto se vuelve a mirar si hay avisos nuevos. */
const REFRESCO_MS = 3 * 60_000;

export function Armazon({ children }: { children: ReactNode }): JSX.Element {
  const { usuario, salir, api } = useSesion();
  const [criticos, setCriticos] = useState(0);

  useEffect(() => {
    let vigente = true;
    const consultar = (): void => {
      api.pedir<BandejaDeAvisos>('/avisos')
        .then((bandeja) => { if (vigente) setCriticos(bandeja.criticos); })
        // Un fallo al contar avisos no puede romper el panel entero: la
        // pantalla de la bandeja ya muestra el error como corresponde.
        .catch(() => undefined);
    };
    consultar();
    const temporizador = setInterval(consultar, REFRESCO_MS);
    return () => { vigente = false; clearInterval(temporizador); };
  }, [api]);

  return (
    <div className="armazon">
      <nav className="barra-lateral">
        <div className="marca">
          ServiTotal
          <small>Distrito VI · Managua</small>
        </div>

        <div className="menu">
          {seccionesDe(usuario).map((seccion) => (
            <NavLink
              key={seccion.ruta}
              to={seccion.ruta}
              end={seccion.ruta === '/'}
              className={({ isActive }) => (isActive ? 'activo' : '')}
            >
              {seccion.etiqueta}
              {seccion.ruta === '/' && criticos > 0 ? (
                <span className="insignia">{criticos}</span>
              ) : null}
            </NavLink>
          ))}
        </div>

        <div className="pie-lateral">
          <strong>{usuario?.nombres ?? ''}</strong>
          {usuario?.rol.replace(/_/g, ' ') ?? ''}
          <button
            type="button"
            className="boton boton-secundario"
            style={{ marginTop: 10, width: '100%' }}
            onClick={salir}
          >
            Salir
          </button>
        </div>
      </nav>

      <main className="contenido">{children}</main>
    </div>
  );
}
