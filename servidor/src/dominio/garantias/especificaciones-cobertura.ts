/**
 * Las condiciones del negocio, una por una. Ninguna consulta la base ni
 * conoce el HTTP: son funciones puras sobre el contexto.
 *
 * Solo informan. Ninguna cambia por si sola la garantia de una orden: la
 * elige quien la registra y la reclasifica, con motivo, quien tiene permiso.
 */
import { TIPO_GARANTIA } from '@servitotal/compartido';
import { especificacion, type Especificacion } from './especificacion.js';
import { mesesTranscurridos, type ContextoCobertura } from './contexto-cobertura.js';

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
    && cubreElDia(poliza.vigenteDesde, poliza.vigenteHasta, contexto.momento)
    // Una poliza sin contratante anotado se considera del comprador
    // registrado, que es a quien pertenece la ficha del articulo.
    && (poliza.idClienteContratante ?? contexto.articulo.idCliente) === contexto.idClienteSolicitante),
);

/** La regla puede no exigir tienda del grupo; entonces esta condicion sobra. */
export const cumpleLaExigenciaDeTienda: EspecificacionCobertura = especificacion(
  'se cumple la exigencia de tienda que pide la regla vigente',
  (contexto) => contexto.regla === null || !contexto.regla.exigeTiendaGrupo || contexto.articulo.tiendaPerteneceAlGrupo,
);

/**
 * La compra esta dentro de los meses de cobertura de la regla de
 * referencia. Sin fecha de compra, o sin regla que diga cuantos meses, no
 * se puede afirmar que este dentro de plazo.
 */
export const dentroDelPlazoDeFabrica: EspecificacionCobertura = especificacion(
  'la garantia del fabricante esta vigente (fecha registrada en el articulo o meses de la regla)',
  (contexto) => {
    // Si un usuario autorizado registro en la ficha del articulo la
    // garantia del proveedor con sus fechas, manda esa: es el dato del
    // documento. Si no hay ninguna registrada, se calcula como siempre,
    // con la fecha de compra y los meses de la regla vigente.
    const registradas = garantiasDeProveedorRegistradas(contexto);
    if (registradas.length > 0) {
      return registradas.some((poliza) => cubreElDia(poliza.vigenteDesde, poliza.vigenteHasta, contexto.momento));
    }
    return contexto.articulo.fechaCompra !== null
      && contexto.regla !== null
      && mesesTranscurridos(contexto.articulo.fechaCompra, contexto.momento) < contexto.regla.mesesCobertura;
  },
);

/** Garantias de proveedor activas registradas a mano en la ficha del articulo. */
export function garantiasDeProveedorRegistradas(contexto: ContextoCobertura) {
  return contexto.polizas.filter((poliza) => poliza.activa && poliza.tipo === TIPO_GARANTIA.PROVEEDOR);
}

/**
 * La cobertura incluye el dia de `momento`. Las vigencias son fechas de
 * calendario: el ultimo dia cuenta entero. Antes se comparaba contra la
 * medianoche del ultimo dia, y una poliza dejaba de valer a las 00:00 del
 * dia en que todavia estaba vigente.
 */
export function cubreElDia(desde: Date, hasta: Date, momento: Date): boolean {
  const dia = momento.toISOString().slice(0, 10);
  return desde.toISOString().slice(0, 10) <= dia && hasta.toISOString().slice(0, 10) >= dia;
}
