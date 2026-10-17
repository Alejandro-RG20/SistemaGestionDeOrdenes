/**
 * Lectura de la respuesta del portal publico con el formato REAL del
 * servidor ({ success, data } / { success: false, error: { code, message } }).
 */
import { describe, expect, it } from 'vitest';
import { leerRespuestaDelPortal } from '../src/pantallas/ConsultaPublica.js';
import { ErrorDeApi } from '../src/api/cliente.js';

describe('respuesta del portal', () => {
  it('una consulta correcta devuelve la orden', () => {
    const orden = leerRespuestaDelPortal(200, {
      success: true, data: { numeroOrden: 'OS-2026-000123', cliente: 'M. B.', articulo: 'LG GT32' },
    });
    expect(orden.numeroOrden).toBe('OS-2026-000123');
  });

  it('un error muestra el mensaje del servidor', () => {
    const mensaje = 'No encontramos una orden con ese numero y ese telefono.';
    try {
      leerRespuestaDelPortal(404, { success: false, error: { code: 'NO_ENCONTRADO', message: mensaje } });
      throw new Error('debia fallar');
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorDeApi);
      expect((error as ErrorDeApi).message).toBe(mensaje);
    }
  });

  it('una respuesta sin datos no rompe la pantalla: da un error legible', () => {
    expect(() => leerRespuestaDelPortal(200, { datos: {} })).toThrow(/No se pudo leer la respuesta/);
  });
});
