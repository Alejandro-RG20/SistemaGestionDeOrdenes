/**
 * Contexto de sesion del panel: quien esta dentro y con que cliente de API
 * se habla. Lo consume cualquier pantalla sin pasarlo de mano en mano.
 */
import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react';
import type { UsuarioAutenticado } from '@servitotal/compartido';
import { ClienteApi } from '../api/cliente.js';
import { TokensEnNavegador } from './almacen.js';

interface ValorDeSesion {
  readonly usuario: UsuarioAutenticado | null;
  readonly api: ClienteApi;
  readonly entrar: (nombreUsuario: string, contrasena: string) => Promise<void>;
  readonly salir: () => void;
}

const Contexto = createContext<ValorDeSesion | null>(null);

export function ProveedorDeSesion({ children }: { children: ReactNode }): JSX.Element {
  const tokens = useMemo(() => new TokensEnNavegador(), []);
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(() => tokens.usuario());

  const salir = useCallback(() => {
    tokens.limpiar();
    setUsuario(null);
  }, [tokens]);

  const api = useMemo(() => new ClienteApi(tokens, salir), [tokens, salir]);

  const entrar = useCallback(async (nombreUsuario: string, contrasena: string) => {
    const sesion = await api.iniciarSesion(nombreUsuario, contrasena);
    setUsuario(sesion.usuario);
  }, [api]);

  const valor = useMemo(
    () => ({ usuario, api, entrar, salir }),
    [usuario, api, entrar, salir],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ValorDeSesion {
  const valor = useContext(Contexto);
  if (valor === null) {
    throw new Error('useSesion se uso fuera de ProveedorDeSesion.');
  }
  return valor;
}
