/**
 * Lectura del espejo local para las pantallas del tecnico.
 *
 * Todas leen de IndexedDB, no de la red: la pantalla no debe quedarse en
 * blanco porque el barrio no tenga cobertura. Por eso no se reusa
 * `useRecurso`, que pide al servidor; aqui la fuente es el espejo, y la red
 * solo entra cuando el tecnico decide sincronizar.
 */
import { useCallback, useEffect, useState } from 'react';
import { useCampo } from '../../campo/contexto.js';
import type { Coordinador } from '../../campo/coordinador.js';

export interface LecturaDelCampo<T> {
  readonly datos: T | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly recargar: () => void;
}

export function useDelCampo<T>(
  consulta: (coordinador: Coordinador) => Promise<T>,
  dependencias: readonly unknown[] = [],
): LecturaDelCampo<T> {
  const { campo } = useCampo();
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ronda, setRonda] = useState(0);

  // La consulta cambia de identidad en cada render; las dependencias que
  // manda la pantalla son las que de verdad deciden cuando releer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const leer = useCallback(consulta, dependencias);

  useEffect(() => {
    if (campo === null) return undefined;
    let vigente = true;
    setCargando(true);
    leer(campo.coordinador)
      .then((resultado) => {
        if (!vigente) return;
        setDatos(resultado);
        setError(null);
      })
      .catch((fallo: unknown) => {
        if (!vigente) return;
        setError(fallo instanceof Error ? fallo.message : 'No se pudo leer el trabajo guardado.');
      })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [campo, leer, ronda]);

  const recargar = useCallback(() => setRonda((numero) => numero + 1), []);

  return { datos, cargando, error, recargar };
}
