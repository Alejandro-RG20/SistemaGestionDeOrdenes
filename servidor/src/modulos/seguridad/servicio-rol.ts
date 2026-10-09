/**
 * Reglas de roles, permisos y consulta de la bitacora.
 *
 * Cambiar los permisos de un rol es un acto de administracion: exige motivo
 * escrito y queda registrado permiso por permiso.
 */
import type {
  Paginacion, PeticionAsignarPermisos, ResumenAsientoBitacora, ResumenPermiso, ResumenRol,
} from '@servitotal/compartido';
import { ACCION_BITACORA, CODIGO_ROL } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorAutorizacion, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { auditar, type AsientoAuditoria } from '../../comun/auditoria.js';
import { enTransaccion } from '../../comun/transacciones.js';
import * as repositorio from './repositorio-rol.js';
import { aResumenAsiento, aResumenPermiso, aResumenRol } from './dto.js';

export async function listarRoles(pagina: ParametrosPagina): Promise<{
  datos: readonly ResumenRol[]; paginacion: Paginacion;
}> {
  const [total, filas] = await Promise.all([
    repositorio.contarRoles(),
    repositorio.listarRoles(pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenRol), paginacion: construirPaginacion(pagina, total) };
}

export async function listarPermisos(pagina: ParametrosPagina): Promise<{
  datos: readonly ResumenPermiso[]; paginacion: Paginacion;
}> {
  const [total, filas] = await Promise.all([
    repositorio.contarPermisos(),
    repositorio.listarPermisos(pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenPermiso), paginacion: construirPaginacion(pagina, total) };
}

export async function listarPermisosDeRol(idRol: string): Promise<readonly ResumenPermiso[]> {
  const rol = await repositorio.buscarRolPorId(idRol);
  if (rol === null) throw new ErrorNoEncontrado('No existe un rol con ese identificador.');
  const filas = await repositorio.listarPermisosDeRol(idRol);
  return filas.map(aResumenPermiso);
}

/**
 * Reemplaza por completo los permisos del rol. Devolver el conjunto entero
 * —y no altas y bajas sueltas— evita que dos administradores editando a la
 * vez dejen una mezcla que ninguno de los dos quiso.
 */
export async function asignarPermisos(
  actor: Actor,
  idRol: string,
  peticion: PeticionAsignarPermisos,
): Promise<readonly ResumenPermiso[]> {
  return enTransaccion(async (cliente) => {
    const rol = await repositorio.buscarRolPorId(idRol, cliente);
    if (rol === null) throw new ErrorNoEncontrado('No existe un rol con ese identificador.');

    const pedidos = [...new Set(peticion.codigosPermiso)];
    // Un solo viaje para resolver todos los codigos, nunca uno por permiso.
    const encontrados = await repositorio.buscarPermisosPorCodigo(pedidos, cliente);

    if (encontrados.length !== pedidos.length) {
      const conocidos = new Set(encontrados.map((permiso) => permiso.codigo));
      const desconocidos = pedidos.filter((codigo) => !conocidos.has(codigo));
      throw new ErrorValidacion(
        `Estos permisos no existen: ${desconocidos.join(', ')}.`,
        { codigosPermiso: 'Hay permisos que no estan en el catalogo.' },
      );
    }

    const previos = await repositorio.listarPermisosDeRol(idRol, cliente);
    exigirQuePuedaConceder(actor, rol.codigo, previos.map((p) => p.codigo), pedidos);
    await repositorio.reemplazarPermisosDeRol(cliente, idRol, encontrados.map((permiso) => permiso.id));

    const antes = new Set(previos.map((permiso) => permiso.codigo));
    const despues = new Set(encontrados.map((permiso) => permiso.codigo));
    const asientos: AsientoAuditoria[] = [
      ...[...despues].filter((codigo) => !antes.has(codigo)).map((codigo) => ({
        tabla: 'rol_permiso', idRegistro: idRol, accion: ACCION_BITACORA.MODIFICAR,
        campo: 'permiso', valorAnterior: null, valorNuevo: codigo,
        motivo: peticion.motivo, idUsuario: actor.id,
      })),
      ...[...antes].filter((codigo) => !despues.has(codigo)).map((codigo) => ({
        tabla: 'rol_permiso', idRegistro: idRol, accion: ACCION_BITACORA.MODIFICAR,
        campo: 'permiso', valorAnterior: codigo, valorNuevo: null,
        motivo: peticion.motivo, idUsuario: actor.id,
      })),
    ];
    await auditar(cliente, asientos);

    const finales = await repositorio.listarPermisosDeRol(idRol, cliente);
    return finales.map(aResumenPermiso);
  });
}

/*
 * Editar permisos sin escalar privilegios.
 *
 * Fuera del administrador, quien gestiona roles:
 *   - no toca el rol de administrador;
 *   - no edita su propio rol (seria darse lo que quiera);
 *   - no concede un permiso que el mismo no tiene. Repartir lo que uno ya
 *     puede hacer es delegar; repartir lo que no, es escalar. Retirar si
 *     puede: quitar un permiso no da poder a nadie.
 */
function exigirQuePuedaConceder(
  actor: Actor, codigoRol: string, previos: readonly string[], pedidos: readonly string[],
): void {
  if (actor.rol === CODIGO_ROL.ADMINISTRADOR) return;
  if (codigoRol === CODIGO_ROL.ADMINISTRADOR) {
    throw new ErrorAutorizacion('Solo la administracion del sistema puede cambiar los permisos del administrador.');
  }
  if (codigoRol === actor.rol) {
    throw new ErrorAutorizacion(
      'No puede cambiar los permisos de su propio rol. Pidaselo a la administracion del sistema.',
    );
  }
  const propios = new Set<string>(actor.permisos);
  const antes = new Set(previos);
  const ajenos = pedidos.filter((codigo) => !antes.has(codigo) && !propios.has(codigo));
  if (ajenos.length > 0) {
    throw new ErrorAutorizacion(
      `No puede conceder permisos que usted no tiene: ${ajenos.join(', ')}.`,
    );
  }
}

export async function listarBitacora(
  filtro: repositorio.FiltroBitacora,
  pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenAsientoBitacora[]; paginacion: Paginacion }> {
  const [total, filas] = await Promise.all([
    repositorio.contarAsientos(filtro),
    repositorio.listarAsientos(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenAsiento), paginacion: construirPaginacion(pagina, total) };
}
