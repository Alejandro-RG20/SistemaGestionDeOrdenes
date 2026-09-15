/** Consultas de inventario: bodegas, catalogo, existencias y solicitudes. */
import type {
  ExistenciaEnBodega, Paginacion, PeticionSolicitudRepuesto, ResumenBodega,
  ResumenMovimiento, ResumenRepuesto, ResumenSolicitudRepuesto,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { enTransaccion } from '../../comun/transacciones.js';
import * as repositorio from './repositorio.js';
import * as repositorioMovimientos from './repositorio-movimientos.js';
import {
  aExistencia, aResumenBodega, aResumenMovimiento, aResumenRepuesto, aResumenSolicitud,
} from './dto.js';

interface Listado<T> { readonly datos: readonly T[]; readonly paginacion: Paginacion }

export async function listarBodegas(actor: Actor): Promise<readonly ResumenBodega[]> {
  const filas = await repositorio.listarBodegas(actor.idCentro);
  return filas.map(aResumenBodega);
}

export async function listarRepuestos(
  filtro: repositorio.FiltroRepuestos, pagina: ParametrosPagina,
): Promise<Listado<ResumenRepuesto>> {
  const [total, filas] = await Promise.all([
    repositorio.contarRepuestos(filtro),
    repositorio.listarRepuestos(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenRepuesto), paginacion: construirPaginacion(pagina, total) };
}

export async function listarExistencias(
  filtro: repositorio.FiltroExistencias, pagina: ParametrosPagina,
): Promise<Listado<ExistenciaEnBodega>> {
  const [total, filas] = await Promise.all([
    repositorio.contarExistencias(filtro),
    repositorio.listarExistencias(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aExistencia), paginacion: construirPaginacion(pagina, total) };
}

export async function listarMovimientos(
  filtro: repositorioMovimientos.FiltroMovimientos, pagina: ParametrosPagina,
): Promise<Listado<ResumenMovimiento>> {
  const [total, filas] = await Promise.all([
    repositorioMovimientos.contar(filtro),
    repositorioMovimientos.listar(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenMovimiento), paginacion: construirPaginacion(pagina, total) };
}

export async function listarSolicitudes(
  filtro: repositorioMovimientos.FiltroSolicitudes, pagina: ParametrosPagina,
): Promise<Listado<ResumenSolicitudRepuesto>> {
  const [total, filas] = await Promise.all([
    repositorioMovimientos.contarSolicitudes(filtro),
    repositorioMovimientos.listarSolicitudes(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenSolicitud), paginacion: construirPaginacion(pagina, total) };
}

/**
 * Pide un repuesto para una orden. Es lo que sostiene el estado
 * `esperando_repuesto`: mientras quede una solicitud sin liberar, la
 * maquina de estados no deja pasar la orden a reparacion.
 */
export async function solicitarRepuesto(
  actor: Actor, idOrden: string, peticion: PeticionSolicitudRepuesto,
): Promise<ResumenSolicitudRepuesto> {
  const id = await enTransaccion(async (cliente) => {
    const orden = await cliente.query<{ estado: string; numero: number }>(
      'SELECT estado::text AS estado, numero FROM orden_servicio WHERE id = $1', [idOrden],
    );
    if (orden.rows[0] === undefined) {
      throw new ErrorNoEncontrado('No existe una orden con ese identificador.');
    }
    if (['entregada', 'cerrada_sin_reparar', 'anulada'].includes(orden.rows[0].estado)) {
      throw new ErrorDominio(
        'ORDEN_CERRADA',
        `La orden ${orden.rows[0].numero} ya esta ${orden.rows[0].estado}: no se le piden repuestos.`,
      );
    }

    const repuesto = await repositorio.buscarRepuesto(peticion.idRepuesto, cliente);
    if (repuesto === null || !repuesto.activo) {
      throw new ErrorValidacion('El repuesto indicado no existe o esta desactivado.',
        { idRepuesto: 'Repuesto no valido.' });
    }

    return repositorioMovimientos.insertarSolicitud(cliente, {
      idOrden,
      idRepuesto: peticion.idRepuesto,
      cantidad: peticion.cantidad,
      // Si no se indica, se pide por la via habitual del repuesto.
      via: peticion.via ?? repuesto.via_abastecimiento,
      fechaEstimada: peticion.fechaEstimada ?? null,
      creadoPor: actor.id,
    });
  });

  const filas = await repositorioMovimientos.listarSolicitudes(
    { idOrden, soloPendientes: false }, 100, 0,
  );
  return aResumenSolicitud(filas.find((fila) => fila.id === id)!);
}
