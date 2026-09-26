/**
 * Contexto de la peticion: quien la hace y con que identificador de
 * correlacion. Lo rellena el middleware de autenticacion y lo leen los
 * controladores; los servicios lo reciben como argumento explicito, nunca
 * como estado global.
 */
import type { CodigoPermiso, CodigoRol, UsuarioAutenticado } from '@servitotal/compartido';

export interface ContextoPeticion {
  readonly idCorrelacion: string;
  readonly usuario?: UsuarioAutenticado;
  /** Identificador del dispositivo movil, si la sesion nacio en la app. */
  readonly idDispositivo?: string;
}

/**
 * Quien ejecuta la operacion, ya autenticado. Lo exigen los servicios.
 *
 * Lleva los permisos porque algunas reglas del dominio dependen de ellos
 * —quien puede anular una orden que no tiene a su cargo, por ejemplo— y esa
 * decision es del dominio, no del middleware que ya dejo pasar la peticion.
 */
export interface Actor {
  readonly id: string;
  readonly nombreUsuario: string;
  readonly idCentro: string;
  readonly rol: CodigoRol;
  readonly permisos: readonly CodigoPermiso[];
  /** Dispositivo movil desde el que actua, si la sesion nacio en la app. */
  readonly idDispositivo?: string | undefined;
  /**
   * Sucursal a la que pertenece. NULL para el personal del centro de
   * servicio, que no es de ninguna tienda.
   *
   * Decide dos cosas: de que tienda sale la orden que levante, y —para el
   * usuario de tienda— que ordenes puede ver.
   */
  readonly idTienda?: string | null | undefined;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      contexto: ContextoPeticion;
    }
  }
}
