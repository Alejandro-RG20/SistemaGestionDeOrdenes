/**
 * Reparto de las 30 000 ordenes entre los 13 estados y construccion de la
 * cadena de estados por la que paso cada una.
 *
 * El reparto imita un ano de operacion: la enorme mayoria de las ordenes ya
 * se cerro y solo una fraccion sigue viva. 1 500 ordenes activas sobre una
 * carga de 80 a 150 diarias son unos doce dias de trabajo en curso.
 */
import { ESTADO_ORDEN, type EstadoOrden } from '@servitotal/compartido';
import type { Aleatorio } from './aleatorio.js';

export const CANTIDAD_ORDENES = 30_000;

export const REPARTO_ESTADOS: Readonly<Record<EstadoOrden, number>> = {
  [ESTADO_ORDEN.ENTREGADA]: 24_000,
  [ESTADO_ORDEN.CERRADA_SIN_REPARAR]: 3_000,
  [ESTADO_ORDEN.ANULADA]: 1_500,
  [ESTADO_ORDEN.REGISTRADA]: 210,
  [ESTADO_ORDEN.ASIGNADA]: 180,
  [ESTADO_ORDEN.EN_RUTA]: 120,
  [ESTADO_ORDEN.EN_COLA_TALLER]: 150,
  [ESTADO_ORDEN.EN_DIAGNOSTICO]: 180,
  [ESTADO_ORDEN.COTIZADA]: 105,
  [ESTADO_ORDEN.ESPERANDO_AUTORIZACION]: 135,
  [ESTADO_ORDEN.ESPERANDO_REPUESTO]: 270,
  [ESTADO_ORDEN.EN_REPARACION]: 105,
  [ESTADO_ORDEN.FINALIZADA]: 45,
};

/** Lista de 30 000 estados objetivo, barajada para que no queden agrupados. */
export function construirObjetivos(azar: Aleatorio): EstadoOrden[] {
  const objetivos: EstadoOrden[] = [];
  for (const [estado, cantidad] of Object.entries(REPARTO_ESTADOS)) {
    for (let i = 0; i < cantidad; i += 1) objetivos.push(estado as EstadoOrden);
  }
  return azar.barajar(objetivos);
}

/** Estados por los que se puede pasar de largo cuando no son el destino. */
const OMISIBLES: readonly EstadoOrden[] = [
  ESTADO_ORDEN.COTIZADA,
  ESTADO_ORDEN.ESPERANDO_AUTORIZACION,
  ESTADO_ORDEN.ESPERANDO_REPUESTO,
];

const TRONCO_COMUN: readonly EstadoOrden[] = [
  ESTADO_ORDEN.EN_DIAGNOSTICO,
  ESTADO_ORDEN.COTIZADA,
  ESTADO_ORDEN.ESPERANDO_AUTORIZACION,
  ESTADO_ORDEN.ESPERANDO_REPUESTO,
  ESTADO_ORDEN.EN_REPARACION,
  ESTADO_ORDEN.FINALIZADA,
  ESTADO_ORDEN.ENTREGADA,
];

/**
 * Recorrido completo posible segun la modalidad. Una orden convertida pasa
 * por en_ruta y despues por en_cola_taller: conserva su historial (RN de
 * conversion ruta -> taller, nunca a la inversa).
 */
function recorridoCompleto(nacioEnRuta: boolean, convertida: boolean): EstadoOrden[] {
  const inicio: EstadoOrden[] = [ESTADO_ORDEN.REGISTRADA, ESTADO_ORDEN.ASIGNADA];
  if (nacioEnRuta) {
    inicio.push(ESTADO_ORDEN.EN_RUTA);
    if (convertida) inicio.push(ESTADO_ORDEN.EN_COLA_TALLER);
  } else {
    inicio.push(ESTADO_ORDEN.EN_COLA_TALLER);
  }
  return [...inicio, ...TRONCO_COMUN];
}

export interface CadenaOrden {
  readonly estados: readonly EstadoOrden[];
  readonly nacioEnRuta: boolean;
  readonly convertida: boolean;
}

/**
 * Cadena de estados recorrida hasta llegar al estado objetivo.
 * `anulada` y `cerrada_sin_reparar` cortan el recorrido en un punto
 * verosimil y se agregan al final.
 */
export function construirCadena(azar: Aleatorio, objetivo: EstadoOrden): CadenaOrden {
  const esCierreAnticipado =
    objetivo === ESTADO_ORDEN.ANULADA || objetivo === ESTADO_ORDEN.CERRADA_SIN_REPARAR;

  // Una orden detenida en en_ruta nacio necesariamente en ruta.
  const nacioEnRuta = objetivo === ESTADO_ORDEN.EN_RUTA || azar.booleano(0.28);

  // Solo una orden que nacio en ruta y que avanzo mas alla puede convertirse.
  // Si el destino es en_cola_taller y nacio en ruta, la conversion ya ocurrio.
  const convertida =
    nacioEnRuta &&
    objetivo !== ESTADO_ORDEN.EN_RUTA &&
    (objetivo === ESTADO_ORDEN.EN_COLA_TALLER || azar.booleano(0.35));
  const completo = recorridoCompleto(nacioEnRuta, convertida);

  let corte: number;
  if (esCierreAnticipado) {
    const maximo = objetivo === ESTADO_ORDEN.ANULADA
      ? completo.indexOf(ESTADO_ORDEN.ESPERANDO_AUTORIZACION)
      : completo.indexOf(ESTADO_ORDEN.EN_REPARACION);
    corte = azar.entero(1, Math.max(1, maximo));
  } else {
    const posicion = completo.indexOf(objetivo);
    if (posicion < 0) {
      throw new Error(`El estado ${objetivo} no aparece en el recorrido generado.`);
    }
    corte = posicion;
  }

  const recorrido = completo.slice(0, corte + 1).filter((estado, indice) => {
    if (indice === corte && !esCierreAnticipado) return true;
    return !OMISIBLES.includes(estado) || azar.booleano(0.45);
  });

  // No se puede esperar la autorizacion de una cotizacion que no existe.
  const posicionEspera = recorrido.indexOf(ESTADO_ORDEN.ESPERANDO_AUTORIZACION);
  if (posicionEspera >= 0 && !recorrido.includes(ESTADO_ORDEN.COTIZADA)) {
    recorrido.splice(posicionEspera, 0, ESTADO_ORDEN.COTIZADA);
  }

  if (esCierreAnticipado) recorrido.push(objetivo);

  // La conversion es un hecho del recorrido, no una intencion: solo cuenta si
  // la orden llego efectivamente a la cola del taller despues de estar en ruta.
  // Una orden que aun esta en `registrada` sigue siendo de modalidad ruta.
  const convertidaDeVerdad =
    recorrido.includes(ESTADO_ORDEN.EN_RUTA) && recorrido.includes(ESTADO_ORDEN.EN_COLA_TALLER);

  return { estados: recorrido, nacioEnRuta, convertida: convertidaDeVerdad };
}
