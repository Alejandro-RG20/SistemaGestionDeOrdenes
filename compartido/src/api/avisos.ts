/**
 * Contratos de la bandeja de avisos del panel.
 *
 * DECISION DEL NEGOCIO: el sistema NO empuja nada. Ni correo, ni mensaje.
 * "Se notifica al responsable" significa que cuando esa persona entra al
 * panel, lo que le toca esta ahi esperandola.
 *
 * De eso se sigue una decision tecnica que conviene entender: la bandeja
 * NO es una tabla de notificaciones. Se calcula en el momento, desde el
 * estado vivo del sistema. Una tabla obligaria a marcar leido, a purgar, y
 * sobre todo a mantenerla sincronizada con la realidad: una orden que dejo
 * de estar vencida porque alguien la movio seguiria gritando en la bandeja
 * hasta que un proceso la limpiara. Calculandola, eso no puede pasar: si el
 * aviso sigue ahi es porque el problema sigue ahi.
 */

export const TIPO_AVISO = {
  ORDEN_VENCIDA: 'orden_vencida',
  ORDEN_EN_ALERTA: 'orden_en_alerta',
  EXCEPCION_SINCRONIZACION: 'excepcion_sincronizacion',
  EXPEDIENTE_BLOQUEADO: 'expediente_bloqueado',
  EXPEDIENTE_SIN_RESPUESTA: 'expediente_sin_respuesta',
  ORDEN_COBRABLE_SIN_EXPEDIENTE: 'orden_cobrable_sin_expediente',
  REPUESTO_BAJO_MINIMO: 'repuesto_bajo_minimo',
  SOLICITUD_REPUESTO_PENDIENTE: 'solicitud_repuesto_pendiente',
  EVIDENCIA_FALTANTE: 'evidencia_faltante',
} as const;
export type TipoAviso = (typeof TIPO_AVISO)[keyof typeof TIPO_AVISO];

/** Que tan urgente es. Ordena la bandeja. */
export const GRAVEDAD_AVISO = {
  CRITICO: 'critico',
  ATENCION: 'atencion',
  INFORMATIVO: 'informativo',
} as const;
export type GravedadAviso = (typeof GRAVEDAD_AVISO)[keyof typeof GRAVEDAD_AVISO];

export interface RenglonDeAviso {
  /** Identificador de la entidad: orden, expediente, repuesto. */
  readonly id: string;
  /** Lo que la persona lee en la lista. */
  readonly titulo: string;
  readonly detalle: string;
  /** A donde lleva el clic, dentro del panel. */
  readonly enlace: string;
  /** Para ordenar dentro del grupo: horas de atraso, dias sin respuesta. */
  readonly magnitud: number | null;
}

export interface GrupoDeAvisos {
  readonly tipo: TipoAviso;
  readonly gravedad: GravedadAviso;
  readonly titulo: string;
  /** Por que esto le aparece a esta persona y no a otra. */
  readonly porQue: string;
  readonly total: number;
  /** Los primeros; el resto se ve en la pantalla del modulo. */
  readonly muestra: readonly RenglonDeAviso[];
  readonly enlaceVerTodo: string;
}

export interface BandejaDeAvisos {
  readonly calculadaEn: string;
  readonly total: number;
  readonly criticos: number;
  readonly grupos: readonly GrupoDeAvisos[];
}
