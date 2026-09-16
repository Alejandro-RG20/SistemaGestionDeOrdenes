/**
 * Cuanto se le reclama al tercero.
 *
 * La regla del negocio es simple de enunciar y por eso mismo conviene que
 * este en un solo sitio: SE RECLAMA LO QUE LA REPARACION LE COSTO AL
 * TALLER, no una tarifa inventada.
 *
 *   monto = repuestos consumidos + mano de obra + cargo de visita
 *
 * Cada sumando sale de un dato real, no de un supuesto:
 *
 *  - REPUESTOS: los movimientos de consumo de esa orden, al PRECIO
 *    CONGELADO del movimiento (RN-22). No al precio de hoy: si el
 *    compresor subio de C$6000 a C$7000 despues de instalarlo, se reclama
 *    lo que costo entonces, que es lo que la factura respalda.
 *  - MANO DE OBRA: la de la cotizacion, cuando la hay.
 *  - CARGO DE VISITA: el que quedo congelado en la orden al abrirla, y solo
 *    si el servicio fue a domicilio. Cobrarle al fabricante un viaje que no
 *    se hizo es lo que hace que la marca deje de pagar los que si.
 *
 * LIMITE CONOCIDO. No existe una tarifa de mano de obra parametrizada en el
 * sistema. En una orden de garantia de proveedor rara vez hay cotizacion
 * —el cliente no autoriza lo que no paga—, asi que la mano de obra suele
 * quedar en cero y el reclamo se queda corto. Eso NO se disimula
 * inventando un valor: se devuelve `manoObra: 0` y la ficha lo dice, para
 * que la decision de parametrizar una tarifa la tome el negocio y no este
 * codigo.
 */
import { MODALIDAD_SERVICIO, type ModalidadServicio } from '@servitotal/compartido';

export interface InsumosDelReclamo {
  readonly modalidad: ModalidadServicio;
  /** Suma de cantidad x precio congelado de los consumos de la orden. */
  readonly totalRepuestos: number;
  /** Mano de obra de la cotizacion. Cero si no hay cotizacion. */
  readonly manoObra: number;
  /** Congelado en la orden al abrirla (RN-22). */
  readonly cargoVisita: number;
}

export interface DesgloseDelReclamo {
  readonly totalRepuestos: number;
  readonly manoObra: number;
  readonly cargoVisita: number;
  readonly total: number;
  /**
   * Lo que el gestor tiene que mirar antes de enviar. No bloquea: avisa.
   * Un expediente que sale corto se cobra corto, y ya no se corrige.
   */
  readonly advertencias: readonly string[];
}

/** Redondeo a dos decimales, que es como se factura en cordobas. */
function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function calcularReclamo(insumos: InsumosDelReclamo): DesgloseDelReclamo {
  // El cargo de visita solo aplica si hubo visita.
  const cargoVisita = insumos.modalidad === MODALIDAD_SERVICIO.RUTA
    ? Math.max(0, insumos.cargoVisita)
    : 0;
  const totalRepuestos = Math.max(0, insumos.totalRepuestos);
  const manoObra = Math.max(0, insumos.manoObra);

  const advertencias: string[] = [];
  if (manoObra === 0) {
    advertencias.push(
      'No hay mano de obra registrada: el expediente reclama solo repuestos y visita. ' +
      'Si el tecnico trabajo en este articulo, registre la cotizacion antes de enviarlo.',
    );
  }
  if (totalRepuestos === 0) {
    advertencias.push(
      'No hay repuestos consumidos en esta orden. Verifique que el tecnico los haya ' +
      'registrado: un consumo sin anotar es plata que el taller no recupera.',
    );
  }
  if (insumos.modalidad === MODALIDAD_SERVICIO.TALLER && insumos.cargoVisita > 0) {
    advertencias.push(
      'La orden es de taller y tiene cargo de visita congelado; no se incluye en el reclamo.',
    );
  }

  return {
    totalRepuestos: redondear(totalRepuestos),
    manoObra: redondear(manoObra),
    cargoVisita: redondear(cargoVisita),
    total: redondear(totalRepuestos + manoObra + cargoVisita),
    advertencias,
  };
}
