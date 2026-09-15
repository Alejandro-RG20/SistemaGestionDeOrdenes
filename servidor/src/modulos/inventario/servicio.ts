/**
 * Reglas de movimientos de inventario.
 *
 * Los movimientos son la fuente de verdad; `existencia` es una proyeccion
 * que se actualiza en la MISMA transaccion. Si algo falla en medio, no se
 * descuenta nada: la transaccion se revierte entera.
 */
import type {
  OrdenLiberada, PeticionMovimientoInventario, ResultadoMovimiento,
} from '@servitotal/compartido';
import { TIPO_MOVIMIENTO } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import {
  efectoSobreExistencia, validarMovimiento, type PeticionMovimiento,
} from '../../dominio/inventario/indice.js';
import { anotarAvisos, type AvisoDeOrden } from '../ordenes/servicio-avisos.js';
import * as repositorio from './repositorio.js';
import * as repositorioMovimientos from './repositorio-movimientos.js';
import { aResumenMovimiento } from './dto.js';

/** Movimientos que meten unidades al centro y por tanto pueden liberar ordenes. */
const LIBERAN_ORDENES: readonly string[] = [TIPO_MOVIMIENTO.INGRESO];

interface BodegaResuelta {
  readonly id: string;
  readonly tipo: string;
  readonly nombre: string;
}

async function exigirBodega(
  ejecutor: Ejecutor, id: string | null | undefined, campo: string,
): Promise<BodegaResuelta | null> {
  if (id === null || id === undefined) return null;
  const bodega = await repositorio.buscarBodega(id, ejecutor);
  if (bodega === null || !bodega.activa) {
    throw new ErrorValidacion('La bodega indicada no existe o esta desactivada.', { [campo]: 'Bodega no valida.' });
  }
  return bodega;
}

/**
 * Aplica un movimiento ya validado: bloquea, comprueba que alcance,
 * inserta el movimiento y mueve la proyeccion.
 *
 * Devuelve la existencia resultante por bodega. Se llama tanto desde el
 * movimiento suelto como desde el consumo en lote, para que la regla de
 * "no descontar mas de lo que hay" sea una sola y viva en un solo lugar.
 */
async function aplicarMovimiento(
  ejecutor: Ejecutor,
  actor: Actor,
  peticion: PeticionMovimientoInventario,
  bodegas: { origen: BodegaResuelta | null; destino: BodegaResuelta | null },
): Promise<{ idMovimiento: string; existencias: { idBodega: string; bodega: string; cantidad: number }[] }> {
  const repuesto = await repositorio.buscarRepuesto(peticion.idRepuesto, ejecutor);
  if (repuesto === null) {
    throw new ErrorValidacion('El repuesto indicado no existe.', { idRepuesto: 'Repuesto no valido.' });
  }

  const solicitud: PeticionMovimiento = {
    tipo: peticion.tipo,
    idBodegaOrigen: bodegas.origen?.id ?? null,
    idBodegaDestino: bodegas.destino?.id ?? null,
    cantidad: peticion.cantidad,
    idOrden: peticion.idOrden ?? null,
    justificacion: peticion.justificacion ?? null,
    registradoSinConexion: peticion.registradoSinConexion ?? false,
  };

  const veredicto = validarMovimiento(solicitud, {
    origen: bodegas.origen?.tipo ?? null,
    destino: bodegas.destino?.tipo ?? null,
  });
  if (!veredicto.valido) {
    throw new ErrorValidacion(veredicto.motivo ?? 'El movimiento no es valido.',
      veredicto.campo === undefined ? {} : { [veredicto.campo]: veredicto.motivo ?? '' });
  }

  // Todo repuesto esta siempre en una bodega concreta: si sale de algun
  // lado, ahi tiene que haber lo suficiente.
  if (bodegas.origen !== null) {
    const disponible = await repositorio.bloquearExistencia(ejecutor, bodegas.origen.id, peticion.idRepuesto);
    if (disponible < peticion.cantidad) {
      throw new ErrorDominio(
        'EXISTENCIA_INSUFICIENTE',
        `No hay suficiente ${repuesto.descripcion} (${repuesto.codigo}) en ${bodegas.origen.nombre}: ` +
          `se piden ${peticion.cantidad} y hay ${disponible}.`,
      );
    }
  }

  const idMovimiento = await repositorioMovimientos.insertar(ejecutor, {
    idRepuesto: peticion.idRepuesto,
    tipo: peticion.tipo,
    idBodegaOrigen: solicitud.idBodegaOrigen,
    idBodegaDestino: solicitud.idBodegaDestino,
    cantidad: peticion.cantidad,
    // Precio congelado en el momento del movimiento (RN-22).
    precioUnitario: peticion.precioUnitario ?? Number(repuesto.precio),
    idOrden: solicitud.idOrden,
    idResponsable: actor.id,
    justificacion: solicitud.justificacion,
    momentoDispositivo: peticion.momentoDispositivo === undefined || peticion.momentoDispositivo === null
      ? null
      : new Date(peticion.momentoDispositivo),
    registradoSinConexion: solicitud.registradoSinConexion,
  });

  const existencias: { idBodega: string; bodega: string; cantidad: number }[] = [];
  const nombreDe = new Map<string, string>([
    ...(bodegas.origen === null ? [] : [[bodegas.origen.id, bodegas.origen.nombre] as const]),
    ...(bodegas.destino === null ? [] : [[bodegas.destino.id, bodegas.destino.nombre] as const]),
  ]);

  for (const efecto of efectoSobreExistencia(solicitud)) {
    const cantidad = await repositorio.aplicarDelta(
      ejecutor, efecto.idBodega, peticion.idRepuesto, efecto.delta,
    );
    existencias.push({
      idBodega: efecto.idBodega,
      bodega: nombreDe.get(efecto.idBodega) ?? '',
      cantidad,
    });
  }

  return { idMovimiento, existencias };
}

/**
 * RF-53 · RN-15: al ingresar un repuesto, las ordenes que lo esperaban se
 * liberan solas y queda constancia en la bitacora de cada una.
 *
 * Se liberan por orden de llegada mientras la cantidad ingresada alcance.
 * El pliego dice "todas las ordenes que lo esperaban"; liberar cinco
 * ordenes porque entraron dos unidades seria mentirle al taller, asi que se
 * liberan las que de verdad quedan cubiertas.
 */
async function liberarOrdenesQueEsperaban(
  ejecutor: Ejecutor, actor: Actor, idRepuesto: string, cantidadIngresada: number,
): Promise<OrdenLiberada[]> {
  const pendientes = await repositorioMovimientos.solicitudesPendientesDe(ejecutor, idRepuesto);
  if (pendientes.length === 0) return [];

  const liberadas: OrdenLiberada[] = [];
  const avisos: AvisoDeOrden[] = [];
  let disponible = cantidadIngresada;

  for (const solicitud of pendientes) {
    if (solicitud.cantidad > disponible) continue;
    disponible -= solicitud.cantidad;

    liberadas.push({
      idOrden: solicitud.id_orden,
      numeroOrden: solicitud.numero_orden,
      idSolicitud: solicitud.id,
      cantidad: solicitud.cantidad,
      responsable: solicitud.responsable,
    });
    avisos.push({
      idOrden: solicitud.id_orden,
      estado: solicitud.estado,
      observacion:
        `Ingreso el repuesto que la orden esperaba (${solicitud.cantidad} unidad(es)). ` +
        'La orden queda liberada y puede pasar a reparacion.',
    });
  }

  await repositorioMovimientos.liberarSolicitudes(ejecutor, liberadas.map((o) => o.idSolicitud));
  await anotarAvisos(ejecutor, actor, avisos);
  return liberadas;
}

export async function registrarMovimiento(
  actor: Actor, peticion: PeticionMovimientoInventario,
): Promise<ResultadoMovimiento> {
  const { idMovimiento, existencias, ordenesLiberadas } = await enTransaccion(async (cliente) => {
    // En secuencia: un cliente de transaccion no admite consultas en
    // paralelo. Solo la piscina reparte un cliente por consulta.
    const origen = await exigirBodega(cliente, peticion.idBodegaOrigen, 'idBodegaOrigen');
    const destino = await exigirBodega(cliente, peticion.idBodegaDestino, 'idBodegaDestino');

    const aplicado = await aplicarMovimiento(cliente, actor, peticion, { origen, destino });

    const liberadas = LIBERAN_ORDENES.includes(peticion.tipo)
      ? await liberarOrdenesQueEsperaban(cliente, actor, peticion.idRepuesto, peticion.cantidad)
      : [];

    return { ...aplicado, ordenesLiberadas: liberadas };
  });

  const fila = await repositorioMovimientos.buscarPorId(idMovimiento);
  return { movimiento: aResumenMovimiento(fila!), existencias, ordenesLiberadas };
}

export interface ConsumoDeOrden {
  readonly idRepuesto: string;
  readonly cantidad: number;
  readonly idBodegaOrigen: string;
  readonly precioUnitario?: number;
}

/**
 * Consume varios repuestos contra una orden, TODO O NADA.
 *
 * Es el caso que el pliego pide probar: si al tercer repuesto no alcanza la
 * existencia, los dos primeros tampoco se descuentan. La transaccion se
 * revierte entera y la base queda como estaba.
 */
export async function registrarConsumosDeOrden(
  actor: Actor, idOrden: string, consumos: readonly ConsumoDeOrden[],
): Promise<readonly ResultadoMovimiento[]> {
  if (consumos.length === 0) {
    throw new ErrorValidacion('Indique al menos un repuesto consumido.', { consumos: 'Lista vacia.' });
  }

  const ids = await enTransaccion(async (cliente) => {
    const orden = await cliente.query<{ id: string; estado: string; numero: number }>(
      `SELECT id, estado::text AS estado, numero FROM orden_servicio WHERE id = $1 FOR UPDATE`,
      [idOrden],
    );
    if (orden.rows[0] === undefined) {
      throw new ErrorNoEncontrado('No existe una orden con ese identificador.');
    }
    if (['entregada', 'cerrada_sin_reparar', 'anulada'].includes(orden.rows[0].estado)) {
      throw new ErrorDominio(
        'ORDEN_CERRADA',
        `La orden ${orden.rows[0].numero} ya esta ${orden.rows[0].estado}: no se le pueden cargar repuestos.`,
      );
    }

    const aplicados: string[] = [];
    for (const consumo of consumos) {
      const origen = await exigirBodega(cliente, consumo.idBodegaOrigen, 'idBodegaOrigen');
      const aplicado = await aplicarMovimiento(cliente, actor, {
        idRepuesto: consumo.idRepuesto,
        tipo: TIPO_MOVIMIENTO.CONSUMO,
        idBodegaOrigen: consumo.idBodegaOrigen,
        cantidad: consumo.cantidad,
        idOrden,
        ...(consumo.precioUnitario === undefined ? {} : { precioUnitario: consumo.precioUnitario }),
      }, { origen, destino: null });
      aplicados.push(aplicado.idMovimiento);
    }
    return aplicados;
  });

  const filas = await Promise.all(ids.map((id) => repositorioMovimientos.buscarPorId(id)));
  return filas.map((fila) => ({
    movimiento: aResumenMovimiento(fila!),
    existencias: [],
    ordenesLiberadas: [],
  }));
}

/** Solo por si hay que auditar la proyeccion contra los movimientos. */
export async function reconstruirExistencias(actor: Actor): Promise<void> {
  if (!actor.permisos.includes('inventario.ajuste.registrar')) {
    throw new ErrorDominio('SIN_PERMISO_DE_AJUSTE', 'Reconstruir la existencia exige permiso de ajuste.');
  }
  await enTransaccion((cliente) => repositorio.reconstruirProyeccion(cliente));
}
