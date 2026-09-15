/**
 * Consumo registrado en el domicilio del cliente, que llega despues por la
 * cola de sincronizacion.
 *
 * Aqui manda el criterio que ordena todos los conflictos: prevalece lo que
 * ocurrio fisicamente. Si el tecnico instalo una pieza que la bodega movil
 * no tenia anotada, la pieza ESTA en el aparato del cliente: el consumo se
 * acepta y se genera un ajuste que documenta la diferencia. Negar el
 * consumo dejaria la base "cuadrada" y la realidad sin registrar.
 */
import { TIPO_MOVIMIENTO } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { ErrorValidacion } from '../../comun/errores.js';
import { resolverPrecio } from '../../dominio/sincronizacion/indice.js';
import * as repositorio from './repositorio.js';
import * as repositorioMovimientos from './repositorio-movimientos.js';

export interface ConsumoDeCampo {
  readonly idRepuesto: string;
  readonly idBodegaOrigen: string;
  readonly cantidad: number;
  readonly idOrden: string;
  /** Precio que el cliente firmo en el domicilio. */
  readonly precioFirmado?: number | undefined;
  readonly momentoDispositivo: Date;
}

export interface ResultadoConsumoDeCampo {
  readonly idMovimiento: string;
  /** Unidades que no figuraban en la bodega y hubo que ajustar. */
  readonly faltanteAjustado: number;
  readonly idMovimientoAjuste: string | null;
  readonly precioAplicado: number;
  readonly diferenciaDePrecio: number;
  readonly existenciaResultante: number;
}

export async function consumirDesdeCampo(
  ejecutor: Ejecutor, actor: Actor, consumo: ConsumoDeCampo,
): Promise<ResultadoConsumoDeCampo> {
  const repuesto = await repositorio.buscarRepuesto(consumo.idRepuesto, ejecutor);
  if (repuesto === null) {
    throw new ErrorValidacion('El repuesto indicado no existe.', { idRepuesto: 'Repuesto no valido.' });
  }
  const bodega = await repositorio.buscarBodega(consumo.idBodegaOrigen, ejecutor);
  if (bodega === null) {
    throw new ErrorValidacion('La bodega indicada no existe.', { idBodegaOrigen: 'Bodega no valida.' });
  }

  const disponible = await repositorio.bloquearExistencia(ejecutor, bodega.id, consumo.idRepuesto);
  const faltante = Math.max(0, consumo.cantidad - disponible);

  // El ajuste va PRIMERO: repone lo que faltaba para que el consumo pueda
  // descontarse sin dejar la existencia negativa. Asi el CHECK de la tabla
  // sigue en pie y la diferencia queda documentada como lo que es.
  let idMovimientoAjuste: string | null = null;
  if (faltante > 0) {
    idMovimientoAjuste = await repositorioMovimientos.insertar(ejecutor, {
      idRepuesto: consumo.idRepuesto,
      tipo: TIPO_MOVIMIENTO.AJUSTE,
      idBodegaOrigen: null,
      idBodegaDestino: bodega.id,
      cantidad: faltante,
      precioUnitario: Number(repuesto.precio),
      idOrden: consumo.idOrden,
      idResponsable: actor.id,
      justificacion:
        `Diferencia detectada al sincronizar: el tecnico instalo ${consumo.cantidad} unidad(es) de ` +
        `${repuesto.codigo} y en ${bodega.nombre} figuraban ${disponible}. Se repone(n) ${faltante} ` +
        'para registrar el consumo; queda por conciliar con el tecnico.',
      momentoDispositivo: consumo.momentoDispositivo,
      registradoSinConexion: true,
    });
    await repositorio.aplicarDelta(ejecutor, bodega.id, consumo.idRepuesto, faltante);
  }

  const precio = resolverPrecio(consumo.precioFirmado, Number(repuesto.precio));

  const idMovimiento = await repositorioMovimientos.insertar(ejecutor, {
    idRepuesto: consumo.idRepuesto,
    tipo: TIPO_MOVIMIENTO.CONSUMO,
    idBodegaOrigen: bodega.id,
    idBodegaDestino: null,
    cantidad: consumo.cantidad,
    // Prevalece el precio que el cliente firmo, no el del catalogo de hoy.
    precioUnitario: precio.precioQuePrevalece,
    idOrden: consumo.idOrden,
    idResponsable: actor.id,
    justificacion: null,
    momentoDispositivo: consumo.momentoDispositivo,
    registradoSinConexion: true,
  });

  const existenciaResultante = await repositorio.aplicarDelta(
    ejecutor, bodega.id, consumo.idRepuesto, -consumo.cantidad,
  );

  return {
    idMovimiento,
    faltanteAjustado: faltante,
    idMovimientoAjuste,
    precioAplicado: precio.precioQuePrevalece,
    diferenciaDePrecio: precio.diferencia,
    existenciaResultante,
  };
}
