/**
 * Motor de garantias.
 *
 * Decide quien paga una reparacion a partir del ARTICULO y de la REGLA
 * vigente, nunca de los datos de contacto del cliente. No hay condicionales
 * fijos: las condiciones son especificaciones y los tipos de cobertura son
 * estrategias, y los numeros —meses, exclusiones, exigencia de tienda— se
 * leen de regla_cobertura.
 *
 * Es codigo puro: no consulta la base ni conoce el HTTP. Quien lo llama le
 * entrega el contexto ya armado.
 */
import { TIPO_GARANTIA, type TipoGarantia } from '@servitotal/compartido';
import { desglosar, type ParteEvaluada } from './especificacion.js';
import type { ContextoCobertura } from './contexto-cobertura.js';
import { ESTRATEGIAS_COBERTURA } from './estrategias-cobertura.js';
import { TODAS_LAS_CONDICIONES, fallaExcluidaPorLaRegla } from './especificaciones-cobertura.js';

export interface ResultadoCobertura {
  readonly tipo: TipoGarantia;
  /** Version de la regla aplicada: la orden la congela (RF-86). */
  readonly idReglaCobertura: string;
  /** Explicacion en lenguaje del taller, apta para mostrarse tal cual. */
  readonly motivo: string;
  /**
   * La reevaluacion posterior al diagnostico dejo la orden a cargo del
   * cliente. La orden se detiene hasta que acepte la cotizacion.
   */
  readonly detieneLaOrden: boolean;
  /** Condicion por condicion, para auditar una decision que sorprenda. */
  readonly desglose: readonly ParteEvaluada[];
}

/**
 * Evaluacion inicial, al crear la orden. Sin falla real todavia: solo
 * deciden la poliza, la tienda y la fecha de compra.
 */
export function evaluarCobertura(contexto: ContextoCobertura): ResultadoCobertura {
  const estrategia = ESTRATEGIAS_COBERTURA.find((candidata) => candidata.especificacion.seCumple(contexto));
  // `particular` se cumple siempre, asi que esto no puede quedar sin valor.
  if (estrategia === undefined) {
    throw new Error('Ninguna estrategia de cobertura se cumplio; revise ESTRATEGIAS_COBERTURA.');
  }

  return {
    tipo: estrategia.tipo,
    idReglaCobertura: contexto.regla.id,
    motivo: estrategia.explicacion(contexto),
    detieneLaOrden: false,
    desglose: desglosar(TODAS_LAS_CONDICIONES, contexto),
  };
}

/**
 * Reevaluacion tras el diagnostico, ya con la falla real.
 *
 * Si la falla esta excluida por la regla, la cobertura cae a `particular` y
 * la orden se detiene: el cliente no puede enterarse de que tiene que pagar
 * cuando el aparato ya esta desarmado y reparado.
 *
 * La reevaluacion nunca mejora la cobertura por su cuenta. Pasar de
 * `particular` a `proveedor` exige que el cliente presente un documento, y
 * eso es una reclasificacion explicita, no un efecto del diagnostico.
 */
export function reevaluarTrasDiagnostico(
  contexto: ContextoCobertura,
  tipoActual: TipoGarantia,
): ResultadoCobertura {
  const desglose = desglosar(TODAS_LAS_CONDICIONES, contexto);

  if (tipoActual === TIPO_GARANTIA.PARTICULAR) {
    return {
      tipo: TIPO_GARANTIA.PARTICULAR,
      idReglaCobertura: contexto.regla.id,
      motivo: 'La orden ya estaba a cargo del cliente; el diagnostico no la cambia.',
      detieneLaOrden: false,
      desglose,
    };
  }

  if (fallaExcluidaPorLaRegla.seCumple(contexto)) {
    return {
      tipo: TIPO_GARANTIA.PARTICULAR,
      idReglaCobertura: contexto.regla.id,
      motivo: `La falla encontrada esta excluida de la garantia (${contexto.fallaReal ?? ''}). ` +
        'La reparacion pasa a cargo del cliente y la orden queda detenida hasta que acepte la cotizacion.',
      detieneLaOrden: true,
      desglose,
    };
  }

  // La falla esta cubierta: se vuelve a resolver por si la evaluacion
  // inicial se hizo con datos que despues se corrigieron.
  // Llegados aqui, tipoActual no era `particular`: ese caso ya retorno
  // arriba. Asi que caer en `particular` ahora es siempre un empeoramiento,
  // y la orden se detiene.
  const nueva = evaluarCobertura(contexto);
  return { ...nueva, detieneLaOrden: nueva.tipo === TIPO_GARANTIA.PARTICULAR };
}

/**
 * Elige la regla mas especifica de las vigentes: marca y categoria, luego
 * categoria, luego marca, y por ultimo la general.
 *
 * Que la seleccion viva aqui y no en una consulta SQL es deliberado: es una
 * regla de negocio, y las reglas no viven en la base (regla de
 * arquitectura 4).
 */
export function elegirReglaAplicable<T extends { idMarca: string | null; idCategoria: string | null }>(
  reglasVigentes: readonly T[],
  idMarca: string,
  idCategoria: string,
): T | null {
  return (
    reglasVigentes.find((r) => r.idMarca === idMarca && r.idCategoria === idCategoria)
    ?? reglasVigentes.find((r) => r.idMarca === null && r.idCategoria === idCategoria)
    ?? reglasVigentes.find((r) => r.idMarca === idMarca && r.idCategoria === null)
    ?? reglasVigentes.find((r) => r.idMarca === null && r.idCategoria === null)
    ?? null
  );
}
