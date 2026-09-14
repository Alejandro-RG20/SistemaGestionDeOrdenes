/**
 * Maquina de estados de la orden.
 *
 * Una transicion invalida falla con un error de dominio explicito que dice
 * a donde SI se puede ir. No hay un `if` disperso en ningun servicio que
 * decida lo mismo de otra manera.
 */
import { ESTADO_ORDEN, type EstadoOrden } from '@servitotal/compartido';
import type { ContextoTransicion } from './contexto-transicion.js';
import { TECNICO_ASIGNADO, definicionDe, type DefinicionEstado } from './estados.js';

export const CODIGO_TRANSICION = {
  ORDEN_CERRADA: 'ORDEN_CERRADA',
  TRANSICION_INVALIDA: 'TRANSICION_INVALIDA',
  NO_ES_RESPONSABLE: 'NO_ES_RESPONSABLE',
  REQUISITO_INCUMPLIDO: 'REQUISITO_INCUMPLIDO',
} as const;
export type CodigoTransicion = (typeof CODIGO_TRANSICION)[keyof typeof CODIGO_TRANSICION];

export interface VeredictoTransicion {
  readonly permitida: boolean;
  readonly codigo?: CodigoTransicion;
  readonly motivo?: string;
  /** Requisito concreto que fallo, para poder senalarlo en el panel. */
  readonly requisito?: string;
}

const PERMITIDA: VeredictoTransicion = { permitida: true };

/**
 * En cada estado la orden tiene un responsable unico y solo el la mueve.
 *
 * Se admiten tres formas de serlo: ser la persona anotada como responsable
 * actual, tener el rol que el estado designa, o —para anular y para cerrar—
 * tener el permiso de jefatura correspondiente. Lo ultimo no es una puerta
 * trasera: es que la jefatura pueda destrabar una orden cuando quien la
 * tenia no esta.
 */
function actorPuedeMover(contexto: ContextoTransicion, definicion: DefinicionEstado): boolean {
  const { actor, orden } = contexto;

  if (contexto.hacia === ESTADO_ORDEN.ANULADA && actor.puedeAnular) return true;
  if (contexto.hacia === ESTADO_ORDEN.CERRADA_SIN_REPARAR && actor.puedeCerrar) return true;
  if (orden.idResponsableActual !== null && orden.idResponsableActual === actor.id) return true;

  if (definicion.responsable === TECNICO_ASIGNADO) {
    return orden.idTecnico !== null && orden.idTecnico === actor.idTecnico;
  }
  return definicion.responsable !== null && definicion.responsable === actor.rol;
}

function explicarResponsable(definicion: DefinicionEstado): string {
  if (definicion.responsable === TECNICO_ASIGNADO) {
    return 'Esta orden la tiene el tecnico asignado; solo el puede moverla desde este estado.';
  }
  return `Esta orden la tiene ${definicion.responsable ?? 'nadie'}; ` +
    'solo esa persona puede moverla desde este estado.';
}

export function evaluarTransicion(contexto: ContextoTransicion): VeredictoTransicion {
  const definicion = definicionDe(contexto.orden.estado);

  if (definicion.esFinal) {
    return {
      permitida: false,
      codigo: CODIGO_TRANSICION.ORDEN_CERRADA,
      motivo: `La orden ${contexto.orden.numero} ya esta ${contexto.orden.estado} y no se edita. ` +
        'Si hay algo que corregir, adjunte una nota de correccion.',
    };
  }

  const transicion = definicion.transiciones.find((candidata) => candidata.hacia === contexto.hacia);
  if (transicion === undefined) {
    const posibles = definicion.transiciones.map((candidata) => candidata.hacia).join(', ');
    return {
      permitida: false,
      codigo: CODIGO_TRANSICION.TRANSICION_INVALIDA,
      motivo: `Una orden en ${contexto.orden.estado} no puede pasar a ${contexto.hacia}. ` +
        `Desde aqui solo se puede ir a: ${posibles}.`,
    };
  }

  if (!actorPuedeMover(contexto, definicion)) {
    return {
      permitida: false,
      codigo: CODIGO_TRANSICION.NO_ES_RESPONSABLE,
      motivo: explicarResponsable(definicion),
    };
  }

  for (const requisito of transicion.requisitos) {
    if (!requisito.seCumple(contexto)) {
      return {
        permitida: false,
        codigo: CODIGO_TRANSICION.REQUISITO_INCUMPLIDO,
        motivo: requisito.mensaje(contexto),
        requisito: requisito.nombre,
      };
    }
  }

  return PERMITIDA;
}

/** Destinos declarados desde un estado. Sirve para dibujar los botones del panel. */
export function destinosPosibles(estado: EstadoOrden): readonly EstadoOrden[] {
  return definicionDe(estado).transiciones.map((transicion) => transicion.hacia);
}

export function esEstadoFinal(estado: EstadoOrden): boolean {
  return definicionDe(estado).esFinal;
}

/** Momento de evidencia que hay que tener completo para salir del estado. */
export function momentoEvidenciaDe(estado: EstadoOrden): string | null {
  return definicionDe(estado).momentoEvidencia;
}
