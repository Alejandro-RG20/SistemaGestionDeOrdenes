/**
 * Patron Estado: los 13 estados de la orden, cada uno con su responsable,
 * su momento de evidencia y las transiciones que admite.
 *
 * ESTE ES EL UNICO LUGAR donde se declara que transiciones existen. Si una
 * transicion no aparece aqui, no ocurre: no hay un `if` en ningun servicio
 * que la deje pasar por la puerta de atras.
 *
 * Que `en_cola_taller` no tenga transicion hacia `en_ruta` es lo que hace
 * que una orden pueda ir de ruta a taller y nunca a la inversa.
 */
import {
  CODIGO_ROL, ESTADO_ORDEN, MOMENTO_EVIDENCIA,
  type CodigoRol, type EstadoOrden, type MomentoEvidencia,
} from '@servitotal/compartido';
import type { Requisito } from './requisitos.js';
import {
  cotizacionFueAceptada, esOrdenDeRuta, evidenciaObligatoriaCompleta, laPagaElCliente,
  repuestosLiberados, tieneCotizacionRegistrada, tieneDiagnosticoRegistrado,
  tieneMotivoEscrito, tieneTecnicoAsignado, tieneVisitaProgramada,
} from './requisitos.js';

/** Marca que el responsable no es un rol fijo sino el tecnico de la orden. */
export const TECNICO_ASIGNADO = 'tecnico_asignado';
export type ResponsableDeEstado = CodigoRol | typeof TECNICO_ASIGNADO | null;

export interface TransicionPermitida {
  readonly hacia: EstadoOrden;
  readonly requisitos: readonly Requisito[];
}

export interface DefinicionEstado {
  readonly estado: EstadoOrden;
  readonly esFinal: boolean;
  /** Momento cuya evidencia obligatoria hay que tener para SALIR del estado. */
  readonly momentoEvidencia: MomentoEvidencia | null;
  readonly responsable: ResponsableDeEstado;
  readonly transiciones: readonly TransicionPermitida[];
}

/** Anular esta disponible desde cualquier estado no final. */
const ANULAR: TransicionPermitida = {
  hacia: ESTADO_ORDEN.ANULADA,
  requisitos: [tieneMotivoEscrito],
};

/** Cerrar sin reparar exige haber diagnosticado: si no, no se sabe por que. */
const CERRAR_SIN_REPARAR: TransicionPermitida = {
  hacia: ESTADO_ORDEN.CERRADA_SIN_REPARAR,
  requisitos: [tieneDiagnosticoRegistrado],
};

const DEFINICIONES: readonly DefinicionEstado[] = [
  {
    estado: ESTADO_ORDEN.REGISTRADA,
    esFinal: false,
    momentoEvidencia: MOMENTO_EVIDENCIA.RECEPCION,
    responsable: CODIGO_ROL.AGENTE_TELEFONIA,
    transiciones: [
      { hacia: ESTADO_ORDEN.ASIGNADA, requisitos: [tieneTecnicoAsignado, evidenciaObligatoriaCompleta] },
      ANULAR,
    ],
  },
  {
    estado: ESTADO_ORDEN.ASIGNADA,
    esFinal: false,
    momentoEvidencia: MOMENTO_EVIDENCIA.VALIDACION_GARANTIA,
    responsable: CODIGO_ROL.JEFE_TECNICOS,
    transiciones: [
      {
        hacia: ESTADO_ORDEN.EN_RUTA,
        requisitos: [esOrdenDeRuta, tieneTecnicoAsignado, tieneVisitaProgramada, evidenciaObligatoriaCompleta],
      },
      { hacia: ESTADO_ORDEN.EN_COLA_TALLER, requisitos: [evidenciaObligatoriaCompleta] },
      ANULAR,
    ],
  },
  {
    estado: ESTADO_ORDEN.EN_RUTA,
    esFinal: false,
    momentoEvidencia: null,
    responsable: TECNICO_ASIGNADO,
    transiciones: [
      { hacia: ESTADO_ORDEN.EN_DIAGNOSTICO, requisitos: [] },
      // Conversion de ruta a taller: el articulo se traslada al centro.
      { hacia: ESTADO_ORDEN.EN_COLA_TALLER, requisitos: [] },
      ANULAR,
    ],
  },
  {
    estado: ESTADO_ORDEN.EN_COLA_TALLER,
    esFinal: false,
    momentoEvidencia: null,
    responsable: CODIGO_ROL.JEFE_TECNICOS,
    transiciones: [
      { hacia: ESTADO_ORDEN.EN_DIAGNOSTICO, requisitos: [tieneTecnicoAsignado] },
      ANULAR,
    ],
  },
  {
    estado: ESTADO_ORDEN.EN_DIAGNOSTICO,
    esFinal: false,
    momentoEvidencia: MOMENTO_EVIDENCIA.DIAGNOSTICO,
    responsable: TECNICO_ASIGNADO,
    transiciones: [
      {
        hacia: ESTADO_ORDEN.COTIZADA,
        requisitos: [tieneDiagnosticoRegistrado, evidenciaObligatoriaCompleta],
      },
      {
        hacia: ESTADO_ORDEN.ESPERANDO_REPUESTO,
        requisitos: [tieneDiagnosticoRegistrado, evidenciaObligatoriaCompleta],
      },
      {
        hacia: ESTADO_ORDEN.EN_REPARACION,
        requisitos: [tieneDiagnosticoRegistrado, evidenciaObligatoriaCompleta],
      },
      CERRAR_SIN_REPARAR,
      ANULAR,
    ],
  },
  {
    estado: ESTADO_ORDEN.COTIZADA,
    esFinal: false,
    momentoEvidencia: null,
    responsable: TECNICO_ASIGNADO,
    transiciones: [
      {
        hacia: ESTADO_ORDEN.ESPERANDO_AUTORIZACION,
        requisitos: [tieneCotizacionRegistrada, laPagaElCliente],
      },
      // Si la cubre la garantia, no hay nada que autorizar.
      { hacia: ESTADO_ORDEN.EN_REPARACION, requisitos: [tieneCotizacionRegistrada] },
      { hacia: ESTADO_ORDEN.ESPERANDO_REPUESTO, requisitos: [tieneCotizacionRegistrada] },
      CERRAR_SIN_REPARAR,
      ANULAR,
    ],
  },
  {
    estado: ESTADO_ORDEN.ESPERANDO_AUTORIZACION,
    esFinal: false,
    momentoEvidencia: null,
    responsable: CODIGO_ROL.AGENTE_TELEFONIA,
    transiciones: [
      { hacia: ESTADO_ORDEN.EN_REPARACION, requisitos: [cotizacionFueAceptada] },
      { hacia: ESTADO_ORDEN.ESPERANDO_REPUESTO, requisitos: [cotizacionFueAceptada] },
      CERRAR_SIN_REPARAR,
      ANULAR,
    ],
  },
  {
    estado: ESTADO_ORDEN.ESPERANDO_REPUESTO,
    esFinal: false,
    momentoEvidencia: null,
    responsable: CODIGO_ROL.BODEGUERO,
    transiciones: [
      { hacia: ESTADO_ORDEN.EN_REPARACION, requisitos: [repuestosLiberados] },
      CERRAR_SIN_REPARAR,
      ANULAR,
    ],
  },
  {
    estado: ESTADO_ORDEN.EN_REPARACION,
    esFinal: false,
    momentoEvidencia: MOMENTO_EVIDENCIA.REPARACION,
    responsable: TECNICO_ASIGNADO,
    transiciones: [
      { hacia: ESTADO_ORDEN.FINALIZADA, requisitos: [evidenciaObligatoriaCompleta] },
      // Apareció otra falla y hace falta otro repuesto.
      { hacia: ESTADO_ORDEN.ESPERANDO_REPUESTO, requisitos: [] },
      CERRAR_SIN_REPARAR,
      ANULAR,
    ],
  },
  {
    estado: ESTADO_ORDEN.FINALIZADA,
    esFinal: false,
    momentoEvidencia: MOMENTO_EVIDENCIA.ENTREGA,
    responsable: CODIGO_ROL.AGENTE_TELEFONIA,
    transiciones: [
      { hacia: ESTADO_ORDEN.ENTREGADA, requisitos: [evidenciaObligatoriaCompleta] },
      ANULAR,
    ],
  },
  { estado: ESTADO_ORDEN.ENTREGADA, esFinal: true, momentoEvidencia: null, responsable: null, transiciones: [] },
  { estado: ESTADO_ORDEN.CERRADA_SIN_REPARAR, esFinal: true, momentoEvidencia: null, responsable: null, transiciones: [] },
  { estado: ESTADO_ORDEN.ANULADA, esFinal: true, momentoEvidencia: null, responsable: null, transiciones: [] },
];

const POR_ESTADO = new Map<EstadoOrden, DefinicionEstado>(
  DEFINICIONES.map((definicion) => [definicion.estado, definicion]),
);

export function definicionDe(estado: EstadoOrden): DefinicionEstado {
  const definicion = POR_ESTADO.get(estado);
  if (definicion === undefined) {
    throw new Error(`El estado ${estado} no esta declarado en la maquina de estados.`);
  }
  return definicion;
}

export const TODOS_LOS_ESTADOS: readonly DefinicionEstado[] = DEFINICIONES;
