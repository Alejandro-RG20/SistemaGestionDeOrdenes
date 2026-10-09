/**
 * Lectura de excepciones de sincronizacion, sin base de datos.
 *
 * Lo que se fija: las tres formas de carga se leen, los datos que se
 * contradicen se señalan en vez de elegir uno, y nunca se inventa un estado.
 */
import { describe, expect, it } from 'vitest';
import { leerExcepcion } from '../../src/dominio/sincronizacion/lectura-excepcion.js';

const ORDEN = '0ac52d04-8400-4f3c-be57-d0ed8db40319';

describe('operacion rechazada, tal como la envio el dispositivo', () => {
  it('nombra la operacion, el momento y cada campo de la carga', () => {
    const lectura = leerExcepcion({
      motivo: 'La orden ya no admite ese paso: cambio de estado mientras el dispositivo estaba sin conexion.',
      estadoActualOrden: 'en_reparacion',
      cargaOriginal: {
        idOperacion: 'b5b1e7f0-0000-4000-8000-000000000001',
        tipoOperacion: 'visita.registrar',
        momentoDispositivo: '2026-05-08T23:42:14.623Z',
        carga: { idOrden: ORDEN, resultado: 'cliente_ausente', horaLlegada: '2026-05-08T23:30:00.000Z' },
      },
    });

    expect(lectura.forma).toBe('operacion_rechazada');
    expect(lectura.operacion).toBe('Resultado de la visita al domicilio');
    expect(lectura.operacionReconocida).toBe(true);
    expect(lectura.momentoDispositivo).toBe('2026-05-08T23:42:14.623Z');
    expect(lectura.detalles).toContainEqual({ etiqueta: 'Resultado', valor: 'cliente_ausente' });
    expect(lectura.estadoAnotado).toBeNull();
    expect(lectura.estadoActualOrden).toBe('en_reparacion');
    expect(lectura.condicion).toMatch(/visita programada sin resultado/);
    expect(lectura.advertencias).toEqual([]);
  });
});

describe('consumo aceptado con diferencia', () => {
  it('lee la operacion envuelta y la diferencia', () => {
    const lectura = leerExcepcion({
      motivo: 'Se consumio un repuesto que no figuraba en la bodega movil.',
      estadoActualOrden: 'en_reparacion',
      cargaOriginal: {
        operacion: {
          idOperacion: 'b5b1e7f0-0000-4000-8000-000000000002',
          tipoOperacion: 'inventario.consumo',
          momentoDispositivo: '2026-05-08T10:00:00.000Z',
          carga: { idOrden: ORDEN, idRepuesto: 'r-1', cantidad: 2 },
        },
        diferencia: { faltante: 1 },
      },
    });

    expect(lectura.forma).toBe('aceptada_con_diferencia');
    expect(lectura.operacion).toBe('Consumo de repuesto en campo');
    expect(lectura.detalles).toContainEqual({ etiqueta: 'Cantidad', valor: '2' });
    expect(lectura.detalles).toContainEqual({ etiqueta: 'Diferencia · faltante', valor: '1' });
    // El motivo habla de repuesto y la operacion es un consumo: cuadra.
    expect(lectura.advertencias).toEqual([]);
  });
});

describe('registro resumido, sin la carga del dispositivo', () => {
  it('dice que no hay carga que reaplicar y señala lo que no cuadra', () => {
    // Un caso real de la base de demostracion: un diagnostico, con un motivo
    // de precio de repuesto, sobre una orden anotada como entregada.
    const lectura = leerExcepcion({
      motivo: 'El precio del repuesto cambio entre la descarga y el consumo. Prevalece el precio que el cliente firmo.',
      estadoActualOrden: 'entregada',
      cargaOriginal: {
        id_orden: ORDEN, estado_local: 'entregada', tipo_operacion: 'diagnostico.registrar',
        momento_dispositivo: '2025-12-30T13:24:00.000Z', registrado_sin_conexion: true,
      },
    });

    expect(lectura.forma).toBe('registro_resumido');
    expect(lectura.registradoSinConexion).toBe(true);
    expect(lectura.estadoAnotado).toBe('entregada');
    expect(lectura.advertencias.join(' ')).toMatch(/no conserva lo que envio el dispositivo/);
    expect(lectura.advertencias.join(' ')).toMatch(/estado final/);
    expect(lectura.advertencias.join(' ')).toMatch(/Motivo y operacion no se corresponden/);
  });

  it('una visita anotada en un estado no final no se marca como imposible: el servidor no lo exige', () => {
    const lectura = leerExcepcion({
      motivo: 'La orden ya no admite ese paso.',
      estadoActualOrden: 'cotizada',
      cargaOriginal: {
        id_orden: ORDEN, estado_local: 'cotizada', tipo_operacion: 'visita.registrar',
        momento_dispositivo: '2026-01-05T11:13:40.386Z', registrado_sin_conexion: true,
      },
    });

    expect(lectura.estadoAnotado).toBe('cotizada');
    expect(lectura.advertencias.some((texto) => /estado final/.test(texto))).toBe(false);
    expect(lectura.condicion).toMatch(/no exige un estado/);
  });

  it('un tipo de operacion que no existe se dice, no se adivina', () => {
    const lectura = leerExcepcion({
      motivo: 'La orden fue anulada mientras el tecnico trabajaba en el domicilio.',
      estadoActualOrden: 'en_diagnostico',
      cargaOriginal: { id_orden: ORDEN, estado_local: 'en_diagnostico', tipo_operacion: 'evidencia.cargar' },
    });

    expect(lectura.operacionReconocida).toBe(false);
    expect(lectura.operacion).toBe('Operacion «evidencia.cargar»');
    expect(lectura.condicion).toBeNull();
    expect(lectura.advertencias.join(' ')).toMatch(/no existe en esta version/);
    expect(lectura.advertencias.join(' ')).toMatch(/fue anulada, pero la orden esta hoy en «en diagnostico»/);
  });
});
