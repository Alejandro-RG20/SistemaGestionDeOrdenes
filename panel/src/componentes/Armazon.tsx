/**
 * Armazon del panel: la barra lateral oscura del prototipo, la miga de pan
 * con el codigo de pantalla, y el contenido.
 *
 * El contador de excepciones vive en el menu porque el sistema NO empuja
 * avisos —esa fue la decision del negocio— y alguien que esta trabajando en
 * otra pantalla no tiene otra forma de enterarse de que llego trabajo de
 * campo sin conciliar. Se refresca cada tres minutos: un aviso que llega
 * cuatro minutos tarde no cambia nada, y una conexion abierta todo el dia
 * por cada puesto del centro, si.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { BandejaDeAvisos } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { rolLegible, seccionesDe } from '../sesion/navegacion.js';

const REFRESCO_MS = 3 * 60_000;

const TITULO_DE_GRUPO: Record<string, string> = {
  operacion: 'OPERACION',
  control: 'CONTROL',
};

export interface DatosDePantalla {
  /** Codigo del prototipo: W-02, W-03… Se muestra en la miga de pan. */
  readonly codigo: string;
  readonly miga: string;
}

export function Armazon(
  { pantalla, children }: { pantalla: DatosDePantalla; children: ReactNode },
): JSX.Element {
  const { usuario, salir, api } = useSesion();
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    let vigente = true;
    const consultar = (): void => {
      api.pedir<BandejaDeAvisos>('/avisos')
        .then((bandeja) => {
          if (!vigente) return;
          const excepciones = bandeja.grupos.find(
            (grupo) => grupo.tipo === 'excepcion_sincronizacion',
          );
          setPendientes(excepciones?.total ?? 0);
        })
        // Un fallo al contar no puede romper el panel entero.
        .catch(() => undefined);
    };
    consultar();
    const temporizador = setInterval(consultar, REFRESCO_MS);
    return () => { vigente = false; clearInterval(temporizador); };
  }, [api]);

  const secciones = seccionesDe(usuario);
  let grupoDibujado = '';

  return (
    <div className="app">
      <nav className="side">
        <div className="who">
          <b>{usuario?.nombres ?? ''}</b>
          <span>{rolLegible(usuario)}</span>
        </div>

        {secciones.map((seccion) => {
          const encabezado = seccion.grupo !== grupoDibujado && seccion.grupo !== 'inicio'
            ? TITULO_DE_GRUPO[seccion.grupo]
            : null;
          grupoDibujado = seccion.grupo;
          return (
            <div key={seccion.ruta}>
              {encabezado === undefined || encabezado === null
                ? null
                : <div className="sep">{encabezado}</div>}
              <NavLink
                to={seccion.ruta}
                end={seccion.ruta === '/'}
                className={({ isActive }) => (isActive ? 'on' : '')}
              >
                {seccion.etiqueta}
                {seccion.ruta === '/excepciones' && pendientes > 0
                  ? <span className="bdg">{pendientes}</span>
                  : null}
              </NavLink>
            </div>
          );
        })}

        <div className="sep">SESION</div>
        <a onClick={salir} style={{ cursor: 'pointer' }}>Cerrar sesion</a>
      </nav>

      <div className="main">
        <div className="crumb">
          <span className="code">{pantalla.codigo}</span>
          <span>{pantalla.miga}</span>
        </div>
        <div className="body">{children}</div>
      </div>
    </div>
  );
}
