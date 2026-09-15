/**
 * Segunda cola: las evidencias.
 *
 * Viajan aparte de las operaciones porque una foto de cuatro megas con mala
 * senal no puede bloquear el resto de la jornada. Suben COMPRIMIDAS y POR
 * PARTES, y si se corta la conexion se reanuda desde el byte que el
 * servidor confirmo tener, no desde el principio.
 */
import {
  ESTADO_EVIDENCIA, type AlmacenDeEvidencias, type FilaEvidencia, type LectorDeArchivos,
} from '../datos/puertos.js';

/** Tamano de cada trozo. Chico a proposito: con mala senal, reintentar poco. */
export const TAMANO_DE_PARTE = 256 * 1024;

export interface EvidenciaCapturada {
  readonly idLocal: string;
  readonly idOrden: string;
  readonly clave: string;
  readonly tipo: string;
  readonly rutaLocal: string;
  readonly bytes: number;
  readonly huellaDigital: string;
  readonly momentoDispositivo: string;
  readonly latitud?: number | null;
  readonly longitud?: number | null;
}

export class ColaDeEvidencias {
  constructor(
    private readonly almacen: AlmacenDeEvidencias,
    private readonly archivos: LectorDeArchivos,
  ) {}

  async encolar(evidencia: EvidenciaCapturada): Promise<FilaEvidencia> {
    const fila: FilaEvidencia = {
      idLocal: evidencia.idLocal,
      idOrden: evidencia.idOrden,
      clave: evidencia.clave,
      tipo: evidencia.tipo,
      rutaLocal: evidencia.rutaLocal,
      bytes: evidencia.bytes,
      huellaDigital: evidencia.huellaDigital,
      momentoDispositivo: evidencia.momentoDispositivo,
      latitud: evidencia.latitud ?? null,
      longitud: evidencia.longitud ?? null,
      idCarga: null,
      idEvidencia: null,
      bytesEnviados: 0,
      estado: ESTADO_EVIDENCIA.CAPTURADA,
      intentos: 0,
    };
    await this.almacen.guardar(fila);
    return fila;
  }

  async siguientes(limite: number): Promise<FilaEvidencia[]> {
    return this.almacen.leerPorEstado(
      [ESTADO_EVIDENCIA.CAPTURADA, ESTADO_EVIDENCIA.SUBIENDO], limite,
    );
  }

  async anotarCargaAbierta(idLocal: string, idCarga: string, idEvidencia: string): Promise<void> {
    await this.almacen.actualizar(idLocal, {
      idCarga, idEvidencia, estado: ESTADO_EVIDENCIA.SUBIENDO,
    });
  }

  /**
   * Ajusta el avance a lo que el servidor dice tener.
   *
   * Es el servidor quien manda: si el dispositivo cree que envio mas, se
   * corrige hacia abajo. Confiar en la cuenta local seria construir un
   * archivo con un agujero en medio.
   */
  async anotarAvance(idLocal: string, bytesSegunElServidor: number): Promise<void> {
    await this.almacen.actualizar(idLocal, { bytesEnviados: bytesSegunElServidor });
  }

  async anotarIntento(fila: FilaEvidencia, mensaje: string): Promise<void> {
    await this.almacen.actualizar(fila.idLocal, { intentos: fila.intentos + 1 });
    void mensaje;
  }

  /**
   * La evidencia quedo cerrada y verificada en el servidor. Recien ahora se
   * borra el archivo del dispositivo: antes, no.
   */
  async confirmar(fila: FilaEvidencia): Promise<void> {
    await this.almacen.actualizar(fila.idLocal, { estado: ESTADO_EVIDENCIA.CONFIRMADA });
    await this.archivos.eliminar(fila.rutaLocal);
    await this.almacen.eliminar([fila.idLocal]);
  }

  /** Reinicia una carga que el servidor rechazo por huella o desfase. */
  async reiniciar(idLocal: string): Promise<void> {
    await this.almacen.actualizar(idLocal, {
      idCarga: null, idEvidencia: null, bytesEnviados: 0, estado: ESTADO_EVIDENCIA.CAPTURADA,
    });
  }

  async leerParte(fila: FilaEvidencia): Promise<Uint8Array> {
    return this.archivos.leerParte(fila.rutaLocal, fila.bytesEnviados, TAMANO_DE_PARTE);
  }

  async pendientes(): Promise<number> {
    return this.almacen.contarPorEstado([ESTADO_EVIDENCIA.CAPTURADA, ESTADO_EVIDENCIA.SUBIENDO]);
  }
}

export { ESTADO_EVIDENCIA, type FilaEvidencia };
