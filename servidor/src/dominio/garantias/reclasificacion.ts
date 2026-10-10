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

  if (desde === TIPO_GARANTIA.POR_VALIDAR) {
    return { permitida: true, motivo: 'Se confirma la garantia de una orden levantada en campo.' };
  }

  return { permitida: true, motivo: 'Reclasificacion autorizada.' };
}
