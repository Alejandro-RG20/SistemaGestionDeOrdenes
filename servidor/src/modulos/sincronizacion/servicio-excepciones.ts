/**
 * Bandeja de excepciones: lo que el servidor no pudo aplicar, esperando a
 * que una persona lo concilie.
 *
 * Nada de aqui se borra. Una excepcion se resuelve o se descarta, siempre
 * con una explicacion escrita, y la carga original se conserva igual.
 */
import type {
  Paginacion, PeticionResolverExcepcion, ResumenExcepcion,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorDominio, ErrorNoEncontrado } from '../../comun/errores.js';
import { enTransaccion } from '../../comun/transacciones.js';
import * as repositorio from './repositorio.js';

function aResumen(fila: repositorio.FilaExcepcion): ResumenExcepcion {
  return {
    id: fila.id,
    idOperacion: fila.id_operacion,
    idOrden: fila.id_orden,
    numeroOrden: fila.numero_orden,
    idTecnico: fila.id_tecnico,
    tecnico: fila.tecnico,
    motivo: fila.motivo,
    cargaOriginal: fila.carga_original,
    estado: fila.estado,
    resueltaPor: fila.resuelta_por,
    resueltaEn: fila.resuelta_en?.toISOString() ?? null,
    resolucion: fila.resolucion,
    creadoEn: fila.creado_en.toISOString(),
  };
}

export async function listar(
  filtro: repositorio.FiltroExcepciones, pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenExcepcion[]; paginacion: Paginacion }> {
  const [total, filas] = await Promise.all([
    repositorio.contarExcepciones(filtro),
    repositorio.listarExcepciones(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumen), paginacion: construirPaginacion(pagina, total) };
}

export async function obtener(id: string): Promise<ResumenExcepcion> {
  const fila = await repositorio.buscarExcepcion(id);
  if (fila === null) throw new ErrorNoEncontrado('No existe una excepcion con ese identificador.');
  return aResumen(fila);
}

export async function resolver(
  actor: Actor, id: string, peticion: PeticionResolverExcepcion,
): Promise<ResumenExcepcion> {
  await enTransaccion(async (cliente) => {
    const fila = await repositorio.buscarExcepcion(id, cliente);
    if (fila === null) throw new ErrorNoEncontrado('No existe una excepcion con ese identificador.');
    if (fila.estado !== 'pendiente') {
      throw new ErrorDominio(
        'EXCEPCION_YA_CERRADA',
        `Esa excepcion ya estaba ${fila.estado}. Si hace falta reabrirla, registre una nueva.`,
      );
    }

    await repositorio.cerrarExcepcion(cliente, {
      id, estado: peticion.estado, resolucion: peticion.resolucion, resueltaPor: actor.id,
    });
  });

  return obtener(id);
}
