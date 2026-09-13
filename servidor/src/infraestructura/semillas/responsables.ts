/**
 * Quien es el responsable unico de la orden en cada estado (H1 · RN-10).
 * Tabla tomada de la seccion 5 del pliego.
 */
import { CODIGO_ROL, ESTADO_ORDEN, type EstadoOrden } from '@servitotal/compartido';
import { usuariosDe, type ContextoSiembra, type ReferenciaTecnico } from './contexto.js';

/** Rol que responde por cada estado. Los estados finales no tienen responsable. */
export const ROL_RESPONSABLE: Readonly<Record<EstadoOrden, string | null>> = {
  [ESTADO_ORDEN.REGISTRADA]: CODIGO_ROL.AGENTE_TELEFONIA,
  [ESTADO_ORDEN.ASIGNADA]: CODIGO_ROL.JEFE_TECNICOS,
  [ESTADO_ORDEN.EN_RUTA]: null, // el tecnico de ruta asignado
  [ESTADO_ORDEN.EN_COLA_TALLER]: CODIGO_ROL.JEFE_TECNICOS,
  [ESTADO_ORDEN.EN_DIAGNOSTICO]: null, // el tecnico asignado
  [ESTADO_ORDEN.COTIZADA]: null, // el tecnico asignado
  [ESTADO_ORDEN.ESPERANDO_AUTORIZACION]: CODIGO_ROL.AGENTE_TELEFONIA,
  [ESTADO_ORDEN.ESPERANDO_REPUESTO]: CODIGO_ROL.BODEGUERO,
  [ESTADO_ORDEN.EN_REPARACION]: null, // el tecnico asignado
  [ESTADO_ORDEN.FINALIZADA]: CODIGO_ROL.AGENTE_TELEFONIA,
  [ESTADO_ORDEN.ENTREGADA]: null,
  [ESTADO_ORDEN.CERRADA_SIN_REPARAR]: null,
  [ESTADO_ORDEN.ANULADA]: null,
};

const ESTADOS_DEL_TECNICO: readonly EstadoOrden[] = [
  ESTADO_ORDEN.EN_RUTA,
  ESTADO_ORDEN.EN_DIAGNOSTICO,
  ESTADO_ORDEN.COTIZADA,
  ESTADO_ORDEN.EN_REPARACION,
];

/**
 * Usuario responsable de la orden en ese estado. Devuelve null en los
 * estados finales: una orden cerrada no tiene a quien reclamarle.
 */
export function responsableDe(
  contexto: ContextoSiembra,
  estado: EstadoOrden,
  tecnico: ReferenciaTecnico | null,
): string | null {
  if (ESTADOS_DEL_TECNICO.includes(estado)) {
    return tecnico?.idUsuario ?? null;
  }
  const rol = ROL_RESPONSABLE[estado];
  if (rol === null) return null;
  return contexto.azar.elegir(usuariosDe(contexto, rol)).id;
}
