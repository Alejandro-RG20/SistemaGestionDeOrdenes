/** Apoyo de las pruebas del panel: un `fetch` de mentira y sesiones falsas. */
import type { Sesion, UsuarioAutenticado } from '@servitotal/compartido';

export interface LlamadaRegistrada {
  readonly url: string;
  readonly metodo: string;
  readonly autorizacion: string | null;
  readonly cuerpo: unknown;
}

export interface RespuestaPreparada {
  readonly estado: number;
  readonly cuerpo: unknown;
}

/**
 * Sustituye `fetch` y va anotando lo que se le pide. Las respuestas se
 * encolan: la primera llamada recibe la primera, y asi.
 */
export class RedSimulada {
  readonly llamadas: LlamadaRegistrada[] = [];
  private cola: RespuestaPreparada[] = [];
  /** Si se activa, la proxima llamada falla como si no hubiera red. */
  sinRed = false;

  responder(estado: number, cuerpo: unknown): this {
    this.cola.push({ estado, cuerpo });
    return this;
  }

  instalar(): void {
    globalThis.fetch = (async (url: string, opciones: RequestInit = {}) => {
      if (this.sinRed) throw new TypeError('Failed to fetch');

      const cabeceras = (opciones.headers ?? {}) as Record<string, string>;
      this.llamadas.push({
        url: String(url),
        metodo: opciones.method ?? 'GET',
        autorizacion: cabeceras['Authorization'] ?? null,
        cuerpo: typeof opciones.body === 'string' ? JSON.parse(opciones.body) : undefined,
      });

      const preparada = this.cola.shift() ?? { estado: 200, cuerpo: { datos: null } };
      return {
        ok: preparada.estado >= 200 && preparada.estado < 300,
        status: preparada.estado,
        json: async () => preparada.cuerpo,
      } as Response;
    }) as typeof fetch;
  }
}

export function usuarioDePrueba(
  permisos: readonly string[], rol = 'jefe_tecnicos',
): UsuarioAutenticado {
  return {
    id: 'usuario-1',
    nombreUsuario: 'jperez',
    nombres: 'Juan Perez',
    rol,
    permisos,
  } as unknown as UsuarioAutenticado;
}

export function sesionDePrueba(usuario: UsuarioAutenticado): Sesion {
  return {
    tokenAcceso: 'acceso-1',
    tokenRefresco: 'refresco-1',
    expiraEn: new Date(Date.now() + 900_000).toISOString(),
    usuario,
  } as unknown as Sesion;
}
