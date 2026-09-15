/**
 * Contratos del protocolo de sincronizacion.
 *
 * El dispositivo guarda cada accion sin conexion en una cola local
 * ordenada, con un UUID que genera el. Al recuperar conexion las envia EN
 * ORDEN; ese UUID es la clave de idempotencia. Reenviar no duplica nada:
 * el servidor devuelve el resultado anterior.
 */

export const TIPO_OPERACION = {
  ORDEN_CREAR: 'orden.crear',
  ORDEN_CAMBIAR_ESTADO: 'orden.cambiar_estado',
  VISITA_REGISTRAR: 'visita.registrar',
  DIAGNOSTICO_REGISTRAR: 'diagnostico.registrar',
  INVENTARIO_CONSUMO: 'inventario.consumo',
  EVIDENCIA_REGISTRAR: 'evidencia.registrar',
} as const;
export type TipoOperacion = (typeof TIPO_OPERACION)[keyof typeof TIPO_OPERACION];

export interface OperacionEnCola {
  /** UUID generado por el dispositivo. Es la clave de idempotencia. */
  readonly idOperacion: string;
  readonly tipoOperacion: TipoOperacion;
  /** Cuando ocurrio de verdad, en el reloj del dispositivo. */
  readonly momentoDispositivo: string;
  /** La accion, tal como el dispositivo la registro. */
  readonly carga: Record<string, unknown>;
}

export interface PeticionSincronizar {
  readonly operaciones: readonly OperacionEnCola[];
}

export const ESTADO_OPERACION = {
  /** Se aplico. */
  APLICADA: 'aplicada',
  /** Ya habia llegado antes: se devuelve el resultado de entonces. */
  REPETIDA: 'repetida',
  /** Se acepto lo que paso en el domicilio y se genero una compensacion. */
  ACEPTADA_CON_DIFERENCIA: 'aceptada_con_diferencia',
  /** No se pudo aplicar. El trabajo quedo integro en la bandeja de excepciones. */
  EN_EXCEPCION: 'en_excepcion',
} as const;
export type EstadoOperacion = (typeof ESTADO_OPERACION)[keyof typeof ESTADO_OPERACION];

export interface ResultadoOperacion {
  readonly idOperacion: string;
  readonly tipoOperacion: TipoOperacion;
  readonly estado: EstadoOperacion;
  /**
   * El dispositivo puede borrar su copia local cuando esto es true. Lo es
   * incluso si la operacion quedo en excepcion: el servidor ya la tiene
   * integra y el dispositivo no la debe volver a enviar.
   */
  readonly confirmada: boolean;
  /** Identificador de lo creado o modificado, si lo hubo. */
  readonly idEntidad: string | null;
  readonly mensaje: string;
  readonly idExcepcion?: string;
  readonly datos?: Record<string, unknown>;
}

export interface ResultadoSincronizacion {
  readonly procesadas: number;
  readonly aplicadas: number;
  readonly repetidas: number;
  readonly enExcepcion: number;
  readonly resultados: readonly ResultadoOperacion[];
}

export interface ResumenExcepcion {
  readonly id: string;
  readonly idOperacion: string | null;
  readonly idOrden: string | null;
  readonly numeroOrden: number | null;
  readonly idTecnico: string | null;
  readonly tecnico: string | null;
  readonly motivo: string;
  readonly cargaOriginal: Record<string, unknown>;
  readonly estado: string;
  readonly resueltaPor: string | null;
  readonly resueltaEn: string | null;
  readonly resolucion: string | null;
  readonly creadoEn: string;
}

export interface PeticionResolverExcepcion {
  /** `resuelta` si se concilio; `descartada` si se decidio no hacer nada. */
  readonly estado: 'resuelta' | 'descartada';
  readonly resolucion: string;
}

// ── segunda cola: las evidencias ────────────────────────────────────────

export interface PeticionIniciarCarga {
  readonly idOrden: string;
  readonly clave: string;
  readonly tipo: string;
  /** Tamano total en bytes, para saber cuando esta completa. */
  readonly bytes: number;
  /** SHA-256 del archivo completo, para verificar la integridad al cerrar. */
  readonly huellaDigital: string;
  readonly momentoDispositivo: string;
  readonly latitud?: number | null;
  readonly longitud?: number | null;
}

export interface EstadoDeCarga {
  readonly idCarga: string;
  readonly idOrden: string;
  readonly clave: string;
  readonly bytes: number;
  /** Cuantos bytes tiene ya el servidor. El dispositivo reanuda desde aqui. */
  readonly bytesRecibidos: number;
  readonly completa: boolean;
  /** Presente solo cuando la carga se cerro y la evidencia quedo registrada. */
  readonly idEvidencia?: string;
}
