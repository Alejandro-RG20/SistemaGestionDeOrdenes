/**
 * Evaluacion de cobertura PROVISIONAL, solo para dar valores coherentes a
 * los datos de prueba.
 *
 * El motor real —patrones Especificacion y Estrategia sobre regla_cobertura,
 * con reevaluacion tras el diagnostico y detencion de la orden— es materia
 * de la ETAPA 3. Esto no lo sustituye ni debe importarse fuera de la
 * siembra: reproduce el algoritmo del pliego lo justo para que las 30 000
 * ordenes tengan un tipo_garantia y una id_regla_cobertura defendibles.
 */
import { TIPO_GARANTIA, type TipoGarantia } from '@servitotal/compartido';
import { reglaAplicable } from './paso-coberturas.js';
import type { ContextoSiembra, ReferenciaArticulo, ReferenciaReglaCobertura } from './contexto.js';

export interface CoberturaEvaluada {
  readonly tipo: TipoGarantia;
  readonly regla: ReferenciaReglaCobertura;
}

function mesesTranscurridos(desde: Date, hasta: Date): number {
  return (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth());
}

/**
 * 1. Poliza extendida vigente -> adicional.
 * 2. Tienda del grupo y fecha de compra dentro de los meses de la regla -> proveedor.
 * 3. En cualquier otro caso -> particular.
 */
export function evaluarCobertura(
  contexto: ContextoSiembra,
  articulo: ReferenciaArticulo,
  momento: Date,
): CoberturaEvaluada {
  const regla = reglaAplicable(contexto, articulo.idMarca, articulo.idCategoria);

  if (articulo.tienePolizaVigente) {
    return { tipo: TIPO_GARANTIA.ADICIONAL, regla };
  }

  const tienda = contexto.tiendas.find((t) => t.id === articulo.idTienda);
  const dentroDePlazo =
    articulo.fechaCompra !== null &&
    mesesTranscurridos(articulo.fechaCompra, momento) < regla.mesesCobertura;

  if (dentroDePlazo && (!regla.exigeTiendaGrupo || tienda?.perteneceAlGrupo === true)) {
    return { tipo: TIPO_GARANTIA.PROVEEDOR, regla };
  }

  return { tipo: TIPO_GARANTIA.PARTICULAR, regla };
}

/**
 * Reevaluacion tras el diagnostico: si la falla real esta excluida por la
 * regla, la cobertura cae a particular. La detencion de la orden que eso
 * provoca la implementa la etapa 3; aqui solo se refleja el resultado.
 */
export function reevaluarTrasDiagnostico(
  evaluacion: CoberturaEvaluada,
  fallaReal: string,
): TipoGarantia {
  if (evaluacion.tipo === TIPO_GARANTIA.PARTICULAR) return evaluacion.tipo;
  const excluida = evaluacion.regla.fallasExcluidas.some((falla) =>
    fallaReal.toLowerCase().includes(falla.replace(/_/g, ' ')),
  );
  return excluida ? TIPO_GARANTIA.PARTICULAR : evaluacion.tipo;
}
