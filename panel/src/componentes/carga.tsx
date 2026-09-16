/**
 * Lo que se pinta mientras se espera y cuando algo falla.
 *
 * El mensaje de error es el que escribio el servidor, sin traducir. Del otro
 * lado ya se redacto pensando en quien lo va a leer; convertirlo en "Error
 * 422" seria deshacer ese trabajo.
 */
import type { ReactNode } from 'react';
import { ErrorDeApi } from '../api/cliente.js';

export function Cargando({ que }: { que: string }): JSX.Element {
  return <p className="tenue">Cargando {que}…</p>;
}

export function Fallo({ error, alReintentar }: {
  error: unknown;
  alReintentar?: () => void;
}): JSX.Element {
  const mensaje = error instanceof ErrorDeApi
    ? error.message
    : 'Ocurrio un problema inesperado al cargar esta pantalla.';

  return (
    <div className="aviso aviso-error">
      <p>{mensaje}</p>
      {alReintentar === undefined ? null : (
        <button type="button" className="boton boton-secundario" onClick={alReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }): JSX.Element {
  return <p className="vacio">{children}</p>;
}
