/**
 * Cliente de la API.
 *
 * Se declara como interfaz para que el motor de sincronizacion pueda
 * probarse sin servidor. La implementacion sobre `fetch` esta abajo.
 */
import type {
  EstadoDeCarga, JornadaDelDispositivo, PeticionIniciarCarga, ResultadoSincronizacion,
  OperacionEnCola, Sesion,
} from '@servitotal/compartido';

export interface ClienteApi {
  iniciarSesion(
    nombreUsuario: string, contrasena: string, identificadorDispositivo: string,
  ): Promise<Sesion>;
  refrescar(tokenRefresco: string): Promise<Sesion>;
  /** Todo lo que el dispositivo necesita para trabajar sin senal, de un viaje. */
  descargarJornada(): Promise<JornadaDelDispositivo>;
  sincronizar(operaciones: readonly OperacionEnCola[]): Promise<ResultadoSincronizacion>;
  iniciarCarga(peticion: PeticionIniciarCarga): Promise<EstadoDeCarga & { idEvidencia: string }>;
  consultarCarga(idCarga: string): Promise<EstadoDeCarga>;
  enviarParte(idCarga: string, desplazamiento: number, parte: Uint8Array): Promise<EstadoDeCarga>;
  cerrarCarga(idCarga: string, idEvidencia: string): Promise<{ sincronizada: boolean }>;
}

/** Error de la API con el codigo que devolvio el servidor. */
export class ErrorDeApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estadoHttp: number,
  ) {
    super(mensaje);
    this.name = 'ErrorDeApi';
  }

  /** Un fallo de red o un 5xx: la operacion puede volver a intentarse tal cual. */
  get esTransitorio(): boolean {
    return this.estadoHttp === 0 || this.estadoHttp >= 500;
  }
}

export interface ProveedorDeToken {
  tokenAcceso(): Promise<string | null>;
  renovar(): Promise<string | null>;
}

interface RespuestaApi<T> {
  datos?: T;
  error?: { codigo: string; mensaje: string };
}

export class ClienteHttp implements ClienteApi {
  constructor(
    private readonly raiz: string,
    private readonly token: ProveedorDeToken,
  ) {}

  private async pedir<T>(
    ruta: string,
    opciones: { metodo?: string; cuerpo?: unknown; binario?: Uint8Array; cabeceras?: Record<string, string> } = {},
    yaReintento = false,
  ): Promise<T> {
    const acceso = await this.token.tokenAcceso();
    const cabeceras: Record<string, string> = {
      ...(acceso === null ? {} : { Authorization: `Bearer ${acceso}` }),
      ...opciones.cabeceras,
    };

    let cuerpo: BodyInit | undefined;
    if (opciones.binario !== undefined) {
      cabeceras['Content-Type'] = 'application/octet-stream';
      cuerpo = opciones.binario as unknown as BodyInit;
    } else if (opciones.cuerpo !== undefined) {
      cabeceras['Content-Type'] = 'application/json';
      cuerpo = JSON.stringify(opciones.cuerpo);
    }

    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.raiz}${ruta}`, {
        method: opciones.metodo ?? 'GET',
        headers: cabeceras,
        ...(cuerpo === undefined ? {} : { body: cuerpo }),
      });
    } catch (error) {
      // Sin senal. No es un fallo de la operacion: es que no hay por donde.
      throw new ErrorDeApi('SIN_CONEXION', 'No hay conexion con el servidor.', 0);
    }

    // La sesion vencio: se renueva una vez y se reintenta.
    if (respuesta.status === 401 && !yaReintento) {
      const renovado = await this.token.renovar();
      if (renovado !== null) return this.pedir<T>(ruta, opciones, true);
    }

    const cuerpoRespuesta = (await respuesta.json().catch(() => ({}))) as RespuestaApi<T>;
    if (!respuesta.ok) {
      throw new ErrorDeApi(
        cuerpoRespuesta.error?.codigo ?? 'ERROR_DESCONOCIDO',
        cuerpoRespuesta.error?.mensaje ?? 'El servidor rechazo la peticion.',
        respuesta.status,
      );
    }
    return cuerpoRespuesta.datos as T;
  }

  async iniciarSesion(
    nombreUsuario: string, contrasena: string, identificadorDispositivo: string,
  ): Promise<Sesion> {
    return this.pedir<Sesion>('/autenticacion/sesion', {
      metodo: 'POST',
      cuerpo: { nombreUsuario, contrasena, identificadorDispositivo },
    });
  }

  async refrescar(tokenRefresco: string): Promise<Sesion> {
    return this.pedir<Sesion>('/autenticacion/refresco', {
      metodo: 'POST', cuerpo: { tokenRefresco },
    });
  }

  async descargarJornada(): Promise<JornadaDelDispositivo> {
    return this.pedir<JornadaDelDispositivo>('/campo/jornada');
  }

  async sincronizar(operaciones: readonly OperacionEnCola[]): Promise<ResultadoSincronizacion> {
    return this.pedir<ResultadoSincronizacion>('/sincronizacion/cola', {
      metodo: 'POST', cuerpo: { operaciones },
    });
  }

  async iniciarCarga(peticion: PeticionIniciarCarga): Promise<EstadoDeCarga & { idEvidencia: string }> {
    return this.pedir('/evidencias/cargas', { metodo: 'POST', cuerpo: peticion });
  }

  async consultarCarga(idCarga: string): Promise<EstadoDeCarga> {
    return this.pedir<EstadoDeCarga>(`/evidencias/cargas/${idCarga}`);
  }

  async enviarParte(idCarga: string, desplazamiento: number, parte: Uint8Array): Promise<EstadoDeCarga> {
    return this.pedir<EstadoDeCarga>(`/evidencias/cargas/${idCarga}`, {
      metodo: 'PATCH',
      binario: parte,
      cabeceras: { 'X-Desplazamiento': String(desplazamiento) },
    });
  }

  async cerrarCarga(idCarga: string, idEvidencia: string): Promise<{ sincronizada: boolean }> {
    return this.pedir(`/evidencias/cargas/${idCarga}/cerrar`, {
      metodo: 'POST', cuerpo: { idEvidencia },
    });
  }
}
