/**
 * Donde viven los tokens del panel.
 *
 * En `sessionStorage`, no en `localStorage`: las computadoras del centro las
 * comparten varias personas por turno, y una sesion que sobrevive a cerrar
 * el navegador es una sesion que el siguiente turno hereda sin saberlo.
 * Cerrando la pestana se acaba, que es lo que la gente espera.
 *
 * Se declara como interfaz para poder probar el cliente sin navegador.
 */
import type { Sesion, UsuarioAutenticado } from '@servitotal/compartido';
import type { AlmacenDeTokens } from '../api/cliente.js';

const CLAVE_ACCESO = 'servitotal.acceso';
const CLAVE_REFRESCO = 'servitotal.refresco';
const CLAVE_USUARIO = 'servitotal.usuario';

export class TokensEnNavegador implements AlmacenDeTokens {
  acceso(): string | null {
    return this.leer(CLAVE_ACCESO);
  }

  refresco(): string | null {
    return this.leer(CLAVE_REFRESCO);
  }

  guardar(sesion: Sesion): void {
    this.escribir(CLAVE_ACCESO, sesion.tokenAcceso);
    this.escribir(CLAVE_REFRESCO, sesion.tokenRefresco);
    this.escribir(CLAVE_USUARIO, JSON.stringify(sesion.usuario));
  }

  usuario(): UsuarioAutenticado | null {
    const guardado = this.leer(CLAVE_USUARIO);
    if (guardado === null) return null;
    try {
      return JSON.parse(guardado) as UsuarioAutenticado;
    } catch {
      // Dato corrupto: se trata como si no hubiera sesion, no se revienta.
      return null;
    }
  }

  limpiar(): void {
    for (const clave of [CLAVE_ACCESO, CLAVE_REFRESCO, CLAVE_USUARIO]) {
      try {
        sessionStorage.removeItem(clave);
      } catch { /* almacenamiento bloqueado */ }
    }
  }

  private leer(clave: string): string | null {
    try {
      return sessionStorage.getItem(clave);
    } catch {
      // Navegador con almacenamiento bloqueado: se trabaja sin sesion
      // persistente en vez de dejar el panel inservible.
      return null;
    }
  }

  private escribir(clave: string, valor: string): void {
    try {
      sessionStorage.setItem(clave, valor);
    } catch { /* almacenamiento bloqueado */ }
  }
}

/** Almacen en memoria, para las pruebas. */
export class TokensEnMemoria implements AlmacenDeTokens {
  private valores = new Map<string, string>();

  acceso(): string | null { return this.valores.get(CLAVE_ACCESO) ?? null; }
  refresco(): string | null { return this.valores.get(CLAVE_REFRESCO) ?? null; }

  guardar(sesion: Sesion): void {
    this.valores.set(CLAVE_ACCESO, sesion.tokenAcceso);
    this.valores.set(CLAVE_REFRESCO, sesion.tokenRefresco);
    this.valores.set(CLAVE_USUARIO, JSON.stringify(sesion.usuario));
  }

  usuario(): UsuarioAutenticado | null {
    const guardado = this.valores.get(CLAVE_USUARIO);
    return guardado === undefined ? null : (JSON.parse(guardado) as UsuarioAutenticado);
  }

  limpiar(): void { this.valores.clear(); }
}
