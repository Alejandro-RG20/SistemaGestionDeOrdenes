/**
 * El serializador CSV de los reportes (pliego §43).
 *
 * Lo que se prueba aqui no es que "funcione": es que no se pueda usar el
 * reporte como vehiculo. Un CSV es un archivo que alguien abre en Excel, y
 * Excel ejecuta lo que empiece por `=`, `+`, `-` o `@`. Si un nombre de
 * cliente o una justificacion de ajuste llega a la hoja como formula, el
 * reporte dejo de ser un reporte.
 */
import { describe, expect, it } from 'vitest';
import { aCsv, nombreDeArchivo } from '../../src/modulos/reportes/csv.js';

const columnas = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'nota', etiqueta: 'Nota' },
];

describe('serializacion CSV', () => {
  it('empieza con el BOM, para que Excel no destroce los acentos', () => {
    const salida = aCsv({ columnas, filas: [] });
    expect(salida.startsWith('﻿')).toBe(true);
    // Sin el, «Garantia de proveedor» sale como «GarantÃ­a» en Windows.
    expect(aCsv({ columnas, filas: [{ nombre: 'Garantía', nota: '' }] })).toContain('Garantía');
  });

  it('entrecomilla las celdas con coma, comillas o salto de linea', () => {
    const salida = aCsv({
      columnas,
      filas: [{ nombre: 'Perez, Juan', nota: 'dijo "ya pague"' }],
    });
    expect(salida).toContain('"Perez, Juan"');
    // Las comillas de dentro se duplican, que es como lo exige el formato.
    expect(salida).toContain('"dijo ""ya pague"""');
  });

  it('neutraliza la inyeccion de formulas', () => {
    const salida = aCsv({
      columnas,
      filas: [
        { nombre: '=SUM(A1:A9)', nota: '-2+3' },
        { nombre: '@importar', nota: '+1' },
      ],
    });
    // Cada arranque peligroso queda prefijado: Excel la trata como texto.
    expect(salida).toContain("'=SUM(A1:A9)");
    expect(salida).toContain("'-2+3");
    expect(salida).toContain("'@importar");
    expect(salida).toContain("'+1");
    // Y no queda ninguna celda que ARRANQUE por un caracter de formula.
    for (const linea of salida.replace('﻿', '').trim().split('\r\n')) {
      for (const celda of linea.split(',')) {
        expect(/^[=+\-@]/.test(celda)).toBe(false);
      }
    }
  });

  it('un nulo es una celda vacia, no la palabra «null»', () => {
    const salida = aCsv({ columnas, filas: [{ nombre: 'Ana', nota: null }] });
    expect(salida).toContain('Ana,');
    expect(salida).not.toContain('null');
  });

  it('recorre las COLUMNAS declaradas, no las claves de la fila', () => {
    // A la fila le falta `nota`: la celda queda vacia y las demas no se
    // corren una posicion.
    const salida = aCsv({ columnas, filas: [{ nombre: 'Ana' }] });
    const lineas = salida.replace('﻿', '').trim().split('\r\n');
    expect(lineas[0]).toBe('Nombre,Nota');
    expect(lineas[1]).toBe('Ana,');
  });

  it('una clave de sobra en la fila no aparece en el archivo', () => {
    const salida = aCsv({
      columnas,
      filas: [{ nombre: 'Ana', nota: 'x', interno: 'no deberia salir' }],
    });
    expect(salida).not.toContain('no deberia salir');
  });
});

describe('nombre del archivo', () => {
  it('lleva la clave del reporte y la fecha', () => {
    const nombre = nombreDeArchivo('ordenes_por_estado');
    expect(nombre).toMatch(/^servitotal_ordenes_por_estado_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('no deja pasar separadores de ruta', () => {
    // Llega a una cabecera HTTP: una barra o dos puntos ahi no son un nombre.
    const nombre = nombreDeArchivo('../../etc/passwd');
    expect(nombre).not.toContain('/');
    expect(nombre).not.toContain('..');
  });
});
