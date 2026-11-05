/** Lista de verificacion (RF-22) y medicion fuera de rango (RF-23), sin base. */
import { describe, expect, it } from 'vitest';
import { describirMedicion, estaFueraDeRango, evaluarChecklist, type PlantillaChecklist } from '@servitotal/compartido';

const PLANTILLA: PlantillaChecklist = {
  id: 'p', nombre: 'Diagnostico refrigeracion',
  items: [
    { id: 'temp', orden: 1, etiqueta: 'Temperatura del congelador', tipoCampo: 'numerico', unidad: 'C', rangoMin: -22, rangoMax: -14, opciones: null, obligatorio: true },
    { id: 'empaque', orden: 2, etiqueta: 'Empaque en buen estado', tipoCampo: 'booleano', unidad: null, rangoMin: null, rangoMax: null, opciones: null, obligatorio: true },
    { id: 'filtro', orden: 3, etiqueta: 'Filtro', tipoCampo: 'seleccion', unidad: null, rangoMin: null, rangoMax: null, opciones: ['si', 'no'], obligatorio: true },
    { id: 'obs', orden: 4, etiqueta: 'Observaciones', tipoCampo: 'texto', unidad: null, rangoMin: null, rangoMax: null, opciones: null, obligatorio: false },
    { id: 'foto', orden: 5, etiqueta: 'Foto del compresor', tipoCampo: 'foto', unidad: null, rangoMin: null, rangoMax: null, opciones: null, obligatorio: true },
  ],
};

describe('lista de verificacion', () => {
  it('dentro de rango: sin advertencias; la foto no se exige aqui (viaja como evidencia)', () => {
    const r = evaluarChecklist(PLANTILLA, [
      { idItem: 'temp', valor: -18 }, { idItem: 'empaque', valor: true }, { idItem: 'filtro', valor: 'si' },
    ]);
    expect(r.faltantes).toEqual([]);
    expect(r.errores).toEqual([]);
    expect(r.fueraDeRango).toEqual([]);
    expect(r.mediciones).toHaveLength(3);
  });

  it('fuera de rango: se marca y se describe con el rango esperado', () => {
    const r = evaluarChecklist(PLANTILLA, [
      { idItem: 'temp', valor: '-5' }, { idItem: 'empaque', valor: false }, { idItem: 'filtro', valor: 'no' },
    ]);
    expect(r.fueraDeRango).toHaveLength(1);
    expect(describirMedicion(r.fueraDeRango[0]!)).toBe('Temperatura del congelador: -5 C (esperado entre -22 y -14 C)');
    expect(estaFueraDeRango(-14, -22, -14)).toBe(false);
    expect(estaFueraDeRango(-13.9, -22, -14)).toBe(true);
  });

  it('obligatorios faltantes y valores del tipo equivocado', () => {
    const r = evaluarChecklist(PLANTILLA, [
      { idItem: 'temp', valor: 'mucho' }, { idItem: 'filtro', valor: 'tal vez' }, { idItem: 'otro', valor: 1 },
    ]);
    expect(r.faltantes).toEqual(['Empaque en buen estado']);
    expect(r.errores).toEqual(expect.arrayContaining([
      'Temperatura del congelador: escriba un numero.', 'Filtro: elija una de las opciones.',
      'Una respuesta no corresponde a ningun campo de la lista de verificacion.',
    ]));
  });
});
