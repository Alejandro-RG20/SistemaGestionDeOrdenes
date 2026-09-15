/**
 * Sesion del dispositivo.
 *
 * Los tokens se guardan en el almacen seguro del sistema, no en la base
 * local: si alguien saca el SQLite de una tableta perdida, no debe sacar
 * con el la llave para entrar al sistema.
 *
 * El token de refresco de un dispositivo vinculado dura treinta dias, que
 * es lo que permite trabajar una jornada entera sin senal y sincronizar al
 * volver.
 */
import * as SecureStore from 'expo-secure-store';
import type { Sesion, UsuarioAutenticado } from '@servitotal/compartido';
import type { ClienteApi, ProveedorDeToken } from './cliente.js';

/**
 * Lo que el coordinador necesita de la sesion.
 *
 * Se declara como interfaz para que la aplicacion se pueda probar sin el
 * almacen seguro del sistema, que no existe fuera de un dispositivo.
 */
export interface AlmacenDeSesion extends ProveedorDeToken {
  guardar(sesion: Sesion): Promise<void>;
  usuario(): Promise<UsuarioAutenticado | null>;
  cerrar(): Promise<void>;
  identificadorDelDispositivo(): Promise<string | null>;
  recordarDispositivo(identificador: string): Promise<void>;
}

const CLAVE_ACCESO = 'servitotal.token.acceso';
const CLAVE_REFRESCO = 'servitotal.token.refresco';
const CLAVE_USUARIO = 'servitotal.usuario';
const CLAVE_DISPOSITIVO = 'servitotal.dispositivo';

export class SesionDelDispositivo implements AlmacenDeSesion {
  private cliente: ClienteApi | null = null;

  /** Se inyecta despues para romper la dependencia circular con el cliente. */
  usarCliente(cliente: ClienteApi): void {
    this.cliente = cliente;
  }

  async tokenAcceso(): Promise<string | null> {
    return SecureStore.getItemAsync(CLAVE_ACCESO);
  }

  /** Cambia el token de refresco por un par nuevo. Null si ya no vale. */
  async renovar(): Promise<string | null> {
    const refresco = await SecureStore.getItemAsync(CLAVE_REFRESCO);
    if (refresco === null || this.cliente === null) return null;

    try {
      const sesion = await this.cliente.refrescar(refresco);
      await this.guardar(sesion);
      return sesion.tokenAcceso;
    } catch {
      // El dispositivo pudo ser revocado a distancia. Se cierra la sesion,
      // pero NO se toca la cola: el trabajo pendiente sigue ahi.
      await this.cerrar();
      return null;
    }
  }

  async guardar(sesion: Sesion): Promise<void> {
    await SecureStore.setItemAsync(CLAVE_ACCESO, sesion.tokenAcceso);
    await SecureStore.setItemAsync(CLAVE_REFRESCO, sesion.tokenRefresco);
    await SecureStore.setItemAsync(CLAVE_USUARIO, JSON.stringify(sesion.usuario));
  }

  async usuario(): Promise<UsuarioAutenticado | null> {
    const guardado = await SecureStore.getItemAsync(CLAVE_USUARIO);
    return guardado === null ? null : (JSON.parse(guardado) as UsuarioAutenticado);
  }

  /** Cierra la sesion. La cola local NO se toca. */
  async cerrar(): Promise<void> {
    await SecureStore.deleteItemAsync(CLAVE_ACCESO);
    await SecureStore.deleteItemAsync(CLAVE_REFRESCO);
    await SecureStore.deleteItemAsync(CLAVE_USUARIO);
  }

  async identificadorDelDispositivo(): Promise<string | null> {
    return SecureStore.getItemAsync(CLAVE_DISPOSITIVO);
  }

  async recordarDispositivo(identificador: string): Promise<void> {
    await SecureStore.setItemAsync(CLAVE_DISPOSITIVO, identificador);
  }
}
