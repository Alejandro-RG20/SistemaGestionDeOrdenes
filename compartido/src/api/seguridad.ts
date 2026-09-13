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
