/**
 * Cliente de la API del panel.
 *
 * Igual que en la app movil, el token de acceso vence y hay uno de refresco
 * detras. La diferencia esta en que aqui el usuario ESTA MIRANDO: si la
 * sesion caduca a media tarde, la persona no puede perder lo que tenia en
 * pantalla por un 401. Por eso el reintento con refresco es transparente y
 * solo se cierra sesion cuando el refresco tampoco vale.
 *
 * Y una decision que se nota en todo el modulo: las respuestas de error del
 * servidor traen un mensaje escrito para que lo lea una persona. El panel
 * los muestra TAL CUAL, en vez de traducirlos a "Error 422". El trabajo de
 * explicar ya esta hecho del otro lado.
 */
import type {
  EstadoDeCarga, JornadaDelDispositivo, OperacionEnCola, Paginacion,
  PeticionIniciarCarga, RespuestaExitosa, ResultadoSincronizacion, Sesion,
} from '@servitotal/compartido';

export const RAIZ_API = '/api/v1';

export class ErrorDeApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estadoHttp: number,
    readonly campos?: Record<string, string>,
  ) {
    super(mensaje);
    this.name = 'ErrorDeApi';
  }

  get esDeSesion(): boolean {
    return this.estadoHttp === 401;
  }

  get esDePermiso(): boolean {
    return this.estadoHttp === 403;
  }

  /**
   * Un fallo de red o un 5xx: la operacion puede volver a intentarse tal
   * cual. Lo usa el motor de sincronizacion para decidir si detiene la cola
   * —y la reintenta entera mas tarde— o si sigue con la siguiente.
   */
  get esTransitorio(): boolean {
    return this.estadoHttp === 0 || this.estadoHttp >= 500;
  }
}

export interface PaginaDeDatos<T> {
  readonly datos: readonly T[];
  readonly paginacion: Paginacion;
}

interface CuerpoError {
  error?: { codigo?: string; mensaje?: string; campos?: Record<string, string> };
}

export interface AlmacenDeTokens {
  acceso(): string | null;
  refresco(): string | null;
  guardar(sesion: Sesion): void;
  limpiar(): void;
}

export interface OpcionesPeticion {
  readonly metodo?: string;
  readonly cuerpo?: unknown;
  readonly consulta?: Record<string, string | number | boolean | undefined>;
}

/** Arma la cadena de consulta omitiendo lo que no se indico. */
export function consultaDe(parametros: Record<string, string | number | boolean | undefined>): string {
  const partes = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor === undefined || valor === '') continue;
    partes.set(clave, String(valor));
  }
  const texto = partes.toString();
  return texto === '' ? '' : `?${texto}`;
}

export class ClienteApi {
  constructor(
    private readonly tokens: AlmacenDeTokens,
    /** Se llama cuando la sesion ya no se puede renovar. */
    private readonly alPerderSesion: () => void,
    private readonly raiz: string = RAIZ_API,
  ) {}

  async pedir<T>(ruta: string, opciones: OpcionesPeticion = {}, yaReintento = false): Promise<T> {
    const acceso = this.tokens.acceso();
    const cabeceras: Record<string, string> = {
      ...(acceso === null ? {} : { Authorization: `Bearer ${acceso}` }),
      ...(opciones.cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
    };

    const destino = `${this.raiz}${ruta}${consultaDe(opciones.consulta ?? {})}`;

    let respuesta: Response;
    try {
      respuesta = await fetch(destino, {
        method: opciones.metodo ?? 'GET',
        headers: cabeceras,
        ...(opciones.cuerpo === undefined ? {} : { body: JSON.stringify(opciones.cuerpo) }),
      });
    } catch {
      throw new ErrorDeApi(
        'SIN_CONEXION',
        'No se pudo contactar al servidor. Revise la conexion del centro y vuelva a intentar.',
        0,
      );
    }

    if (respuesta.status === 401 && !yaReintento) {
      if (await this.renovar()) return this.pedir<T>(ruta, opciones, true);
      this.alPerderSesion();
    }

    if (respuesta.status === 204) return undefined as T;

    const cuerpo = (await respuesta.json().catch(() => ({}))) as
      RespuestaExitosa<T> & CuerpoError;

    if (!respuesta.ok) {
      throw new ErrorDeApi(
        cuerpo.error?.codigo ?? 'ERROR_DESCONOCIDO',
        // El servidor ya escribio un mensaje para una persona; se usa ese.
        cuerpo.error?.mensaje ?? 'El servidor rechazo la peticion.',
        respuesta.status,
        cuerpo.error?.campos,
      );
    }
    return cuerpo.datos as T;
  }

  /** Listado paginado: devuelve datos y paginacion juntos. */
  async pedirPagina<T>(
    ruta: string, consulta: Record<string, string | number | boolean | undefined> = {},
  ): Promise<PaginaDeDatos<T>> {
    const acceso = this.tokens.acceso();
    const respuesta = await fetch(`${this.raiz}${ruta}${consultaDe(consulta)}`, {
      headers: acceso === null ? {} : { Authorization: `Bearer ${acceso}` },
    }).catch(() => null);

    if (respuesta === null) {
      throw new ErrorDeApi('SIN_CONEXION', 'No se pudo contactar al servidor.', 0);
    }
    if (respuesta.status === 401) {
      if (await this.renovar()) return this.pedirPagina<T>(ruta, consulta);
      this.alPerderSesion();
    }

    const cuerpo = (await respuesta.json().catch(() => ({}))) as
      RespuestaExitosa<readonly T[]> & CuerpoError;
    if (!respuesta.ok) {
      throw new ErrorDeApi(
        cuerpo.error?.codigo ?? 'ERROR_DESCONOCIDO',
        cuerpo.error?.mensaje ?? 'El servidor rechazo la peticion.',
        respuesta.status,
      );
    }
    return {
      datos: cuerpo.datos ?? [],
      paginacion: cuerpo.paginacion ?? { pagina: 1, tamano: 0, total: 0, totalPaginas: 0 },
    };
  }

  private async renovar(): Promise<boolean> {
    const refresco = this.tokens.refresco();
    if (refresco === null) return false;
    try {
      const respuesta = await fetch(`${this.raiz}/autenticacion/refresco`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenRefresco: refresco }),
      });
      if (!respuesta.ok) return false;
      const cuerpo = (await respuesta.json()) as RespuestaExitosa<Sesion>;
      this.tokens.guardar(cuerpo.datos);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Inicia sesion. Con `identificadorDispositivo`, la sesion queda ATADA a
   * ese dispositivo, que es lo que exige el servidor para sincronizar la
   * cola de campo y lo que permite revocarla a distancia.
   */
  async iniciarSesion(
    nombreUsuario: string, contrasena: string, identificadorDispositivo?: string,
  ): Promise<Sesion> {
    const respuesta = await fetch(`${this.raiz}/autenticacion/sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombreUsuario,
        contrasena,
        ...(identificadorDispositivo === undefined ? {} : { identificadorDispositivo }),
      }),
    }).catch(() => null);

    if (respuesta === null) {
      throw new ErrorDeApi('SIN_CONEXION', 'No se pudo contactar al servidor.', 0);
    }
    const cuerpo = (await respuesta.json().catch(() => ({}))) as
      RespuestaExitosa<Sesion> & CuerpoError;
    if (!respuesta.ok) {
      throw new ErrorDeApi(
        cuerpo.error?.codigo ?? 'ERROR_DESCONOCIDO',
        cuerpo.error?.mensaje ?? 'No se pudo iniciar sesion.',
        respuesta.status,
      );
    }
    this.tokens.guardar(cuerpo.datos);
    return cuerpo.datos;
  }

  // ── protocolo de campo ───────────────────────────────────────────────
  //
  // Son los metodos que usa el motor de sincronizacion cuando el tecnico
  // recupera senal. Viven en el mismo cliente que el resto del panel porque
  // es el mismo sistema: la diferencia entre el escritorio del taller y el
  // celular del tecnico es el tamano de la pantalla, no la aplicacion.

  /** Todo lo que el tecnico necesita para trabajar sin senal, de un viaje. */
  async descargarJornada(): Promise<JornadaDelDispositivo> {
    return this.pedir<JornadaDelDispositivo>('/campo/jornada');
  }

  async sincronizar(operaciones: readonly OperacionEnCola[]): Promise<ResultadoSincronizacion> {
    return this.pedir<ResultadoSincronizacion>('/sincronizacion/cola', {
      metodo: 'POST', cuerpo: { operaciones },
    });
  }

  async iniciarCarga(
    peticion: PeticionIniciarCarga,
  ): Promise<EstadoDeCarga & { idEvidencia: string }> {
    return this.pedir('/evidencias/cargas', { metodo: 'POST', cuerpo: peticion });
  }

  async consultarCarga(idCarga: string): Promise<EstadoDeCarga> {
    return this.pedir<EstadoDeCarga>(`/evidencias/cargas/${idCarga}`);
  }

  /**
   * Un trozo del archivo. Va como binario crudo, no como JSON: pasarlo por
   * base64 lo engordaria un tercio, y con mala senal ese tercio se nota.
   */
  async enviarParte(
    idCarga: string, desplazamiento: number, parte: Uint8Array,
  ): Promise<EstadoDeCarga> {
    const acceso = this.tokens.acceso();
    const respuesta = await fetch(`${this.raiz}/evidencias/cargas/${idCarga}`, {
      method: 'PATCH',
      headers: {
        ...(acceso === null ? {} : { Authorization: `Bearer ${acceso}` }),
        'Content-Type': 'application/octet-stream',
        'X-Desplazamiento': String(desplazamiento),
      },
      body: parte as BodyInit,
    }).catch(() => null);

    if (respuesta === null) {
      throw new ErrorDeApi('SIN_CONEXION', 'Se corto el envio de la evidencia.', 0);
    }
    const cuerpo = (await respuesta.json().catch(() => ({}))) as
      RespuestaExitosa<EstadoDeCarga> & CuerpoError;
    if (!respuesta.ok) {
      throw new ErrorDeApi(
        cuerpo.error?.codigo ?? 'ERROR_DESCONOCIDO',
        cuerpo.error?.mensaje ?? 'El servidor rechazo la parte.',
        respuesta.status,
      );
    }
    return cuerpo.datos;
  }

  async cerrarCarga(idCarga: string, idEvidencia: string): Promise<{ sincronizada: boolean }> {
    return this.pedir(`/evidencias/cargas/${idCarga}/cerrar`, {
      metodo: 'POST', cuerpo: { idEvidencia },
    });
  }
}
