/**
 * El enlace de descarga del reporte lleva los filtros de la pantalla.
 *
 * Se prueba la construccion de la consulta y no el `<a>`: lo que puede
 * romperse es que el archivo descargado cubra otro periodo que el que la
 * persona esta mirando, y eso se decide aqui.
 */
import { describe, expect, it } from 'vitest';
import { RAIZ_API, consultaDe } from '../src/api/cliente.js';

const enlace = (clave: string, desde: string, hasta: string): string =>
  `${RAIZ_API}/reportes/${clave}/exportar${consultaDe({
    desde: desde === '' ? undefined : desde,
    hasta: hasta === '' ? undefined : hasta,
  })}`;

describe('enlace de descarga del reporte', () => {
  it('sin rango, no agrega parametros vacios', () => {
    expect(enlace('ordenes_por_estado', '', '')).toBe(
      `${RAIZ_API}/reportes/ordenes_por_estado/exportar`,
    );
  });

  it('con rango, lo lleva igual que la pantalla', () => {
    const url = enlace('tiempos_de_reparacion', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    expect(url).toContain('desde=2026-01-01T00%3A00%3A00.000Z');
    expect(url).toContain('hasta=2026-02-01T00%3A00%3A00.000Z');
  });

  it('con una sola de las dos fechas, lleva solo esa', () => {
    const url = enlace('tiempos_de_reparacion', '2026-01-01T00:00:00.000Z', '');
    expect(url).toContain('desde=');
    expect(url).not.toContain('hasta=');
  });
});
