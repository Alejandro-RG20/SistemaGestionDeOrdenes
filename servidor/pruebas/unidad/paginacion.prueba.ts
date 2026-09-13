/** Ninguna consulta de listado se sirve sin paginacion. */
import { describe, expect, it } from 'vitest';
import { ErrorValidacion } from '../../src/comun/errores.js';
import { construirPaginacion, leerParametrosPagina } from '../../src/comun/paginacion.js';

describe('lectura de parametros', () => {
  it('aplica valores por defecto cuando no llegan', () => {
    expect(leerParametrosPagina({})).toEqual({ pagina: 1, tamano: 25, desplazamiento: 0 });
  });

  it('calcula el desplazamiento a partir de la pagina', () => {
    expect(leerParametrosPagina({ pagina: '3', tamano: '20' }))
      .toEqual({ pagina: 3, tamano: 20, desplazamiento: 40 });
  });

  it('rechaza pedir mas del maximo en lugar de recortar en silencio', () => {
    expect(() => leerParametrosPagina({ tamano: '5000' })).toThrow(ErrorValidacion);
  });

  it('rechaza valores que no son enteros positivos', () => {
    for (const malo of ['0', '-2', '1.5', 'muchas', 'null']) {
      expect(() => leerParametrosPagina({ pagina: malo })).toThrow(ErrorValidacion);
      expect(() => leerParametrosPagina({ tamano: malo })).toThrow(ErrorValidacion);
    }
  });
});

describe('construccion de la paginacion', () => {
  it('calcula el total de paginas redondeando hacia arriba', () => {
    const parametros = { pagina: 1, tamano: 25, desplazamiento: 0 };
    expect(construirPaginacion(parametros, 100).totalPaginas).toBe(4);
    expect(construirPaginacion(parametros, 101).totalPaginas).toBe(5);
    expect(construirPaginacion(parametros, 1).totalPaginas).toBe(1);
  });

  it('un resultado vacio tiene cero paginas, no una', () => {
    expect(construirPaginacion({ pagina: 1, tamano: 25, desplazamiento: 0 }, 0))
      .toEqual({ pagina: 1, tamano: 25, total: 0, totalPaginas: 0 });
  });
});
