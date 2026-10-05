/**
 * El recorrido de una solicitud de repuesto (pliego §26).
 *
 * Seis pasos y dos salidas. Vive en `compartido` porque el panel tiene que
 * saber que boton ofrecer en cada paso y el servidor tiene que rechazar el
 * paso que no corresponde; si cada uno lo supiera por su cuenta, tarde o
 * temprano el panel ofreceria un boton que la API no acepta.
 */
export const ESTADO_SOLICITUD = {
  SOLICITADA: 'solicitada',
  EN_REVISION: 'en_revision',
  APROBADA: 'aprobada',
  RECHAZADA: 'rechazada',
  PREPARADA: 'preparada',
  ENTREGADA: 'entregada',
  RECIBIDA: 'recibida',
  ANULADA: 'anulada',
} as const;
export type EstadoSolicitud = (typeof ESTADO_SOLICITUD)[keyof typeof ESTADO_SOLICITUD];

/**
 * Quien da cada paso. No es decoracion: el §65 pide separacion de
 * funciones, y aqui se concreta en que el tecnico no se aprueba su propia
 * solicitud ni declara que bodega se la entrego.
 */
export const RESPONSABLE_DEL_PASO = {
  [ESTADO_SOLICITUD.EN_REVISION]: 'inventario.solicitud.gestionar',
  [ESTADO_SOLICITUD.APROBADA]: 'inventario.solicitud.gestionar',
  [ESTADO_SOLICITUD.RECHAZADA]: 'inventario.solicitud.gestionar',
  [ESTADO_SOLICITUD.PREPARADA]: 'inventario.solicitud.gestionar',
  [ESTADO_SOLICITUD.ENTREGADA]: 'inventario.despacho.registrar',
  // La recibe el tecnico: es el unico que sabe si de verdad la tiene en la
  // mano. Que bodega marque «recibida» es justo lo que esta regla evita.
  [ESTADO_SOLICITUD.RECIBIDA]: 'inventario.consumo.registrar',
  [ESTADO_SOLICITUD.ANULADA]: 'inventario.solicitud.gestionar',
} as const;

const TRANSICIONES: Readonly<Record<EstadoSolicitud, readonly EstadoSolicitud[]>> = {
  [ESTADO_SOLICITUD.SOLICITADA]: [
    ESTADO_SOLICITUD.EN_REVISION, ESTADO_SOLICITUD.ANULADA,
  ],
  [ESTADO_SOLICITUD.EN_REVISION]: [
    ESTADO_SOLICITUD.APROBADA, ESTADO_SOLICITUD.RECHAZADA, ESTADO_SOLICITUD.ANULADA,
  ],
  [ESTADO_SOLICITUD.APROBADA]: [
    ESTADO_SOLICITUD.PREPARADA, ESTADO_SOLICITUD.ANULADA,
  ],
  // Un rechazo no es el final del camino: bodega puede rechazar la pieza
  // equivocada y el tecnico corregir la solicitud, que vuelve a revision.
  [ESTADO_SOLICITUD.RECHAZADA]: [ESTADO_SOLICITUD.EN_REVISION],
  [ESTADO_SOLICITUD.PREPARADA]: [
    ESTADO_SOLICITUD.ENTREGADA, ESTADO_SOLICITUD.ANULADA,
  ],
  // Entregada pero no recibida es una situacion real y hay que poder verla:
  // bodega lo saco y el tecnico no paso a recogerlo.
  [ESTADO_SOLICITUD.ENTREGADA]: [ESTADO_SOLICITUD.RECIBIDA],
  [ESTADO_SOLICITUD.RECIBIDA]: [],
  [ESTADO_SOLICITUD.ANULADA]: [],
};

export function destinosDeSolicitud(estado: EstadoSolicitud): readonly EstadoSolicitud[] {
  return TRANSICIONES[estado] ?? [];
}

export function solicitudPuedeMoverseA(
  desde: EstadoSolicitud, hacia: EstadoSolicitud,
): boolean {
  return destinosDeSolicitud(desde).includes(hacia);
}

/** Los pasos que exigen un motivo escrito. Un rechazo sin motivo no sirve. */
export const PASOS_CON_MOTIVO: readonly EstadoSolicitud[] = [
  ESTADO_SOLICITUD.RECHAZADA, ESTADO_SOLICITUD.ANULADA,
];

/** La solicitud ya no se mueve mas. */
export function solicitudCerrada(estado: EstadoSolicitud): boolean {
  return destinosDeSolicitud(estado).length === 0;
}

/*
 * NO hay aqui una funcion «¿esta solicitud detiene la orden?».
 *
 * Es deliberado. Lo que detiene a una orden en 'esperando_repuesto' es que
 * no haya existencia para la solicitud, y eso lo contesta la columna
 * `liberada` que la entrada del repuesto pone en verdadero (RF-53). El
 * estado de este archivo es otra cosa: por donde va el tramite de entrega al
 * tecnico. Escribir la regla dos veces —una en la base y otra aqui— es
 * garantizar que algun dia digan cosas distintas.
 */

export const ETIQUETA_ESTADO_SOLICITUD: Readonly<Record<EstadoSolicitud, string>> = {
  [ESTADO_SOLICITUD.SOLICITADA]: 'Solicitada',
  [ESTADO_SOLICITUD.EN_REVISION]: 'En revision de bodega',
  [ESTADO_SOLICITUD.APROBADA]: 'Aprobada',
  [ESTADO_SOLICITUD.RECHAZADA]: 'Rechazada',
  [ESTADO_SOLICITUD.PREPARADA]: 'Preparada en bodega',
  [ESTADO_SOLICITUD.ENTREGADA]: 'Entregada, pendiente de recibir',
  [ESTADO_SOLICITUD.RECIBIDA]: 'Recibida por el tecnico',
  [ESTADO_SOLICITUD.ANULADA]: 'Anulada',
};
