/**
 * Que reclasificaciones de garantia se permiten y cuales no.
 *
 * La garantia de una orden la elige una persona al registrarla. Cambiarla
 * despues es una RECLASIFICACION: la hace quien tiene permiso, con motivo
 * escrito, y queda en la bitacora con la clasificacion anterior y la nueva.
 * Aqui solo se decide si el cambio tiene sentido:
 *  · a la misma clasificacion: no hay nada que cambiar;
 *  · despues de cerrada la orden (entregada, cerrada sin reparar, anulada):
 *    ninguna, el expediente ya se presento; si hubo un error, nota de
 *    correccion;
 *  · de vuelta a "por validar": no, eso no es una clasificacion;
 *  · de proveedor o adicional a particular: no; se cierra la orden y se
 *    abre otra particular vinculada (exclusion confirmada);
 *  · hacia una garantia: solo si aplica a la fecha de recepcion (lo
 *    comprueba el servicio con los datos registrados);
 *  · desde "por validar" (orden levantada en campo): es confirmarla.
 *
 * Ni el diagnostico ni un cambio en la ficha del articulo reclasifican por
 * su cuenta.
 */
import { TIPO_GARANTIA, type TipoGarantia } from '@servitotal/compartido';

export interface PeticionReclasificacion {
  readonly desde: TipoGarantia;
  readonly hacia: TipoGarantia;
  /** La orden ya esta en un estado final. */
  readonly ordenCerrada: boolean;
}

export interface VeredictoReclasificacion {
  readonly permitida: boolean;
  /** Motivo legible. Cuando se niega, dice que haria falta. */
  readonly motivo: string;
}

export function evaluarReclasificacion(peticion: PeticionReclasificacion): VeredictoReclasificacion {
  const { desde, hacia } = peticion;

  if (desde === hacia) {
    return { permitida: false, motivo: 'La orden ya tiene ese tipo de garantia.' };
  }

  if (peticion.ordenCerrada) {
    return {
      permitida: false,
      motivo: 'La orden ya esta cerrada. Despues del cierre no se reclasifica la garantia; '
        + 'si hay un error, adjunte una nota de correccion.',
    };
  }

  if (hacia === TIPO_GARANTIA.POR_VALIDAR) {
    return {
      permitida: false,
      motivo: 'No se puede devolver una orden ya clasificada a "por validar".',
    };
  }

  // Una orden de garantia que deja de estar cubierta NO pasa a particular:
  // se cierra (cerrada sin reparar, con el motivo) y se abre una orden
  // particular nueva, vinculada a la original (servicio-exclusion).
  if (hacia === TIPO_GARANTIA.PARTICULAR
    && (desde === TIPO_GARANTIA.PROVEEDOR || desde === TIPO_GARANTIA.ADICIONAL)) {
    return {
      permitida: false,
      motivo: 'Una orden de garantia no se reclasifica a particular. Si la garantia no aplica, '
        + 'confirme la exclusion: la orden se cierra sin reparar y se abre una orden particular vinculada.',
    };
  }

  if (desde === TIPO_GARANTIA.POR_VALIDAR) {
    return { permitida: true, motivo: 'Se confirma la garantia de una orden levantada en campo.' };
  }

  return { permitida: true, motivo: 'Reclasificacion autorizada.' };
}
