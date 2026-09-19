/**
 * Motor de sincronizacion del dispositivo.
 *
 * Al recuperar conexion vacia las dos colas: primero las operaciones —en
 * orden— y despues las evidencias. Ese orden importa: una evidencia
 * pertenece a una orden que quiza todavia no existe en el servidor.
 *
 * La regla que no se negocia: NADA SE BORRA DEL DISPOSITIVO SIN
 * CONFIRMACION DEL SERVIDOR. Si la respuesta no llega, la operacion queda
 * y se reintenta; reenviarla no duplica porque lleva su clave de
 * idempotencia.
 */
import {
  ESTADO_OPERACION,
  type EstadoDeCarga, type OperacionEnCola, type PeticionIniciarCarga,
  type ResultadoSincronizacion,
} from '@servitotal/compartido';
import { ErrorDeApi } from '../api/cliente.js';
import { ColaDeOperaciones } from './cola.js';
import { ColaDeEvidencias, type FilaEvidencia } from './cola-evidencias.js';

export interface ResumenDeSincronizacion {
  readonly operacionesEnviadas: number;
  readonly operacionesAplicadas: number;
  readonly operacionesRepetidas: number;
  readonly operacionesEnExcepcion: number;
  readonly evidenciasSubidas: number;
  readonly quedanPendientes: number;
  /** Se interrumpio por falta de senal. Lo pendiente sigue intacto. */
  readonly interrumpidaPorConexion: boolean;
  /**
   * Codigo del error que corto el envio, cuando vino del servidor.
   *
   * Existe porque no todas las interrupciones son lo mismo y la pantalla
   * tiene que poder distinguirlas: quedarse sin señal se arregla solo,
   * pero un `SESION_SIN_DISPOSITIVO` no se arregla nunca por si mismo y
   * hay que decirle al tecnico que llame a la jefatura. Adivinarlo leyendo
   * el texto del mensaje seria atarse a una redaccion.
   */
  readonly codigoDeInterrupcion: string | null;
  readonly mensajes: readonly string[];
}

export interface DetectorDeConexion {
  hayConexion(): Promise<boolean>;
}

/**
 * Lo unico que el motor necesita del cliente de la API.
 *
 * Se declara aparte, y estrecho, para que el motor se pueda probar contra
 * un servidor simulado sin arrastrar el cliente entero del panel. Es la
 * misma razon por la que las colas hablan contra puertos: lo que puede
 * perder el trabajo de un tecnico tiene que poder probarse de verdad.
 */
export interface ClienteDeCampo {
  sincronizar(operaciones: readonly OperacionEnCola[]): Promise<ResultadoSincronizacion>;
  iniciarCarga(peticion: PeticionIniciarCarga): Promise<EstadoDeCarga & { idEvidencia: string }>;
  consultarCarga(idCarga: string): Promise<EstadoDeCarga>;
  enviarParte(idCarga: string, desplazamiento: number, parte: Uint8Array): Promise<EstadoDeCarga>;
  cerrarCarga(idCarga: string, idEvidencia: string): Promise<{ sincronizada: boolean }>;
}

export class MotorDeSincronizacion {
  constructor(
    private readonly cliente: ClienteDeCampo,
    private readonly cola: ColaDeOperaciones,
    private readonly evidencias: ColaDeEvidencias,
    private readonly conexion: DetectorDeConexion,
  ) {}

  async sincronizar(): Promise<ResumenDeSincronizacion> {
    const mensajes: string[] = [];

    if (!(await this.conexion.hayConexion())) {
      return this.resumenVacio(true, ['Sin conexion. La cola queda intacta.']);
    }

    let enviadas = 0;
    let aplicadas = 0;
    let repetidas = 0;
    let enExcepcion = 0;

    // ── primera cola: las operaciones, en orden ──
    let lote = await this.cola.siguienteLote();
    while (lote.length > 0) {
      await this.cola.marcarEnviando(lote);

      let resultado;
      try {
        resultado = await this.cliente.sincronizar(lote.map(ColaDeOperaciones.aOperacionEnCola));
      } catch (error) {
        // Se corto a mitad. Lo enviado queda como estaba y se reintentara;
        // la clave de idempotencia se encarga de que no se duplique.
        for (const fila of lote) {
          await this.cola.aplicarVeredicto(
            fila.idOperacion, ESTADO_OPERACION.APLICADA, false, mensajeDe(error),
          );
        }
        return this.resumen(enviadas, aplicadas, repetidas, enExcepcion, 0, true,
          [...mensajes, `Se interrumpio el envio: ${mensajeDe(error)}`], codigoDe(error));
      }

      for (const veredicto of resultado.resultados) {
        await this.cola.aplicarVeredicto(
          veredicto.idOperacion, veredicto.estado, veredicto.confirmada, veredicto.mensaje,
        );
        if (veredicto.estado === ESTADO_OPERACION.EN_EXCEPCION && veredicto.confirmada) {
          mensajes.push(`Operacion en revision: ${veredicto.mensaje}`);
        }
      }

      enviadas += lote.length;
      aplicadas += resultado.aplicadas;
      repetidas += resultado.repetidas;
      enExcepcion += resultado.enExcepcion;

      // Se borra DESPUES de haber aplicado los veredictos.
      await this.cola.purgarConfirmadas();

      const siguiente = await this.cola.siguienteLote();
      // Si el lote no avanzo, algo quedo trabado: no se insiste en vano.
      if (siguiente.length > 0 && siguiente[0]?.idOperacion === lote[0]?.idOperacion) break;
      lote = siguiente;
    }

    // ── segunda cola: las evidencias ──
    const subidas = await this.subirEvidencias(mensajes);

    return this.resumen(enviadas, aplicadas, repetidas, enExcepcion, subidas.subidas,
      subidas.interrumpida, mensajes);
  }

  /** Sube las evidencias pendientes, reanudando la que quedo a medias. */
  private async subirEvidencias(
    mensajes: string[],
  ): Promise<{ subidas: number; interrumpida: boolean }> {
    let subidas = 0;
    for (const fila of await this.evidencias.siguientes(20)) {
      try {
        await this.subirUna(fila);
        subidas += 1;
      } catch (error) {
        if (error instanceof ErrorDeApi && error.esTransitorio) {
          return { subidas, interrumpida: true };
        }
        if (error instanceof ErrorDeApi
          && ['HUELLA_NO_COINCIDE', 'DESPLAZAMIENTO_INCORRECTO', 'CARGA_EXCEDIDA'].includes(error.codigo)) {
          // El archivo del servidor quedo inservible: se empieza de nuevo.
          await this.evidencias.reiniciar(fila.idLocal);
          mensajes.push(`La evidencia ${fila.clave} se volvera a subir: ${error.message}`);
          continue;
        }
        await this.evidencias.anotarIntento(fila, mensajeDe(error));
        mensajes.push(`No se pudo subir ${fila.clave}: ${mensajeDe(error)}`);
      }
    }
    return { subidas, interrumpida: false };
  }

  private async subirUna(fila: FilaEvidencia): Promise<void> {
    let actual = fila;

    if (actual.idCarga === null) {
      const carga = await this.cliente.iniciarCarga({
        idOrden: actual.idOrden,
        clave: actual.clave,
        tipo: actual.tipo,
        bytes: actual.bytes,
        huellaDigital: actual.huellaDigital,
        momentoDispositivo: actual.momentoDispositivo,
        latitud: actual.latitud,
        longitud: actual.longitud,
      });
      await this.evidencias.anotarCargaAbierta(actual.idLocal, carga.idCarga, carga.idEvidencia);
      actual = { ...actual, idCarga: carga.idCarga, idEvidencia: carga.idEvidencia, bytesEnviados: 0 };
    } else {
      // Se reanuda desde donde el SERVIDOR dice que quedo, no desde la
      // cuenta local: si difieren, manda el servidor.
      const estado = await this.cliente.consultarCarga(actual.idCarga);
      await this.evidencias.anotarAvance(actual.idLocal, estado.bytesRecibidos);
      actual = { ...actual, bytesEnviados: estado.bytesRecibidos };
    }

    while (actual.bytesEnviados < actual.bytes) {
      const parte = await this.evidencias.leerParte(actual);
      if (parte.length === 0) break;
      const estado = await this.cliente.enviarParte(actual.idCarga!, actual.bytesEnviados, parte);
      await this.evidencias.anotarAvance(actual.idLocal, estado.bytesRecibidos);
      actual = { ...actual, bytesEnviados: estado.bytesRecibidos };
    }

    await this.cliente.cerrarCarga(actual.idCarga!, actual.idEvidencia!);
    // Recien ahora se borra el archivo del dispositivo.
    await this.evidencias.confirmar(actual);
  }

  private async resumenVacio(
    interrumpida: boolean, mensajes: readonly string[],
  ): Promise<ResumenDeSincronizacion> {
    return this.resumen(0, 0, 0, 0, 0, interrumpida, mensajes);
  }

  private async resumen(
    enviadas: number, aplicadas: number, repetidas: number, enExcepcion: number,
    evidencias: number, interrumpida: boolean, mensajes: readonly string[],
    codigoDeInterrupcion: string | null = null,
  ): Promise<ResumenDeSincronizacion> {
    const pendientes = await this.cola.pendientes() + await this.evidencias.pendientes();
    return {
      operacionesEnviadas: enviadas,
      operacionesAplicadas: aplicadas,
      operacionesRepetidas: repetidas,
      operacionesEnExcepcion: enExcepcion,
      evidenciasSubidas: evidencias,
      quedanPendientes: pendientes,
      interrumpidaPorConexion: interrumpida,
      codigoDeInterrupcion,
      mensajes,
    };
  }
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function codigoDe(error: unknown): string | null {
  return error instanceof ErrorDeApi ? error.codigo : null;
}
