/**
 * Armazon de la aplicacion del tecnico: la misma web, en un telefono.
 *
 * No hay que instalar nada. El tecnico entra al sistema desde el navegador
 * del celular que ya lleva, o desde la laptop si ese dia anda con ella, y
 * es la misma aplicacion: la misma sesion, el mismo servidor, las mismas
 * reglas. Lo unico que cambia es la forma, porque una mano con guantes
 * sobre una pantalla de cinco pulgadas no es un raton sobre un escritorio.
 *
 * Tres decisiones de forma que no son estetica:
 *
 *  - LO TOCABLE MIDE 46 px. Debajo de eso se falla el toque, y fallar el
 *    toque en la casa de un cliente significa volver a empezar el registro.
 *  - LA BARRA DE SINCRONIZACION ESTA SIEMPRE. No se esconde ni cuando todo
 *    esta enviado: un tecnico que no ve si su trabajo se guardo se lo anota
 *    en papel por si acaso, y ahi el sistema ya perdio.
 *  - LA NAVEGACION VA ABAJO. Arriba no llega el pulgar.
 */
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSesion } from '../sesion/contexto.js';
import { useCampo } from '../campo/contexto.js';

export interface DatosDePantallaDeCampo {
  /** Codigo del prototipo: M-01, M-03… */
  readonly codigo: string;
  readonly miga: string;
}

/**
 * Cuando se bajo la jornada, dicho corto. La fecha completa no le sirve a
 * nadie en la calle; la hora si, porque es la que dice cuanto de lo que ve
 * puede estar viejo.
 */
function horaCorta(iso: string | null): string {
  if (iso === null) return 'nunca';
  return new Date(iso).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
}

/**
 * El estado del envio, dicho en una linea.
 *
 * Se lee de izquierda a derecha como una frase, no como un icono: «Sin
 * señal · 4 sin enviar». El color refuerza, nunca informa solo.
 */
export function BarraDeSincronizacion(): JSX.Element {
  const {
    enLinea, pendientes, descargadaEn, sincronizando, sincronizar, faltaVincularDispositivo,
  } = useCampo();
  const { identificadorDispositivo } = useSesion();
  const atrasado = !enLinea || pendientes > 0;

  const texto = (): string => {
    if (sincronizando) return 'Enviando…';
    if (!enLinea && pendientes > 0) return `Sin señal · ${pendientes} sin enviar`;
    if (!enLinea) return 'Sin señal · todo enviado';
    if (pendientes > 0) return `${pendientes} sin enviar`;
    return `Todo enviado · ruta de las ${horaCorta(descargadaEn)}`;
  };

  return (
    <>
      <div className={atrasado ? 'sync off' : 'sync'}>
        <span>{texto()}</span>
        {enLinea && pendientes > 0 && !sincronizando && !faltaVincularDispositivo
          ? (
            <button
              type="button"
              className="btn chico"
              style={{ minHeight: 0, width: 'auto' }}
              onClick={() => { void sincronizar(); }}
            >
              Enviar ahora
            </button>
          )
          : null}
      </div>

      {/*
        Sin vincular, el trabajo se guarda igual pero NO SUBE. Callarlo
        seria lo peor: el tecnico pasaria el dia creyendo que todo va bien.
        Se le da el codigo en pantalla para que se lo lea a la jefatura.
      */}
      {faltaVincularDispositivo
        ? (
          <div className="alert" style={{ marginBottom: 11 }}>
            <span>
              <b>Este telefono todavia no esta autorizado para enviar.</b> Su trabajo se
              esta guardando aqui y no se pierde, pero no sube hasta que la jefatura
              autorice este navegador. Deles este codigo:
              <br />
              <code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {identificadorDispositivo ?? 'no disponible en este navegador'}
              </code>
            </span>
          </div>
        )
        : null}
    </>
  );
}

const PESTANAS = [
  { ruta: '/campo', icono: '≡', etiqueta: 'Mi ruta', exacta: true },
  { ruta: '/campo/bodega', icono: '⌗', etiqueta: 'Bodega', exacta: false },
  { ruta: '/campo/envios', icono: '↥', etiqueta: 'Envíos', exacta: false },
];

export function ArmazonCampo(
  { pantalla, children }: { pantalla: DatosDePantallaDeCampo; children: ReactNode },
): JSX.Element {
  const { usuario, salir } = useSesion();

  return (
    <div className="app m campo">
      <div className="topbar">
        <span className="t">Servi<span style={{ color: 'var(--amber)' }}>Total</span></span>
        <span style={{ fontSize: 11, color: '#B9C6D2' }}>
          {usuario?.nombres ?? ''}
          {' · '}
          {/* La puerta de vuelta al panel: el tecnico de planta trabaja con
              las dos pantallas y no debe quedarse encerrado en esta. */}
          <Link to="/" style={{ color: '#B9C6D2' }}>panel</Link>
          {' · '}
          <a onClick={salir} style={{ color: '#B9C6D2', cursor: 'pointer' }}>salir</a>
        </span>
      </div>

      <div className="crumb">
        <span className="code">{pantalla.codigo}</span>
        <span>{pantalla.miga}</span>
      </div>

      <div className="body">{children}</div>

      <nav className="tabbar">
        {PESTANAS.map((pestana) => (
          <NavLink
            key={pestana.ruta}
            to={pestana.ruta}
            end={pestana.exacta}
            className={({ isActive }) => (isActive ? 'on' : '')}
          >
            <em aria-hidden="true">{pestana.icono}</em>
            {pestana.etiqueta}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Los seis pasos del prototipo, como barra de avance. */
export function Pasos({ de }: { de: number }): JSX.Element {
  return (
    <div className="steps" role="img" aria-label={`Paso ${de} de 6`}>
      {[1, 2, 3, 4, 5, 6].map((paso) => (
        <i key={paso} className={paso <= de ? 'on' : ''} />
      ))}
    </div>
  );
}
