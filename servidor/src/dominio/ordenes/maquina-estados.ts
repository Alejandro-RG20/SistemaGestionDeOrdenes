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
/**
 * Pasos de despacho: los que decide quien asigna tecnicos. Antes «asignada»
 * solo la movia el rol jefe_tecnicos, y el gestor de tecnicos —que es
 * quien asigna— se encontraba con «esta orden la tiene jefe_tecnicos» al
 * querer mandarla a ruta. Los requisitos (tecnico, visita, evidencia) se
 * siguen exigiendo igual.
 */
const PASOS_DE_DESPACHO: ReadonlyArray<readonly [EstadoOrden, EstadoOrden]> = [
  [ESTADO_ORDEN.REGISTRADA, ESTADO_ORDEN.ASIGNADA],
  [ESTADO_ORDEN.ASIGNADA, ESTADO_ORDEN.EN_RUTA],
  [ESTADO_ORDEN.ASIGNADA, ESTADO_ORDEN.EN_COLA_TALLER],
  [ESTADO_ORDEN.EN_COLA_TALLER, ESTADO_ORDEN.EN_DIAGNOSTICO],
  [ESTADO_ORDEN.AUTORIZADA, ESTADO_ORDEN.ASIGNADA],
];

function esPasoDeDespacho(desde: EstadoOrden, hacia: EstadoOrden): boolean {
  return PASOS_DE_DESPACHO.some(([origen, destino]) => origen === desde && destino === hacia);
}

function actorPuedeMover(contexto: ContextoTransicion, definicion: DefinicionEstado): boolean {
  const { actor, orden } = contexto;

  // El administrador del sistema pasa la regla del responsable de turno.
  // Los requisitos —evidencia, diagnostico, autorizacion, repuestos— se le
  // exigen igual que a cualquiera: esto no es un atajo del flujo.
  if (actor.esAdministrador) return true;

  // Autorizar es un acto de quien registra la decision comercial, y SOLO
  // de el: ni el responsable del estado sin ese permiso puede hacerlo.
  if (contexto.hacia === ESTADO_ORDEN.AUTORIZADA) return actor.puedeAutorizar;

  if (contexto.hacia === ESTADO_ORDEN.ANULADA && actor.puedeAnular) return true;
  if (contexto.hacia === ESTADO_ORDEN.CERRADA_SIN_REPARAR && actor.puedeCerrar) return true;
  // El requisito del acta impide que esto sea un atajo: solo se llega por la
  // entrega registrada, que antes comprueba revision y autorizacion.
  if (contexto.hacia === ESTADO_ORDEN.ENTREGADA && actor.puedeEntregar) return true;
  if (orden.idResponsableActual !== null && orden.idResponsableActual === actor.id) return true;
  if (actor.puedeAsignar && esPasoDeDespacho(orden.estado, contexto.hacia)) return true;

  if (definicion.responsable === TECNICO_ASIGNADO) {
    return orden.idTecnico !== null && orden.idTecnico === actor.idTecnico;
  }
  return definicion.responsable !== null && definicion.responsable === actor.rol;
}

const NOMBRE_RESPONSABLE: Readonly<Record<string, string>> = {
  agente_telefonia: 'el agente telefonico',
  jefe_tecnicos: 'la jefatura de tecnicos',
  bodeguero: 'bodega',
  jefe_atencion_cliente: 'la jefatura de atencion al cliente',
};

function explicarResponsable(definicion: DefinicionEstado, hacia: EstadoOrden): string {
  if (hacia === ESTADO_ORDEN.AUTORIZADA) {
    return 'Autorizar la orden corresponde a quien registra la decision comercial del cliente '
      + '(permiso «Registrar la aceptacion del cliente»).';
  }
  if (definicion.responsable === TECNICO_ASIGNADO) {
    return 'Esta orden la tiene el tecnico asignado; solo el puede moverla desde este estado.';
  }
  const quien = definicion.responsable === null
    ? 'nadie'
    : NOMBRE_RESPONSABLE[definicion.responsable] ?? definicion.responsable.replace(/_/g, ' ');
  return `En este estado la orden la mueve ${quien} (o quien la tenga a su cargo). `
    + 'Su perfil no puede dar este paso.';
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
      motivo: explicarResponsable(definicion, contexto.hacia),
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
