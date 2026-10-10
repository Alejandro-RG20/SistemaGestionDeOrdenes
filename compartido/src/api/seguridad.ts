/**
 * Contratos del modulo de seguridad: lo que el panel y la aplicacion movil
 * envian y reciben. El backend valida estos mismos contratos; el cliente no
 * es fuente de verdad de nada.
 */
import type { CodigoPermiso, CodigoRol } from '../dominio/seguridad.js';

export interface PeticionIniciarSesion {
  readonly nombreUsuario: string;
  readonly contrasena: string;
  /** Identificador del dispositivo movil, cuando la sesion nace en la app. */
  readonly identificadorDispositivo?: string;
}

export interface PeticionRefrescar {
  readonly tokenRefresco: string;
}

export interface UsuarioAutenticado {
  readonly id: string;
  readonly nombreUsuario: string;
  readonly nombres: string;
  readonly correo: string | null;
  readonly idCentro: string;
  readonly rol: CodigoRol;
  readonly permisos: readonly CodigoPermiso[];
  /**
   * Sucursal a la que pertenece, si es personal de tienda.
   *
   * NULL para quien trabaja en el centro de servicio. No es solo
   * informativo: define el alcance de lo que ve y de donde salen las
   * ordenes que levanta (§8 del pliego).
   */
  readonly idTienda: string | null;
  readonly tienda: string | null;
}

export interface Sesion {
  readonly tokenAcceso: string;
  readonly tokenRefresco: string;
  /** Segundos de vida del token de acceso. */
  readonly expiraEn: number;
  readonly usuario: UsuarioAutenticado;
}

export interface ResumenUsuario {
  readonly id: string;
  readonly nombreUsuario: string;
  readonly nombres: string;
  readonly correo: string | null;
  readonly rol: CodigoRol;
  readonly bloqueado: boolean;
  readonly activo: boolean;
  readonly intentosFallidos: number;
  readonly creadoEn: string;
}

export interface PeticionCrearUsuario {
  readonly nombreUsuario: string;
  readonly nombres: string;
  readonly contrasena: string;
  readonly codigoRol: CodigoRol;
  readonly correo?: string | null;
}

export interface PeticionActualizarUsuario {
  readonly nombres?: string;
  readonly correo?: string | null;
  readonly codigoRol?: CodigoRol;
}

export interface PeticionCambiarContrasena {
  readonly contrasena: string;
}

export interface PeticionMotivo {
  readonly motivo: string;
}

export interface ResumenRol {
  readonly id: string;
  readonly codigo: CodigoRol;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly activo: boolean;
  readonly cantidadPermisos: number;
}

export interface ResumenPermiso {
  readonly id: string;
  readonly codigo: string;
  readonly modulo: string;
  readonly descripcion: string;
}

export interface PeticionAsignarPermisos {
  readonly codigosPermiso: readonly string[];
  readonly motivo: string;
}

export interface ResumenDispositivo {
  readonly id: string;
  readonly idUsuario: string;
  readonly nombreUsuario: string;
  readonly identificador: string;
  readonly modelo: string | null;
  readonly vinculadoEn: string;
  readonly revocadoEn: string | null;
  readonly ultimaSincronizacion: string | null;
}

export interface PeticionVincularDispositivo {
  readonly idUsuario: string;
  readonly identificador: string;
  readonly modelo?: string | null;
}

export interface ResumenAsientoBitacora {
  readonly id: string;
  readonly tabla: string;
  readonly idRegistro: string;
  readonly accion: string;
  readonly campo: string | null;
  readonly valorAnterior: string | null;
  readonly valorNuevo: string | null;
  readonly motivo: string | null;
  readonly nombreUsuario: string;
  readonly momento: string;
}

// ── tecnicos ───────────────────────────────────────────────────────────
//
// Un tecnico es el perfil laboral de una cuenta de usuario: la tabla
// `tecnico` apunta a `usuario` (uno a uno). El estado laboral del tecnico
// (activo, disponible) y el de su cuenta (activa, bloqueada) son cosas
// distintas y se gestionan por separado.

export type TipoTecnico = 'ruta' | 'planta';

export interface ResumenTecnico {
  readonly id: string;
  readonly idUsuario: string;
  readonly nombreUsuario: string;
  readonly nombres: string;
  readonly correo: string | null;
  readonly tipo: TipoTecnico;
  /** Linea de articulos que atiende (categoria: refrigeracion, lavado...). */
  readonly especialidad: string;
  /** Recibe asignaciones nuevas. */
  readonly disponible: boolean;
  /** Estado laboral. */
  readonly activo: boolean;
  /** Estado de la cuenta de usuario. */
  readonly cuentaActiva: boolean;
  readonly cuentaBloqueada: boolean;
  readonly ordenesAbiertas: number;
}

export interface OrdenDelTecnico {
  readonly id: string;
  readonly codigo: string;
  readonly estado: string;
}

export interface FichaTecnico extends ResumenTecnico {
  readonly ordenes: readonly OrdenDelTecnico[];
  readonly visitasProgramadas: number;
  /** Unidades en su bodega personal (vehiculo o banco de taller). */
  readonly unidadesEnBodega: number;
  readonly bodega: string | null;
}

export interface PeticionCrearTecnico {
  readonly tipo: TipoTecnico;
  readonly especialidad: string;
  readonly disponible?: boolean;
  /** Cuenta existente con rol tecnico_ruta o tecnico_planta, sin ficha de tecnico. */
  readonly idUsuario?: string;
  /** O una cuenta nueva, que se crea con el rol que corresponde al tipo. */
  readonly cuentaNueva?: {
    readonly nombreUsuario: string;
    readonly nombres: string;
    readonly contrasena: string;
    readonly correo?: string | null;
  };
}

export interface PeticionActualizarTecnico {
  readonly especialidad?: string;
  readonly disponible?: boolean;
  readonly tipo?: TipoTecnico;
  readonly nombres?: string;
  readonly correo?: string | null;
  /** Obligatorio si cambia el tipo: cambia tambien el rol de la cuenta. */
  readonly motivo?: string;
}

export interface PeticionDesactivarTecnico {
  readonly motivo: string;
  /** Si tiene ordenes abiertas, se le reasignan a este tecnico. */
  readonly idTecnicoReemplazo?: string;
}
