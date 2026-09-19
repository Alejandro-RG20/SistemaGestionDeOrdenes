/**
 * Puertos de almacenamiento local.
 *
 * La logica de las colas no sabe que hay debajo. Eso no es purismo:
 * es que la parte que puede perder el trabajo de un tecnico —el orden de la
 * cola, cuando se borra un registro— se pueda probar de verdad, sin un
 * emulador de por medio.
 *
 * Hay dos implementaciones: IndexedDB en el navegador del tecnico y una en
 * memoria para las pruebas. Que la logica no sepa cual esta debajo es lo que
 * permitio pasar de una aplicacion nativa a la web sin reescribir una sola
 * regla de la cola.
 */
import type { TipoOperacion } from '@servitotal/compartido';

export const ESTADO_LOCAL = {
  /** Registrada en el dispositivo, todavia no enviada. */
  PENDIENTE: 'pendiente',
  /** Enviada, esperando veredicto. */
  ENVIANDO: 'enviando',
  /** El servidor la aplico. Ya se puede borrar. */
  CONFIRMADA: 'confirmada',
  /** El servidor no pudo aplicarla pero la conserva integra. Tambien se borra. */
  EN_EXCEPCION: 'en_excepcion',
} as const;
export type EstadoLocal = (typeof ESTADO_LOCAL)[keyof typeof ESTADO_LOCAL];

export interface FilaOperacion {
  readonly idOperacion: string;
  /** Posicion en la cola. El orden es parte del protocolo. */
  readonly ordenEnCola: number;
  readonly tipoOperacion: TipoOperacion;
  readonly momentoDispositivo: string;
  readonly carga: Record<string, unknown>;
  readonly estado: EstadoLocal;
  readonly intentos: number;
  readonly ultimoMensaje: string | null;
}

export interface AlmacenDeCola {
  guardar(fila: FilaOperacion): Promise<void>;
  /** Devuelve en orden de cola, filtrando por estado. */
  leerPorEstado(estados: readonly EstadoLocal[], limite: number): Promise<FilaOperacion[]>;
  actualizar(idOperacion: string, cambios: Partial<FilaOperacion>): Promise<void>;
  eliminar(idsOperacion: readonly string[]): Promise<void>;
  contarPorEstado(estados: readonly EstadoLocal[]): Promise<number>;
  /** Siguiente posicion libre en la cola. */
  siguienteOrden(): Promise<number>;
}

export const ESTADO_EVIDENCIA = {
  /** Capturada, todavia sin comprimir ni abrir carga en el servidor. */
  CAPTURADA: 'capturada',
  /** Comprimida y con carga abierta: subiendo por partes. */
  SUBIENDO: 'subiendo',
  /** Cerrada y verificada por el servidor. */
  CONFIRMADA: 'confirmada',
} as const;
export type EstadoEvidencia = (typeof ESTADO_EVIDENCIA)[keyof typeof ESTADO_EVIDENCIA];

export interface FilaEvidencia {
  readonly idLocal: string;
  readonly idOrden: string;
  readonly clave: string;
  readonly tipo: string;
  /** Ruta del archivo en el dispositivo. */
  readonly rutaLocal: string;
  readonly bytes: number;
  readonly huellaDigital: string;
  readonly momentoDispositivo: string;
  readonly latitud: number | null;
  readonly longitud: number | null;
  /** Identificadores que da el servidor al abrir la carga. */
  readonly idCarga: string | null;
  readonly idEvidencia: string | null;
  readonly bytesEnviados: number;
  readonly estado: EstadoEvidencia;
  readonly intentos: number;
}

export interface AlmacenDeEvidencias {
  guardar(fila: FilaEvidencia): Promise<void>;
  leerPorEstado(estados: readonly EstadoEvidencia[], limite: number): Promise<FilaEvidencia[]>;
  actualizar(idLocal: string, cambios: Partial<FilaEvidencia>): Promise<void>;
  eliminar(idsLocal: readonly string[]): Promise<void>;
  contarPorEstado(estados: readonly EstadoEvidencia[]): Promise<number>;
}

/** Trozo de archivo leido del disco del dispositivo. */
export interface LectorDeArchivos {
  leerParte(ruta: string, desplazamiento: number, largo: number): Promise<Uint8Array>;
  eliminar(ruta: string): Promise<void>;
}
