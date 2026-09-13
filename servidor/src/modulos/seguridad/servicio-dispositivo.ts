/**
 * Reglas de vinculacion y revocacion de dispositivos moviles (RF-05).
 *
 * Un dispositivo revocado no vuelve a abrir ni a refrescar sesion: es lo
 * que permite cortar el acceso de una tableta perdida sin tenerla delante.
 */
import type { Paginacion, PeticionVincularDispositivo, ResumenDispositivo } from '@servitotal/compartido';
import { ACCION_BITACORA } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorConflicto, ErrorDominio, ErrorNoEncontrado } from '../../comun/errores.js';
import { auditar } from '../../comun/auditoria.js';
import { enTransaccion } from '../../comun/transacciones.js';
import * as repositorio from './repositorio-dispositivo.js';
import * as repositorioUsuario from './repositorio-usuario.js';
import { aResumenDispositivo } from './dto.js';

export async function listar(
  soloVigentes: boolean,
  pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenDispositivo[]; paginacion: Paginacion }> {
  const [total, filas] = await Promise.all([
    repositorio.contar(soloVigentes),
    repositorio.listar(soloVigentes, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenDispositivo), paginacion: construirPaginacion(pagina, total) };
}

export async function vincular(
  actor: Actor,
  peticion: PeticionVincularDispositivo,
): Promise<ResumenDispositivo> {
  return enTransaccion(async (cliente) => {
    const usuario = await repositorioUsuario.buscarPorId(peticion.idUsuario, cliente);
    if (usuario === null) throw new ErrorNoEncontrado('No existe un usuario con ese identificador.');
    if (!usuario.activo) {
      throw new ErrorDominio(
        'USUARIO_INACTIVO',
        `No se puede vincular un dispositivo a ${usuario.nombre_usuario} porque su cuenta esta desactivada.`,
      );
    }

    const existente = await repositorio.buscarPorIdentificador(peticion.identificador, cliente);
    if (existente !== null) {
      throw new ErrorConflicto(
        `El dispositivo ${peticion.identificador} ya esta registrado a nombre de ${existente.nombre_usuario}. ` +
          'Revoquelo antes de vincularlo a otra persona.',
      );
    }

    const id = await repositorio.insertar(cliente, {
      idUsuario: peticion.idUsuario,
      identificador: peticion.identificador,
      modelo: peticion.modelo ?? null,
    });

    await auditar(cliente, [{
      tabla: 'dispositivo', idRegistro: id, accion: ACCION_BITACORA.CREAR,
      valorNuevo: `${peticion.identificador} -> ${usuario.nombre_usuario}`, idUsuario: actor.id,
    }]);

    const fila = await repositorio.buscarPorId(id, cliente);
    return aResumenDispositivo(fila!);
  });
}

export async function revocar(actor: Actor, idDispositivo: string, motivo: string): Promise<ResumenDispositivo> {
  return enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idDispositivo, cliente);
    if (previo === null) throw new ErrorNoEncontrado('No existe un dispositivo con ese identificador.');
    if (previo.revocado_en !== null) {
      throw new ErrorDominio('DISPOSITIVO_YA_REVOCADO', 'Ese dispositivo ya estaba dado de baja.');
    }

    await repositorio.revocar(cliente, idDispositivo);
    await auditar(cliente, [{
      tabla: 'dispositivo', idRegistro: idDispositivo, accion: ACCION_BITACORA.DESACTIVAR,
      campo: 'revocado_en', valorAnterior: null, valorNuevo: 'revocado',
      motivo, idUsuario: actor.id,
    }]);

    const fila = await repositorio.buscarPorId(idDispositivo, cliente);
    return aResumenDispositivo(fila!);
  });
}
