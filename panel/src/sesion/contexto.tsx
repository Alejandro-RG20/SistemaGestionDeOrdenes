/**
 * Contexto de sesion del panel: quien esta dentro y con que cliente de API
 * se habla. Lo consume cualquier pantalla sin pasarlo de mano en mano.
 */
import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react';
import type { CodigoPermiso, UsuarioAutenticado } from '@servitotal/compartido';
import { ClienteApi, ErrorDeApi } from '../api/cliente.js';
import { TokensEnNavegador } from './almacen.js';
import { identificadorDeEsteDispositivo } from './dispositivo.js';

interface ValorDeSesion {
  readonly usuario: UsuarioAutenticado | null;
  readonly api: ClienteApi;
  readonly entrar: (nombreUsuario: string, contrasena: string) => Promise<void>;
  readonly salir: () => void;
  /**
   * La sesion quedo atada a este navegador como dispositivo, que es lo que
   * el servidor exige para aceptar la cola de campo. `null` mientras no
   * aplique —el personal del centro no sincroniza nada—.
   */
  readonly dispositivoVinculado: boolean | null;
  /** El identificador que la jefatura necesita para vincular este navegador. */
  readonly identificadorDispositivo: string | null;
}

const Contexto = createContext<ValorDeSesion | null>(null);

export function ProveedorDeSesion({ children }: { children: ReactNode }): JSX.Element {
  const tokens = useMemo(() => new TokensEnNavegador(), []);
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(() => tokens.usuario());

  const [dispositivoVinculado, setDispositivoVinculado] = useState<boolean | null>(null);
  const identificadorDispositivo = useMemo(() => identificadorDeEsteDispositivo(), []);

  const salir = useCallback(() => {
    tokens.limpiar();
    setUsuario(null);
    setDispositivoVinculado(null);
  }, [tokens]);

  const api = useMemo(() => new ClienteApi(tokens, salir), [tokens, salir]);

  /**
   * Se entra DOS VECES cuando el usuario es de campo, y a proposito.
   *
   * La primera sin dispositivo, que es lo que necesita el personal del
   * centro y lo que nunca falla. Solo si el usuario resulta ser de campo se
   * reintenta atando la sesion a este navegador, porque el servidor rechaza
   * el inicio de sesion entero si el dispositivo no esta vinculado, y
   * dejarlo fuera del sistema por eso seria peor que dejarlo entrar sin
   * poder sincronizar todavia: asi al menos ve su ruta y lee, en su
   * pantalla, el codigo que tiene que darle a la jefatura.
   */
  const entrar = useCallback(async (nombreUsuario: string, contrasena: string) => {
    const sesion = await api.iniciarSesion(nombreUsuario, contrasena);
    setUsuario(sesion.usuario);

    const esDeCampo = (sesion.usuario.permisos as readonly CodigoPermiso[])
      .includes('campo.sincronizar' as CodigoPermiso);
    if (!esDeCampo || identificadorDispositivo === null) {
      setDispositivoVinculado(esDeCampo ? false : null);
      return;
    }

    try {
      const atada = await api.iniciarSesion(nombreUsuario, contrasena, identificadorDispositivo);
      setUsuario(atada.usuario);
      setDispositivoVinculado(true);
    } catch (error) {
      // Un dispositivo sin vincular o revocado no cierra la puerta: la
      // sesion sin atar de la primera llamada sigue guardada y valida.
      if (error instanceof ErrorDeApi) {
        setDispositivoVinculado(false);
        return;
      }
      throw error;
    }
  }, [api, identificadorDispositivo]);

  const valor = useMemo(
    () => ({ usuario, api, entrar, salir, dispositivoVinculado, identificadorDispositivo }),
    [usuario, api, entrar, salir, dispositivoVinculado, identificadorDispositivo],
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
