/**
 * Que reclasificaciones de garantia se permiten y cuales no.
 *
 * Del pliego:
 *  · de proveedor o adicional a particular, tras el diagnostico: si;
 *  · de particular a proveedor o adicional: solo si el cliente presenta el
 *    documento ANTES de la entrega;
 *  · despues de la entrega: ninguna.
 */
import { TIPO_GARANTIA, type TipoGarantia } from '@servitotal/compartido';

export const CAUSA_RECLASIFICACION = {
  /** La reevaluacion posterior al diagnostico la degrado. */
  DIAGNOSTICO: 'diagnostico',
  /** El cliente presento factura o poliza. */
  DOCUMENTO_PRESENTADO: 'documento_presentado',
  /** Correccion de un dato del articulo que estaba mal cargado. */
  CORRECCION_DE_DATOS: 'correccion_de_datos',
} as const;
export type CausaReclasificacion =
  (typeof CAUSA_RECLASIFICACION)[keyof typeof CAUSA_RECLASIFICACION];

export interface PeticionReclasificacion {
  readonly desde: TipoGarantia;
  readonly hacia: TipoGarantia;
  readonly causa: CausaReclasificacion;
  /** La orden ya se entrego al cliente. */
  readonly ordenEntregada: boolean;
  /** Se adjunto el documento que respalda la mejora de cobertura. */
  readonly tieneDocumentoDeRespaldo: boolean;
}

export interface VeredictoReclasificacion {
  readonly permitida: boolean;
  /** Motivo legible. Cuando se niega, dice que haria falta. */
  readonly motivo: string;
}

const COBERTURAS_CUBIERTAS: readonly TipoGarantia[] = [TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.ADICIONAL];

function mejora(desde: TipoGarantia, hacia: TipoGarantia): boolean {
  return desde === TIPO_GARANTIA.PARTICULAR && COBERTURAS_CUBIERTAS.includes(hacia);
}

function degrada(desde: TipoGarantia, hacia: TipoGarantia): boolean {
  return COBERTURAS_CUBIERTAS.includes(desde) && hacia === TIPO_GARANTIA.PARTICULAR;
}

export function evaluarReclasificacion(peticion: PeticionReclasificacion): VeredictoReclasificacion {
  const { desde, hacia } = peticion;

  if (desde === hacia) {
    return { permitida: false, motivo: 'La orden ya tiene ese tipo de garantia.' };
  }

  if (peticion.ordenEntregada) {
    return {
      permitida: false,
      motivo: 'La orden ya se entrego al cliente. Despues de la entrega no se reclasifica la garantia; ' +
        'si hay un error, adjunte una nota de correccion.',
    };
  }

  // Una orden levantada en campo entra como por_validar: confirmarla no es
  // reclasificar, es completar lo que quedo pendiente.
  if (desde === TIPO_GARANTIA.POR_VALIDAR) {
    return { permitida: true, motivo: 'Se confirma la cobertura de una orden levantada en campo.' };
  }

  if (hacia === TIPO_GARANTIA.POR_VALIDAR) {
    return {
      permitida: false,
      motivo: 'No se puede devolver una orden ya clasificada a "por validar".',
    };
  }

  if (degrada(desde, hacia)) {
    return { permitida: true, motivo: 'La reparacion pasa a cargo del cliente.' };
  }

  if (mejora(desde, hacia)) {
    if (peticion.causa === CAUSA_RECLASIFICACION.DIAGNOSTICO) {
      return {
        permitida: false,
        motivo: 'El diagnostico no mejora la cobertura por si solo. Hace falta que el cliente ' +
          'presente la factura o la poliza.',
      };
    }
    if (!peticion.tieneDocumentoDeRespaldo) {
      return {
        permitida: false,
        motivo: 'Para pasar la orden a garantia hace falta adjuntar la factura de compra o la ' +
          'poliza extendida.',
      };
    }
    return { permitida: true, motivo: 'El cliente presento el documento que respalda la cobertura.' };
  }

  // Entre proveedor y adicional: cambia quien paga, y eso tambien exige respaldo.
  if (!peticion.tieneDocumentoDeRespaldo) {
    return {
      permitida: false,
      motivo: 'Cambiar entre garantia del fabricante y poliza extendida exige adjuntar el documento ' +
        'que respalda la cobertura.',
    };
  }
  return { permitida: true, motivo: 'Se adjunto el documento que respalda la cobertura.' };
}
