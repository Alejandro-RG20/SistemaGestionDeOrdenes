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
