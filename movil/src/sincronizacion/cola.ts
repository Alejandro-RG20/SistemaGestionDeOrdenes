/**
 * Cola local de operaciones.
 *
 * Cada accion que el tecnico hace sin conexion se guarda aqui, ORDENADA, con
 * un UUID generado en el dispositivo. Ese UUID viaja despues como clave de
 * idempotencia: si el envio se corta sin que llegue la respuesta, reenviar
 * la misma operacion no duplica nada.
 *
 * La regla que gobierna esta clase: EL DISPOSITIVO NUNCA BORRA UN REGISTRO
 * LOCAL SIN CONFIRMACION DEL SERVIDOR. Ni siquiera cuando el servidor la
 * rechaza: la rechazada se borra porque el servidor confirmo que la tiene
 * integra en su bandeja de excepciones, no porque se le de por perdida.
 */
import {
  ESTADO_OPERACION, type EstadoOperacion, type OperacionEnCola, type TipoOperacion,
} from '@servitotal/compartido';
import {
  ESTADO_LOCAL, type AlmacenDeCola, type EstadoLocal, type FilaOperacion,
} from '../datos/puertos.js';

/** Cuantas operaciones se mandan de una vez. */
export const TAMANO_DE_LOTE = 50;

export type GeneradorDeIdentificadores = () => string;

export interface AccionSinConexion {
  readonly tipoOperacion: TipoOperacion;
  readonly carga: Record<string, unknown>;
  /** Cuando ocurrio de verdad. Por defecto, ahora. */
  readonly momentoDispositivo?: string;
  /** Solo para reusar un UUID ya generado (por ejemplo, el id de una orden). */
  readonly idOperacion?: string;
}

export class ColaDeOperaciones {
  constructor(
    private readonly almacen: AlmacenDeCola,
    private readonly nuevoIdentificador: GeneradorDeIdentificadores,
  ) {}

  /** Registra la accion. A partir de aqui existe aunque la app se cierre. */
  async encolar(accion: AccionSinConexion): Promise<FilaOperacion> {
    const fila: FilaOperacion = {
      idOperacion: accion.idOperacion ?? this.nuevoIdentificador(),
      ordenEnCola: await this.almacen.siguienteOrden(),
      tipoOperacion: accion.tipoOperacion,
      momentoDispositivo: accion.momentoDispositivo ?? new Date().toISOString(),
      carga: accion.carga,
      estado: ESTADO_LOCAL.PENDIENTE,
      intentos: 0,
      ultimoMensaje: null,
    };
    await this.almacen.guardar(fila);
    return fila;
  }

  /**
   * Siguiente lote a enviar, en orden.
   *
   * Incluye las que quedaron en `enviando`: si la app murio despues de
   * mandar y antes de recibir el veredicto, esas hay que reintentarlas. Que
   * no se dupliquen es justo lo que garantiza la clave de idempotencia.
   */
  async siguienteLote(tamano = TAMANO_DE_LOTE): Promise<FilaOperacion[]> {
    return this.almacen.leerPorEstado([ESTADO_LOCAL.PENDIENTE, ESTADO_LOCAL.ENVIANDO], tamano);
  }

  async marcarEnviando(filas: readonly FilaOperacion[]): Promise<void> {
    for (const fila of filas) {
      await this.almacen.actualizar(fila.idOperacion, {
        estado: ESTADO_LOCAL.ENVIANDO,
        intentos: fila.intentos + 1,
      });
    }
  }

  /**
   * Aplica el veredicto del servidor.
   *
   * `confirmada` es la unica llave que abre el borrado. Si el servidor no
   * confirmo —porque fallo de forma inesperada— la operacion vuelve a
   * `pendiente` y se reintentara.
   */
  async aplicarVeredicto(
    idOperacion: string, estadoServidor: EstadoOperacion, confirmada: boolean, mensaje: string,
  ): Promise<void> {
    if (!confirmada) {
      await this.almacen.actualizar(idOperacion, {
        estado: ESTADO_LOCAL.PENDIENTE,
        ultimoMensaje: mensaje,
      });
      return;
    }

    await this.almacen.actualizar(idOperacion, {
      estado: estadoServidor === ESTADO_OPERACION.EN_EXCEPCION
        ? ESTADO_LOCAL.EN_EXCEPCION
        : ESTADO_LOCAL.CONFIRMADA,
      ultimoMensaje: mensaje,
    });
  }

  /**
   * Borra lo que el servidor confirmo. Se llama DESPUES de aplicar los
   * veredictos, nunca antes: borrar primero y confirmar despues es como se
   * pierde el trabajo de una jornada.
   */
  async purgarConfirmadas(): Promise<number> {
    const confirmadas = await this.almacen.leerPorEstado(
      [ESTADO_LOCAL.CONFIRMADA, ESTADO_LOCAL.EN_EXCEPCION], Number.MAX_SAFE_INTEGER,
    );
    await this.almacen.eliminar(confirmadas.map((fila) => fila.idOperacion));
    return confirmadas.length;
  }

  async pendientes(): Promise<number> {
    return this.almacen.contarPorEstado([ESTADO_LOCAL.PENDIENTE, ESTADO_LOCAL.ENVIANDO]);
  }

  /** Lo que la cola manda al servidor, en el formato del protocolo. */
  static aOperacionEnCola(fila: FilaOperacion): OperacionEnCola {
    return {
      idOperacion: fila.idOperacion,
      tipoOperacion: fila.tipoOperacion,
      momentoDispositivo: fila.momentoDispositivo,
      carga: fila.carga,
    };
  }
}

export { ESTADO_LOCAL, type EstadoLocal, type FilaOperacion };
