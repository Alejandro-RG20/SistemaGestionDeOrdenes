/**
 * Reglas de gestion de usuarios. Nada se elimina: se desactiva, y todo
 * cambio deja asiento en la bitacora (RF-85).
 */
import type {
  PeticionActualizarUsuario, PeticionCrearUsuario, Paginacion, ResumenUsuario,
} from '@servitotal/compartido';
import { ACCION_BITACORA } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorConflicto, ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { auditar, type AsientoAuditoria } from '../../comun/auditoria.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { derivarContrasena } from '../../comun/contrasenas.js';
import * as repositorio from './repositorio-usuario.js';
import * as repositorioRol from './repositorio-rol.js';
import { aResumenUsuario } from './dto.js';

export interface ListadoUsuarios {
  readonly datos: readonly ResumenUsuario[];
  readonly paginacion: Paginacion;
}

export async function listar(
  filtro: repositorio.FiltroUsuarios,
  pagina: ParametrosPagina,
): Promise<ListadoUsuarios> {
  // Dos consultas, no una por fila: el total y la pagina.
  const [total, filas] = await Promise.all([
    repositorio.contar(filtro),
    repositorio.listar(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenUsuario), paginacion: construirPaginacion(pagina, total) };
}

export async function obtener(idUsuario: string): Promise<ResumenUsuario> {
  const fila = await repositorio.buscarPorId(idUsuario);
  if (fila === null) throw new ErrorNoEncontrado('No existe un usuario con ese identificador.');
  return aResumenUsuario(fila);
}

export async function crear(actor: Actor, peticion: PeticionCrearUsuario): Promise<ResumenUsuario> {
  return enTransaccion(async (cliente) => {
    const rol = await repositorioRol.buscarRolPorCodigo(peticion.codigoRol, cliente);
    if (rol === null) {
      throw new ErrorValidacion(`El rol "${peticion.codigoRol}" no existe o esta desactivado.`,
        { codigoRol: 'Rol no valido.' });
    }

    const idUsuario = await repositorio.insertar(cliente, {
      idCentro: actor.idCentro,
      idRol: rol.id,
      nombreUsuario: peticion.nombreUsuario,
      nombres: peticion.nombres,
      contrasenaHash: derivarContrasena(peticion.contrasena),
      correo: peticion.correo ?? null,
      creadoPor: actor.id,
    }).catch(traducirNombreRepetido(peticion.nombreUsuario));

    await auditar(cliente, [{
      tabla: 'usuario', idRegistro: idUsuario, accion: ACCION_BITACORA.CREAR,
      valorNuevo: `${peticion.nombreUsuario} (${peticion.codigoRol})`, idUsuario: actor.id,
    }]);

    const fila = await repositorio.buscarPorId(idUsuario, cliente);
    return aResumenUsuario(fila!);
  });
}

export async function actualizar(
  actor: Actor,
  idUsuario: string,
  peticion: PeticionActualizarUsuario,
): Promise<ResumenUsuario> {
  return enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idUsuario, cliente);
    if (previo === null) throw new ErrorNoEncontrado('No existe un usuario con ese identificador.');

    let idRol: string | undefined;
    if (peticion.codigoRol !== undefined && peticion.codigoRol !== previo.rol) {
      const rol = await repositorioRol.buscarRolPorCodigo(peticion.codigoRol, cliente);
      if (rol === null) {
        throw new ErrorValidacion(`El rol "${peticion.codigoRol}" no existe o esta desactivado.`,
          { codigoRol: 'Rol no valido.' });
      }
      idRol = rol.id;
    }

    await repositorio.actualizar(cliente, idUsuario, {
      ...(peticion.nombres !== undefined ? { nombres: peticion.nombres } : {}),
      ...(peticion.correo !== undefined ? { correo: peticion.correo } : {}),
      ...(idRol !== undefined ? { idRol } : {}),
    }, actor.id);

    const asientos: AsientoAuditoria[] = [];
    const anotar = (campo: string, anterior: string | null, nuevo: string | null): void => {
      if (anterior === nuevo) return;
      asientos.push({
        tabla: 'usuario', idRegistro: idUsuario, accion: ACCION_BITACORA.MODIFICAR,
        campo, valorAnterior: anterior, valorNuevo: nuevo, idUsuario: actor.id,
      });
    };
    if (peticion.nombres !== undefined) anotar('nombres', previo.nombres, peticion.nombres);
    if (peticion.correo !== undefined) anotar('correo', previo.correo, peticion.correo ?? null);
    if (idRol !== undefined) anotar('rol', previo.rol, peticion.codigoRol ?? null);
    await auditar(cliente, asientos);

    const fila = await repositorio.buscarPorId(idUsuario, cliente);
    return aResumenUsuario(fila!);
  });
}

export async function cambiarContrasena(
  actor: Actor,
  idUsuario: string,
  contrasena: string,
): Promise<void> {
  await enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idUsuario, cliente);
    if (previo === null) throw new ErrorNoEncontrado('No existe un usuario con ese identificador.');

    await repositorio.guardarContrasena(cliente, idUsuario, derivarContrasena(contrasena), actor.id);
    await auditar(cliente, [{
      tabla: 'usuario', idRegistro: idUsuario, accion: ACCION_BITACORA.MODIFICAR,
      campo: 'contrasena_hash', valorAnterior: null, valorNuevo: '(contrasena cambiada)',
      idUsuario: actor.id,
    }]);
  });
}

export async function desbloquear(actor: Actor, idUsuario: string, motivo: string): Promise<void> {
  await enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idUsuario, cliente);
    if (previo === null) throw new ErrorNoEncontrado('No existe un usuario con ese identificador.');
    if (!previo.bloqueado) throw new ErrorDominio('CUENTA_NO_BLOQUEADA', 'La cuenta no esta bloqueada.');

    await repositorio.cambiarBloqueo(cliente, idUsuario, false, actor.id);
    await auditar(cliente, [{
      tabla: 'usuario', idRegistro: idUsuario, accion: ACCION_BITACORA.MODIFICAR,
      campo: 'bloqueado', valorAnterior: 'true', valorNuevo: 'false', motivo, idUsuario: actor.id,
    }]);
  });
}

/** Desactivar, nunca eliminar. Una cuenta desactivada conserva su historia. */
export async function desactivar(actor: Actor, idUsuario: string, motivo: string): Promise<void> {
  await enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idUsuario, cliente);
    if (previo === null) throw new ErrorNoEncontrado('No existe un usuario con ese identificador.');
    if (!previo.activo) throw new ErrorDominio('USUARIO_YA_INACTIVO', 'El usuario ya estaba desactivado.');
    if (idUsuario === actor.id) {
      throw new ErrorDominio(
        'NO_PUEDE_DESACTIVARSE',
        'No puede desactivar su propia cuenta. Pidaselo a otra persona con permiso de gestion de usuarios.',
      );
    }

    await repositorio.cambiarActivo(cliente, idUsuario, false, actor.id);
    await auditar(cliente, [{
      tabla: 'usuario', idRegistro: idUsuario, accion: ACCION_BITACORA.DESACTIVAR,
      campo: 'activo', valorAnterior: 'true', valorNuevo: 'false', motivo, idUsuario: actor.id,
    }]);
  });
}

/** Traduce la violacion de unicidad a un mensaje que el asistente entienda. */
function traducirNombreRepetido(nombreUsuario: string) {
  return (error: unknown): never => {
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
      throw new ErrorConflicto(
        `Ya existe un usuario llamado "${nombreUsuario}". Elija otro nombre de usuario.`, error,
      );
    }
    throw error;
  };
}
