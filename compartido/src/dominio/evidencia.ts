/** Constantes de evidencia y de las plantillas de diagnostico. */

export const TIPO_EVIDENCIA = {
  FOTO: 'foto',
  FIRMA: 'firma',
  DOCUMENTO: 'documento',
  MEDICION: 'medicion',
} as const;
export type TipoEvidencia = (typeof TIPO_EVIDENCIA)[keyof typeof TIPO_EVIDENCIA];

export const MOMENTO_EVIDENCIA = {
  RECEPCION: 'recepcion',
  VALIDACION_GARANTIA: 'validacion_garantia',
  DIAGNOSTICO: 'diagnostico',
  REPARACION: 'reparacion',
  ENTREGA: 'entrega',
} as const;
export type MomentoEvidencia = (typeof MOMENTO_EVIDENCIA)[keyof typeof MOMENTO_EVIDENCIA];

export const TIPO_CAMPO_CHECKLIST = {
  NUMERICO: 'numerico',
  SELECCION: 'seleccion',
  TEXTO: 'texto',
  FOTO: 'foto',
  BOOLEANO: 'booleano',
} as const;
export type TipoCampoChecklist =
  (typeof TIPO_CAMPO_CHECKLIST)[keyof typeof TIPO_CAMPO_CHECKLIST];

export const FORMA_ACEPTACION = {
  FIRMA_PRESENCIAL: 'firma_presencial',
  LLAMADA: 'llamada',
  MENSAJE: 'mensaje',
  CORREO: 'correo',
} as const;
export type FormaAceptacion = (typeof FORMA_ACEPTACION)[keyof typeof FORMA_ACEPTACION];

/**
 * Que evidencia corresponde exigir SEGUN DONDE ESTA LA ORDEN.
 *
 * ESTO EXISTE PARA ROMPER UN BLOQUEO CIRCULAR REAL.
 *
 * La regla `firma_cliente` vive en el momento `entrega`. Si se exigiera
 * siempre, una orden terminada nunca podria aprobarse —falta la firma— y
 * sin aprobacion no se puede entregar, y sin entregar no hay firma. La
 * validacion tecnica quedaba inservible: NINGUNA orden pasaba.
 *
 * Es ACUMULATIVA a proposito: la evidencia de recepcion se sigue debiendo
 * cuando la orden ya esta en reparacion. Lo que no se adelanta es lo de
 * mas alla del punto al que la orden llego.
 *
 * Vive en `compartido` porque la usan los dos lados —el servidor al
 * validar y bloquear, la web del tecnico al pintar su lista— y tener dos
 * copias del mismo criterio es como se llega a que dos pantallas del mismo
 * sistema digan cosas distintas de la misma orden.
 */
export function momentosExigiblesEn(estado: string): readonly MomentoEvidencia[] {
  const hasta = (...momentos: MomentoEvidencia[]): readonly MomentoEvidencia[] => momentos;

  switch (estado) {
    case 'registrada':
    case 'asignada':
    case 'en_ruta':
    case 'en_cola_taller':
      return hasta(MOMENTO_EVIDENCIA.RECEPCION, MOMENTO_EVIDENCIA.VALIDACION_GARANTIA);
    case 'en_diagnostico':
    case 'cotizada':
    case 'esperando_autorizacion':
    case 'esperando_repuesto':
      return hasta(
        MOMENTO_EVIDENCIA.RECEPCION, MOMENTO_EVIDENCIA.VALIDACION_GARANTIA,
        MOMENTO_EVIDENCIA.DIAGNOSTICO,
      );
    case 'en_reparacion':
    case 'finalizada':
      return hasta(
        MOMENTO_EVIDENCIA.RECEPCION, MOMENTO_EVIDENCIA.VALIDACION_GARANTIA,
        MOMENTO_EVIDENCIA.DIAGNOSTICO, MOMENTO_EVIDENCIA.REPARACION,
      );
    default:
      // Entregada y los estados finales: ya paso todo el proceso, asi que
      // se exige el expediente completo. Es lo que mira el cobro al
      // proveedor, que ocurre despues de la entrega.
      return hasta(
        MOMENTO_EVIDENCIA.RECEPCION, MOMENTO_EVIDENCIA.VALIDACION_GARANTIA,
        MOMENTO_EVIDENCIA.DIAGNOSTICO, MOMENTO_EVIDENCIA.REPARACION,
        MOMENTO_EVIDENCIA.ENTREGA,
      );
  }
}
