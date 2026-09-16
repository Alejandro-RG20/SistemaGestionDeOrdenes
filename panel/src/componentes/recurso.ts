/**
 * Carga de datos desde la API, con sus tres estados.
 *
 * Un `useEffect` suelto por pantalla termina siempre igual: una pantalla que
 * olvida mostrar el error, otra que parpadea, y una tercera que escribe en
 * un componente ya desmontado. Esto lo resuelve una vez.
 */
import { useCallback, useEffect, useState } from 'react';

export interface Recurso<T> {
  readonly datos: T | null;
  readonly cargando: boolean;
  readonly error: unknown;
  readonly recargar: () => void;
}

export function useRecurso<T>(
  cargar: () => Promise<T>,
  dependencias: readonly unknown[],
): Recurso<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  const recargar = useCallback(() => setIntento((valor) => valor + 1), []);

  useEffect(() => {
    // Si la pantalla cambia antes de que llegue la respuesta, lo que llegue
    // tarde se descarta: si no, una consulta vieja pisa a la nueva.
    let vigente = true;
    setCargando(true);
    setError(null);

    cargar()
      .then((resultado) => { if (vigente) setDatos(resultado); })
      .catch((fallo: unknown) => { if (vigente) setError(fallo); })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, intento]);

  return { datos, cargando, error, recargar };
}
