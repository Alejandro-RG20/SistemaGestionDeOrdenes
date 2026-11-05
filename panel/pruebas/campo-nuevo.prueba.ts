/**
 * Lo nuevo de la aplicacion del tecnico: lectura de codigo (RF-25),
 * cotizacion (RF-27) y lista de verificacion (RF-22) en la cola.
 */
import { describe, expect, it } from 'vitest';
import { TIPO_OPERACION, type PlantillaChecklist } from '@servitotal/compartido';
import { repuestoPorCodigo } from '../src/campo/flujo-campo.js';
import * as acciones from '../src/campo/acciones.js';
import { problemasDe, respuestasDe } from '../src/componentes/ListaVerificacion.js';

const CATALOGO = [
  { id: '1', codigo: 'CAP-35UF' }, { id: '2', codigo: 'CAP-35UF-B' }, { id: '3', codigo: 'TER-01' },
];

describe('lectura de codigo del repuesto (RF-25)', () => {
  it('elige la pieza exacta, sin importar mayusculas ni espacios', () => {
    expect(repuestoPorCodigo(CATALOGO, '  cap-35uf ')?.id).toBe('1');
    expect(repuestoPorCodigo(CATALOGO, 'TER-01')?.id).toBe('3');
  });
  it('un codigo que no esta en el catalogo no elige una pieza parecida', () => {
    expect(repuestoPorCodigo(CATALOGO, 'CAP-35')).toBeNull();
    expect(repuestoPorCodigo(CATALOGO, '')).toBeNull();
  });
});

describe('cotizacion en la cola (RF-27)', () => {
  it('lleva mano de obra y repuestos con el precio mostrado al cliente', () => {
    const accion = acciones.registrarCotizacion({
      idOrden: 'o-1', manoObra: 400, repuestos: [{ idRepuesto: 'r-1', cantidad: 2, precioUnitario: 120 }],
    });
    expect(accion.tipoOperacion).toBe(TIPO_OPERACION.COTIZACION_REGISTRAR);
    expect(accion.carga).toEqual({
      idOrden: 'o-1', manoObra: 400, repuestos: [{ idRepuesto: 'r-1', cantidad: 2, precioUnitario: 120 }],
    });
  });
});

describe('lista de verificacion (RF-22)', () => {
  const plantilla: PlantillaChecklist = {
    id: 'p', nombre: 'Refrigeracion',
    items: [
      { id: 't', orden: 1, etiqueta: 'Temperatura', tipoCampo: 'numerico', unidad: 'C', rangoMin: 2, rangoMax: 8, opciones: null, obligatorio: true },
      { id: 'e', orden: 2, etiqueta: 'Empaque', tipoCampo: 'booleano', unidad: null, rangoMin: null, rangoMax: null, opciones: null, obligatorio: true },
    ],
  };
  it('convierte lo escrito en respuestas y dice lo que falta', () => {
    expect(respuestasDe(plantilla, { t: '4,5', e: true })).toEqual([{ idItem: 't', valor: 4.5 }, { idItem: 'e', valor: true }]);
    expect(problemasDe(plantilla, { t: '4' })).toEqual(['Falta: Empaque.']);
    expect(problemasDe(plantilla, { t: '4', e: false })).toEqual([]);
  });
  it('el diagnostico encolado lleva las mediciones', () => {
    const accion = acciones.registrarDiagnostico({
      idOrden: 'o', idTecnico: 't', fallaReal: 'Compresor sin arranque', mediciones: [{ idItem: 't', valor: 12 }],
    });
    expect(accion.carga['mediciones']).toEqual([{ idItem: 't', valor: 12 }]);
  });
});

describe('ruta por zona (RF-39)', () => {
  it('agrupa por zona en orden alfabetico, por plazo dentro de cada una, y el taller al final', async () => {
    const { agruparPorZona } = await import('../src/campo/flujo-campo.js');
    const grupos = agruparPorZona([
      { numero: 1, zona: null, plazoVenceEn: '2026-01-01' },
      { numero: 2, zona: 'Villa Fontana', plazoVenceEn: '2026-01-03' },
      { numero: 3, zona: 'Altamira', plazoVenceEn: '2026-01-05' },
      { numero: 4, zona: 'Villa Fontana', plazoVenceEn: '2026-01-02' },
    ]);
    expect(grupos.map((g) => g.zona)).toEqual(['Altamira', 'Villa Fontana', 'Sin zona (taller o sin direccion)']);
    expect(grupos[1]!.ordenes.map((o) => o.numero)).toEqual([4, 2]);
  });
});
