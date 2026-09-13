/**
 * Formas de fila que devuelven los repositorios de seguridad y su
 * traduccion a los contratos publicos de la API.
 *
 * Las filas usan snake_case porque asi vienen de PostgreSQL; los DTO usan
 * camelCase porque asi los consume el panel. La frontera esta aqui.
 */
import type {
  CodigoPermiso, CodigoRol, ResumenAsientoBitacora, ResumenDispositivo,
  ResumenPermiso, ResumenRol, ResumenUsuario, UsuarioAutenticado,
} from '@servitotal/compartido';

export interface FilaUsuarioAutenticado {
  readonly id: string;
  readonly nombre_usuario: string;
  readonly nombres: string;
  readonly correo: string | null;
  readonly id_centro: string;
  readonly rol: string;
  readonly permisos: string[];
}

export interface FilaUsuarioConCredencial {
  readonly id: string;
  readonly nombre_usuario: string;
  readonly contrasena_hash: string;
  readonly intentos_fallidos: number;
  readonly bloqueado: boolean;
  readonly activo: boolean;
  readonly rol: string;
}

export interface FilaUsuario {
  readonly id: string;
  readonly nombre_usuario: string;
  readonly nombres: string;
  readonly correo: string | null;
  readonly rol: string;
  readonly bloqueado: boolean;
  readonly activo: boolean;
  readonly intentos_fallidos: number;
  readonly creado_en: Date;
}

export interface FilaRol {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly activo: boolean;
  readonly cantidad_permisos: string;
}

export interface FilaPermiso {
  readonly id: string;
  readonly codigo: string;
  readonly modulo: string;
  readonly descripcion: string;
}

export interface FilaDispositivo {
  readonly id: string;
  readonly id_usuario: string;
  readonly nombre_usuario: string;
  readonly identificador: string;
  readonly modelo: string | null;
  readonly vinculado_en: Date;
  readonly revocado_en: Date | null;
  readonly ultima_sincronizacion: Date | null;
}

export interface FilaAsientoBitacora {
  readonly id: string;
  readonly tabla: string;
  readonly id_registro: string;
  readonly accion: string;
  readonly campo: string | null;
  readonly valor_anterior: string | null;
  readonly valor_nuevo: string | null;
  readonly motivo: string | null;
  readonly nombre_usuario: string;
  readonly momento: Date;
}

export function aUsuarioAutenticado(fila: FilaUsuarioAutenticado): UsuarioAutenticado {
  return {
    id: fila.id,
    nombreUsuario: fila.nombre_usuario,
    nombres: fila.nombres,
    correo: fila.correo,
    idCentro: fila.id_centro,
    rol: fila.rol as CodigoRol,
    permisos: fila.permisos as CodigoPermiso[],
  };
}

export function aResumenUsuario(fila: FilaUsuario): ResumenUsuario {
  return {
    id: fila.id,
    nombreUsuario: fila.nombre_usuario,
    nombres: fila.nombres,
    correo: fila.correo,
    rol: fila.rol as CodigoRol,
    bloqueado: fila.bloqueado,
    activo: fila.activo,
    intentosFallidos: fila.intentos_fallidos,
    creadoEn: fila.creado_en.toISOString(),
  };
}

export function aResumenRol(fila: FilaRol): ResumenRol {
  return {
    id: fila.id,
    codigo: fila.codigo as CodigoRol,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    activo: fila.activo,
    cantidadPermisos: Number(fila.cantidad_permisos),
  };
}

export function aResumenPermiso(fila: FilaPermiso): ResumenPermiso {
  return { id: fila.id, codigo: fila.codigo, modulo: fila.modulo, descripcion: fila.descripcion };
}

export function aResumenDispositivo(fila: FilaDispositivo): ResumenDispositivo {
  return {
    id: fila.id,
    idUsuario: fila.id_usuario,
    nombreUsuario: fila.nombre_usuario,
    identificador: fila.identificador,
    modelo: fila.modelo,
    vinculadoEn: fila.vinculado_en.toISOString(),
    revocadoEn: fila.revocado_en?.toISOString() ?? null,
    ultimaSincronizacion: fila.ultima_sincronizacion?.toISOString() ?? null,
  };
}

export function aResumenAsiento(fila: FilaAsientoBitacora): ResumenAsientoBitacora {
  return {
    id: fila.id,
    tabla: fila.tabla,
    idRegistro: fila.id_registro,
    accion: fila.accion,
    campo: fila.campo,
    valorAnterior: fila.valor_anterior,
    valorNuevo: fila.valor_nuevo,
    motivo: fila.motivo,
    nombreUsuario: fila.nombre_usuario,
    momento: fila.momento.toISOString(),
  };
}
