/**
 * Las condiciones del negocio, una por una. Ninguna consulta la base ni
 * conoce el HTTP: son funciones puras sobre el contexto.
 */
import { TIPO_GARANTIA } from '@servitotal/compartido';
import { especificacion, type Especificacion } from './especificacion.js';
import { mesesTranscurridos, normalizar, type ContextoCobertura } from './contexto-cobertura.js';

type EspecificacionCobertura = Especificacion<ContextoCobertura>;

/**
 * Quien pide el servicio es la persona a cuyo nombre esta el articulo.
 *
 * Es la condicion que impide que la garantia viaje con el aparato de
 * segunda mano: las tiendas del grupo venden a cliente final y tanto la
 * cobertura de fabrica como la poliza son de esa persona.
 */
export const esElCompradorRegistrado: EspecificacionCobertura = especificacion(
  'quien solicita el servicio es el comprador registrado del articulo',
  (contexto) => contexto.idClienteSolicitante === contexto.articulo.idCliente,
);

/**
 * Hay una poliza extendida activa, vigente al momento de la evaluacion y
 * contratada por quien pide el servicio.
 */
export const tienePolizaExtendidaVigente: EspecificacionCobertura = especificacion(
  'el articulo tiene una poliza extendida vigente a nombre de quien solicita',
  (contexto) => contexto.polizas.some((poliza) =>
    poliza.activa
    && poliza.tipo === TIPO_GARANTIA.ADICIONAL
    && poliza.vigenteDesde.getTime() <= contexto.momento.getTime()
    && poliza.vigenteHasta.getTime() >= contexto.momento.getTime()
    // Una poliza sin contratante anotado se considera del comprador
    // registrado, que es a quien pertenece la ficha del articulo.
    && (poliza.idClienteContratante ?? contexto.articulo.idCliente) === contexto.idClienteSolicitante),
);

export const compradoEnTiendaDelGrupo: EspecificacionCobertura = especificacion(
  'el articulo se compro en una tienda del grupo',
  (contexto) => contexto.articulo.tiendaPerteneceAlGrupo,
);

/** La regla puede no exigir tienda del grupo; entonces esta condicion sobra. */
export const cumpleLaExigenciaDeTienda: EspecificacionCobertura = especificacion(
  'se cumple la exigencia de tienda que pide la regla vigente',
  (contexto) => !contexto.regla.exigeTiendaGrupo || contexto.articulo.tiendaPerteneceAlGrupo,
);

export const tieneFechaDeCompra: EspecificacionCobertura = especificacion(
  'el articulo tiene fecha de compra registrada',
  (contexto) => contexto.articulo.fechaCompra !== null,
);

/**
 * La compra esta dentro de los meses de cobertura de la regla vigente.
 * Un articulo sin fecha de compra no puede estar dentro de plazo: sin ese
 * dato no hay como sostener el reclamo ante el fabricante.
 */
export const dentroDelPlazoDeFabrica: EspecificacionCobertura = especificacion(
  'la fecha de compra esta dentro de los meses de cobertura de la regla',
  (contexto) => contexto.articulo.fechaCompra !== null
    && mesesTranscurridos(contexto.articulo.fechaCompra, contexto.momento) < contexto.regla.mesesCobertura,
);

/**
 * La falla real del diagnostico esta excluida por la regla.
 *
 * Se compara normalizando ambos lados: la regla guarda
 * `sobrecarga_electrica` y el tecnico escribe "Sobrecarga electrica en la
 * tarjeta". Sin fallaReal —evaluacion inicial, antes del diagnostico— la
 * condicion no se cumple: todavia no hay nada que excluir.
 */
export const fallaExcluidaPorLaRegla: EspecificacionCobertura = especificacion(
  'la falla real esta excluida por la regla de cobertura',
  (contexto) => {
    if (contexto.fallaReal === undefined || contexto.fallaReal.trim() === '') return false;
    const falla = normalizar(contexto.fallaReal);
    return contexto.regla.fallasExcluidas.some((excluida) => {
      const patron = normalizar(excluida);
      return patron !== '' && falla.includes(patron);
    });
  },
);

/** Todas las condiciones, para poder desglosar una decision y explicarla. */
export const TODAS_LAS_CONDICIONES: readonly EspecificacionCobertura[] = [
  esElCompradorRegistrado,
  tienePolizaExtendidaVigente,
  compradoEnTiendaDelGrupo,
  cumpleLaExigenciaDeTienda,
  tieneFechaDeCompra,
  dentroDelPlazoDeFabrica,
  fallaExcluidaPorLaRegla,
];
