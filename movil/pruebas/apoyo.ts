/** Apoyo de las pruebas: un servidor de mentira que se comporta como el real. */
import type {
  EstadoDeCarga, JornadaDelDispositivo, OperacionEnCola, PeticionIniciarCarga,
  ResultadoOperacion, ResultadoSincronizacion, Sesion,
} from '@servitotal/compartido';
import { ESTADO_OPERACION } from '@servitotal/compartido';
import { ErrorDeApi, type ClienteApi } from '../src/api/cliente.js';
import type { DetectorDeConexion } from '../src/sincronizacion/motor.js';

export class ConexionSimulada implements DetectorDeConexion {
  constructor(public disponible = true) {}
  async hayConexion(): Promise<boolean> { return this.disponible; }
}

interface CargaSimulada {
  readonly idOrden: string;
  readonly bytes: number;
  readonly huellaDigital: string;
  recibidos: number;
  cerrada: boolean;
}

/**
 * Servidor simulado con la misma semantica que el real: idempotencia por
 * clave, confirmacion explicita y cargas reanudables.
 */
export class ServidorSimulado implements ClienteApi {
  /** Operaciones ya procesadas, por clave de idempotencia. */
  readonly procesadas = new Map<string, ResultadoOperacion>();
  readonly cargas = new Map<string, CargaSimulada>();
  /** Cuantas veces se pidio sincronizar. */
  envios = 0;
  /** Lotes tal como llegaron, para comprobar el orden. */
  readonly lotesRecibidos: OperacionEnCola[][] = [];

  /** Si se define, la proxima llamada a sincronizar falla asi. */
  fallaProximoEnvio: Error | null = null;
  /** Operaciones que el servidor rechazara, por tipo. */
  rechazaTipo: string | null = null;
  /**
   * Error con el que fallara una parte de la subida, y en que numero de
   * parte (1 es la primera). Sirve para simular un corte a mitad de camino,
   * no solo al principio.
   */
  errorDeParte: Error | null = null;
  fallaEnLaParteNumero = 1;
  private partesRecibidas = 0;

  private contador = 0;

  /** Jornada que devuelve la descarga. Se sustituye en cada prueba que la use. */
  jornada: JornadaDelDispositivo = jornadaVacia();
  /** Cuantas veces se pidio la descarga de jornada. */
  descargas = 0;

  async iniciarSesion(): Promise<Sesion> { throw new Error('no usado en estas pruebas'); }
  async refrescar(): Promise<Sesion> { throw new Error('no usado en estas pruebas'); }

  async descargarJornada(): Promise<JornadaDelDispositivo> {
    this.descargas += 1;
    return this.jornada;
  }

  async sincronizar(operaciones: readonly OperacionEnCola[]): Promise<ResultadoSincronizacion> {
    this.envios += 1;
    this.lotesRecibidos.push([...operaciones]);

    if (this.fallaProximoEnvio !== null) {
      const fallo = this.fallaProximoEnvio;
      this.fallaProximoEnvio = null;
      throw fallo;
    }

    const resultados: ResultadoOperacion[] = [];
    for (const operacion of operaciones) {
      const previa = this.procesadas.get(operacion.idOperacion);
      if (previa !== undefined) {
        resultados.push({ ...previa, estado: ESTADO_OPERACION.REPETIDA });
        continue;
      }

      this.contador += 1;
      const veredicto: ResultadoOperacion = this.rechazaTipo === operacion.tipoOperacion
        ? {
          idOperacion: operacion.idOperacion,
          tipoOperacion: operacion.tipoOperacion,
          estado: ESTADO_OPERACION.EN_EXCEPCION,
          // Confirmada igual: el servidor la conserva integra.
          confirmada: true,
          idEntidad: null,
          mensaje: 'La orden fue anulada mientras el tecnico trabajaba. Se conserva el trabajo.',
          idExcepcion: `exc-${this.contador}`,
        }
        : {
          idOperacion: operacion.idOperacion,
          tipoOperacion: operacion.tipoOperacion,
          estado: ESTADO_OPERACION.APLICADA,
          confirmada: true,
          idEntidad: `entidad-${this.contador}`,
          mensaje: 'Aplicada.',
        };

      this.procesadas.set(operacion.idOperacion, veredicto);
      resultados.push(veredicto);
    }

    return {
      procesadas: resultados.length,
      aplicadas: resultados.filter((r) => r.estado === ESTADO_OPERACION.APLICADA).length,
      repetidas: resultados.filter((r) => r.estado === ESTADO_OPERACION.REPETIDA).length,
      enExcepcion: resultados.filter((r) => r.estado === ESTADO_OPERACION.EN_EXCEPCION).length,
      resultados,
    };
  }

  async iniciarCarga(peticion: PeticionIniciarCarga): Promise<EstadoDeCarga & { idEvidencia: string }> {
    this.contador += 1;
    const idCarga = `carga-${this.contador}`;
    this.cargas.set(idCarga, {
      idOrden: peticion.idOrden, bytes: peticion.bytes,
      huellaDigital: peticion.huellaDigital, recibidos: 0, cerrada: false,
    });
    return {
      idCarga, idOrden: peticion.idOrden, clave: peticion.clave,
      bytes: peticion.bytes, bytesRecibidos: 0, completa: false,
      idEvidencia: `evidencia-${this.contador}`,
    };
  }

  private exigirCarga(idCarga: string): CargaSimulada {
    const carga = this.cargas.get(idCarga);
    if (carga === undefined) throw new ErrorDeApi('NO_ENCONTRADO', 'No hay tal carga.', 404);
    return carga;
  }

  async consultarCarga(idCarga: string): Promise<EstadoDeCarga> {
    const carga = this.exigirCarga(idCarga);
    return {
      idCarga, idOrden: carga.idOrden, clave: '',
      bytes: carga.bytes, bytesRecibidos: carga.recibidos,
      completa: carga.recibidos >= carga.bytes,
    };
  }

  async enviarParte(idCarga: string, desplazamiento: number, parte: Uint8Array): Promise<EstadoDeCarga> {
    this.partesRecibidas += 1;
    if (this.errorDeParte !== null && this.partesRecibidas === this.fallaEnLaParteNumero) {
      const fallo = this.errorDeParte;
      this.errorDeParte = null;
      throw fallo;
    }
    const carga = this.exigirCarga(idCarga);
    if (desplazamiento !== carga.recibidos) {
      throw new ErrorDeApi(
        'DESPLAZAMIENTO_INCORRECTO',
        `Reanude desde el byte ${carga.recibidos}.`, 422,
      );
    }
    carga.recibidos += parte.length;
    return {
      idCarga, idOrden: carga.idOrden, clave: '',
      bytes: carga.bytes, bytesRecibidos: carga.recibidos,
      completa: carga.recibidos >= carga.bytes,
    };
  }

  async cerrarCarga(idCarga: string): Promise<{ sincronizada: boolean }> {
    const carga = this.exigirCarga(idCarga);
    if (carga.recibidos !== carga.bytes) {
      throw new ErrorDeApi('CARGA_INCOMPLETA', 'Faltan bytes.', 422);
    }
    carga.cerrada = true;
    return { sincronizada: true };
  }
}

/** Generador de identificadores predecible, para poder afirmar sobre ellos. */
export function generadorSecuencial(prefijo = 'op'): () => string {
  let contador = 0;
  return () => {
    contador += 1;
    return `${prefijo}-${String(contador).padStart(4, '0')}`;
  };
}

export function jornadaVacia(): JornadaDelDispositivo {
  return {
    descargadaEn: new Date().toISOString(),
    idTecnico: null,
    tecnico: null,
    bodega: null,
    ordenes: [],
    repuestos: [],
    existencias: [],
    reglasEvidencia: [],
  };
}
