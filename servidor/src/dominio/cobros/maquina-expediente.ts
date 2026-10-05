/**
 * Maquina de estados del expediente de cobro.
 *
 * Un expediente es la carpeta con la que el taller le cobra a un tercero
 * —el fabricante o la aseguradora de la poliza— una reparacion que el
 * cliente no pago. Su ciclo de vida es corto pero tiene una regla que el
 * pliego declara no negociable:
 *
 *   RF-57: UN EXPEDIENTE CON EVIDENCIA INCOMPLETA NO SE ENVIA.
 *
 * Y no es burocracia. Un expediente que sale sin la foto de la placa de
 * serie vuelve rechazado semanas despues, con el articulo ya entregado y la
 * evidencia imposible de conseguir; ahi el costo del repuesto se lo come el
 * taller. Bloquear antes de enviar es mas barato que reclamar dos veces.
 *
 * Igual que la de ordenes: una transicion invalida falla con un error que
 * dice a donde SI se puede ir, y no hay un `if` disperso decidiendo lo
 * mismo de otra manera en algun servicio.
 */
import { ESTADO_EXPEDIENTE, type EstadoExpediente } from '@servitotal/compartido';

export const CODIGO_EXPEDIENTE = {
  TRANSICION_INVALIDA: 'EXPEDIENTE_TRANSICION_INVALIDA',
  EVIDENCIA_INCOMPLETA: 'EXPEDIENTE_EVIDENCIA_INCOMPLETA',
  SIN_MONTO: 'EXPEDIENTE_SIN_MONTO',
  FALTA_RESULTADO: 'EXPEDIENTE_FALTA_RESULTADO',
  EXPEDIENTE_CERRADO: 'EXPEDIENTE_CERRADO',
} as const;
export type CodigoExpediente = (typeof CODIGO_EXPEDIENTE)[keyof typeof CODIGO_EXPEDIENTE];

export interface ContextoExpediente {
  readonly estado: EstadoExpediente;
  readonly hacia: EstadoExpediente;
  /** Ninguna evidencia obligatoria falta en la orden. */
  readonly evidenciaCompleta: boolean;
  readonly montoReclamado: number;
  /** Lo que el tercero acepto pagar. Obligatorio al marcar pagado. */
  readonly montoCobrado: number | null;
  /** Obligatorio al rechazar: sin el, nadie sabe que corregir. */
  readonly motivoRechazo: string | null;
}

export interface VeredictoExpediente {
  readonly permitida: boolean;
  readonly codigo?: CodigoExpediente;
  readonly motivo?: string;
}

const PERMITIDA: VeredictoExpediente = { permitida: true };

/**
 * El unico estado del que no se sale es 'cerrado'.
 *
 * 'pagado' dejo de ser final: un expediente cobrado todavia se cierra, y
 * ese cierre es el que separa la cartera viva de la archivada.
 */
export const ESTADOS_FINALES_EXPEDIENTE: readonly EstadoExpediente[] = [ESTADO_EXPEDIENTE.CERRADO];

const TRANSICIONES: Readonly<Record<EstadoExpediente, readonly EstadoExpediente[]>> = {
  [ESTADO_EXPEDIENTE.EN_CONFORMACION]: [
    ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR,
    ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA,
  ],
  // Se desbloquea solo cuando la evidencia aparece; volver a conformacion
  // permite corregir montos sin haber conseguido todavia las fotos.
  [ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA]: [
    ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR,
    ESTADO_EXPEDIENTE.EN_CONFORMACION,
  ],
  [ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR]: [
    ESTADO_EXPEDIENTE.ENVIADO,
    // Si al revisarlo se cae una evidencia, retrocede antes de salir.
    ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA,
    ESTADO_EXPEDIENTE.EN_CONFORMACION,
  ],
  [ESTADO_EXPEDIENTE.ENVIADO]: [
    ESTADO_EXPEDIENTE.ACEPTADO, ESTADO_EXPEDIENTE.RECHAZADO,
    // El proveedor pidio algo. No es un rechazo.
    ESTADO_EXPEDIENTE.OBSERVADO,
  ],
  /*
   * De una observacion se sale por donde se entro: se atiende lo que
   * pidieron y el expediente vuelve a conformacion para reenviarse, o el
   * proveedor acaba rechazandolo.
   */
  [ESTADO_EXPEDIENTE.OBSERVADO]: [
    ESTADO_EXPEDIENTE.EN_CONFORMACION, ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR,
    ESTADO_EXPEDIENTE.RECHAZADO,
  ],
  [ESTADO_EXPEDIENTE.ACEPTADO]: [ESTADO_EXPEDIENTE.PAGADO],
  // Un rechazo no es el final: se corrige lo que senalo el tercero y se
  // vuelve a presentar. Eso es plata que de otro modo se pierde. Y cuando ya
  // no hay nada que corregir, se cierra asumiendo que no se cobra.
  [ESTADO_EXPEDIENTE.RECHAZADO]: [
    ESTADO_EXPEDIENTE.EN_CONFORMACION, ESTADO_EXPEDIENTE.CERRADO,
  ],
  [ESTADO_EXPEDIENTE.PAGADO]: [ESTADO_EXPEDIENTE.CERRADO],
  [ESTADO_EXPEDIENTE.CERRADO]: [],
};

export function destinosPosibles(estado: EstadoExpediente): readonly EstadoExpediente[] {
  return TRANSICIONES[estado] ?? [];
}

export function evaluarTransicion(contexto: ContextoExpediente): VeredictoExpediente {
  if (ESTADOS_FINALES_EXPEDIENTE.includes(contexto.estado)) {
    return {
      permitida: false,
      codigo: CODIGO_EXPEDIENTE.EXPEDIENTE_CERRADO,
      motivo: 'Este expediente ya esta pagado y no se modifica.',
    };
  }

  const posibles = destinosPosibles(contexto.estado);
  if (!posibles.includes(contexto.hacia)) {
    return {
      permitida: false,
      codigo: CODIGO_EXPEDIENTE.TRANSICION_INVALIDA,
      motivo: `Un expediente en ${contexto.estado} no puede pasar a ${contexto.hacia}. ` +
        `Desde aqui solo se puede ir a: ${posibles.join(', ') || 'ningun estado'}.`,
    };
  }

  // RF-57: la regla que existe todo este modulo para hacer cumplir.
  if (contexto.hacia === ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR && !contexto.evidenciaCompleta) {
    return {
      permitida: false,
      codigo: CODIGO_EXPEDIENTE.EVIDENCIA_INCOMPLETA,
      motivo: 'A la orden le falta evidencia obligatoria. Un expediente incompleto vuelve ' +
        'rechazado con el articulo ya entregado, y ahi el repuesto se lo come el taller.',
    };
  }

  if (contexto.hacia === ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR && contexto.montoReclamado <= 0) {
    return {
      permitida: false,
      codigo: CODIGO_EXPEDIENTE.SIN_MONTO,
      motivo: 'El expediente no reclama nada. Verifique los consumos y la mano de obra ' +
        'antes de enviarlo: un reclamo en cero se archiva sin leerlo.',
    };
  }

  if (contexto.hacia === ESTADO_EXPEDIENTE.RECHAZADO
    && (contexto.motivoRechazo === null || contexto.motivoRechazo.trim() === '')) {
    return {
      permitida: false,
      codigo: CODIGO_EXPEDIENTE.FALTA_RESULTADO,
      motivo: 'Anote por que lo rechazaron. Sin el motivo nadie sabe que corregir para ' +
        'volver a presentarlo, y el reclamo se pierde.',
    };
  }

  if (contexto.hacia === ESTADO_EXPEDIENTE.PAGADO
    && (contexto.montoCobrado === null || contexto.montoCobrado < 0)) {
    return {
      permitida: false,
      codigo: CODIGO_EXPEDIENTE.FALTA_RESULTADO,
      motivo: 'Indique cuanto pagaron. La diferencia entre lo reclamado y lo cobrado es el ' +
        'indicador que mide si al taller le conviene reclamarle a esa marca.',
    };
  }

  return PERMITIDA;
}

/** El estado que corresponde segun la evidencia, sin pedirlo. */
export function estadoSegunEvidencia(
  estado: EstadoExpediente, evidenciaCompleta: boolean,
): EstadoExpediente {
  if (estado === ESTADO_EXPEDIENTE.EN_CONFORMACION && !evidenciaCompleta) {
    return ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA;
  }
  if (estado === ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA && evidenciaCompleta) {
    return ESTADO_EXPEDIENTE.EN_CONFORMACION;
  }
  return estado;
}
