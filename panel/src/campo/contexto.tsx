/**
 * Contexto del trabajo de campo.
 *
 * Abre la base local una sola vez y la comparte con todas las pantallas del
 * tecnico. Ademas mantiene a la vista lo que queda sin subir, porque **ese
 * numero es lo que sostiene la confianza en el sistema**: un tecnico que no
 * sabe si su trabajo se guardo vuelve al papel como respaldo, y ahi el
 * proyecto fracasa aunque el sistema funcione.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useSesion } from '../sesion/contexto.js';
import { armarCampo, type CampoArmado } from './armado.js';
import type { ResumenDeSincronizacion } from './motor.js';

export interface EstadoDeCampo {
  readonly campo: CampoArmado | null;
  readonly listo: boolean;
  readonly enLinea: boolean;
  readonly pendientes: number;
  readonly descargadaEn: string | null;
  readonly sincronizando: boolean;
  /**
   * El servidor rechaza la cola porque este navegador no esta vinculado
   * como dispositivo. No se arregla con paciencia: hay que avisar a la
   * jefatura, y por eso se distingue de quedarse sin señal.
   */
  readonly faltaVincularDispositivo: boolean;
  readonly refrescar: () => Promise<void>;
  readonly sincronizar: () => Promise<ResumenDeSincronizacion | null>;
  readonly descargarJornada: () => Promise<void>;
}

const Contexto = createContext<EstadoDeCampo | null>(null);

/** Lo que se sabe al decidir si conviene intentar el envio solo. */
export interface SituacionDeEnvio {
  readonly enLinea: boolean;
  readonly listo: boolean;
  readonly pendientes: number;
  readonly sincronizando: boolean;
  readonly faltaVincularDispositivo: boolean;
}

/**
 * Si conviene vaciar la cola sin que el tecnico pulse nada.
 *
 * Esta fuera del efecto para poder probarla. No es ceremonia: el caso que
 * fallaba en produccion es dificil de ver leyendo y trivial de escribir como
 * prueba —al abrir la aplicacion con señal, `pendientes` vale 0 hasta que se
 * lee la cola, y una version anterior se iba en ese primer instante y ya no
 * volvia—, con lo que el trabajo del dia se quedaba en el telefono hasta que
 * alguien se acordara de pulsar «Enviar ahora». Es exactamente el fallo que
 * hace que un tecnico deje de confiar en el sistema.
 */
export function convieneSincronizar(situacion: SituacionDeEnvio): boolean {
  if (!situacion.enLinea) return false;
  if (!situacion.listo) return false;
  if (situacion.pendientes === 0) return false;
  // Ya hay un envio en marcha: arrancar otro solo duplicaria peticiones.
  if (situacion.sincronizando) return false;
  // Sin vincular, el servidor va a decir que no hasta que la jefatura actue;
  // reintentar solo gasta bateria.
  if (situacion.faltaVincularDispositivo) return false;
  return true;
}

export function ProveedorDeCampo({ children }: { children: ReactNode }): JSX.Element {
  const { api } = useSesion();
  const [campo, setCampo] = useState<CampoArmado | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [descargadaEn, setDescargadaEn] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const [faltaVincularDispositivo, setFaltaVincular] = useState(false);

  useEffect(() => {
    let vigente = true;
    void armarCampo(api).then((armado) => { if (vigente) setCampo(armado); });
    return () => { vigente = false; };
  }, [api]);

  // El navegador avisa de los dos cambios; no hay que sondear.
  useEffect(() => {
    const conectado = (): void => setEnLinea(true);
    const desconectado = (): void => setEnLinea(false);
    window.addEventListener('online', conectado);
    window.addEventListener('offline', desconectado);
    return () => {
      window.removeEventListener('online', conectado);
      window.removeEventListener('offline', desconectado);
    };
  }, []);

  const refrescar = useCallback(async () => {
    if (campo === null) return;
    const estado = await campo.coordinador.estado();
    setPendientes(estado.operacionesPendientes + estado.evidenciasPendientes);
    setDescargadaEn(estado.descargadaEn);
  }, [campo]);

  useEffect(() => { void refrescar(); }, [refrescar]);

  const sincronizar = useCallback(async () => {
    if (campo === null || sincronizando) return null;
    setSincronizando(true);
    try {
      const resumen = await campo.coordinador.sincronizar();
      setFaltaVincular(resumen.codigoDeInterrupcion === 'SESION_SIN_DISPOSITIVO');
      return resumen;
    } finally {
      await refrescar();
      setSincronizando(false);
    }
  }, [campo, sincronizando, refrescar]);

  const descargarJornada = useCallback(async () => {
    if (campo === null) return;
    await campo.coordinador.descargarJornada();
    await refrescar();
  }, [campo, refrescar]);

  /**
   * Se intenta vaciar la cola sola en cuanto se pueda.
   *
   * No se espera a que el técnico pulse nada: acaba de salir de una casa sin
   * cobertura y lo último que va a hacer es acordarse de sincronizar.
   *
   * DEPENDE TAMBIÉN DE `pendientes`, y esto es lo que lo hace funcionar de
   * verdad. Al abrir la aplicación con señal, la capa de campo se arma antes
   * de que se haya leído cuánto hay en cola: en ese instante `pendientes`
   * vale 0 y el efecto se iba sin hacer nada, de modo que el trabajo del día
   * se quedaba en el teléfono hasta que alguien pulsara «Enviar ahora». Con
   * `pendientes` en las dependencias, el efecto vuelve a correr cuando el
   * número real aparece.
   *
   * No entra en bucle: cada envío que funciona baja el número y el efecto
   * siguiente se va por el `return`; uno que falla lo deja igual, y un valor
   * que no cambia no vuelve a disparar nada.
   */
  useEffect(() => {
    if (!convieneSincronizar({
      enLinea, listo: campo !== null, pendientes, sincronizando, faltaVincularDispositivo,
    })) return;
    void sincronizar();
    // `sincronizar` cambia de identidad al sincronizar; incluirla dispararia
    // el efecto por su propio efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea, campo, pendientes, sincronizando, faltaVincularDispositivo]);

  const valor = useMemo<EstadoDeCampo>(() => ({
    campo,
    listo: campo !== null,
    enLinea,
    pendientes,
    descargadaEn,
    sincronizando,
    faltaVincularDispositivo,
    refrescar,
    sincronizar,
    descargarJornada,
  }), [campo, enLinea, pendientes, descargadaEn, sincronizando, faltaVincularDispositivo,
    refrescar, sincronizar, descargarJornada]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCampo(): EstadoDeCampo {
  const valor = useContext(Contexto);
  if (valor === null) throw new Error('useCampo se uso fuera de ProveedorDeCampo.');
  return valor;
}
