/**
 * Los constructores de acciones tienen que producir EXACTAMENTE lo que los
 * ejecutores del servidor exigen. Un campo con otro nombre no da un error
 * en pantalla: da una excepcion de sincronizacion horas despues, con el
 * tecnico ya en otra casa y el trabajo aparentemente hecho.
 */
import { describe, expect, it } from 'vitest';
import { ESTADO_ORDEN, RESULTADO_VISITA, TIPO_OPERACION } from '@servitotal/compartido';
import * as acciones from '../src/dominio/acciones.js';

describe('constructores de acciones sin conexion', () => {
  it('la orden levantada en campo usa su propio id como clave de idempotencia', () => {
    const accion = acciones.crearOrden({
      idOrden: 'orden-1',
      idCliente: 'cliente-1',
      idArticulo: 'articulo-1',
      modalidad: 'ruta',
      fallaReportada: 'No enfria.',
    });

    // Es lo que impide que un reenvio cree dos ordenes para el mismo cliente.
    expect(accion.idOperacion).toBe('orden-1');
    expect(accion.carga['id']).toBe('orden-1');
    expect(accion.tipoOperacion).toBe(TIPO_OPERACION.ORDEN_CREAR);
  });

  it('no manda campos vacios, que el servidor distingue de campos ausentes', () => {
    const accion = acciones.crearOrden({
      idOrden: 'orden-1',
      idCliente: 'cliente-1',
      idArticulo: 'articulo-1',
      modalidad: 'taller',
      fallaReportada: 'Golpeada.',
      direccionServicio: '',
      referenciaUbicacion: undefined,
    });

    expect(Object.keys(accion.carga)).not.toContain('direccionServicio');
    expect(Object.keys(accion.carga)).not.toContain('referenciaUbicacion');
  });

  it('el consumo lleva el precio que el cliente firmo, no el del catalogo', () => {
    const accion = acciones.consumirRepuesto({
      idOrden: 'orden-1',
      idRepuesto: 'repuesto-1',
      idBodegaOrigen: 'bodega-1',
      cantidad: 2,
      // El catalogo del servidor puede decir otra cosa cuando esto llegue.
      precioUnitario: 450,
    });

    expect(accion.carga).toEqual({
      idOrden: 'orden-1',
      idRepuesto: 'repuesto-1',
      idBodegaOrigen: 'bodega-1',
      cantidad: 2,
      precioUnitario: 450,
    });
  });

  it('el consumo de cero unidades no se filtra como campo vacio', () => {
    // `sinVacios` quita '' y null; un cero es un dato, no una ausencia.
    const accion = acciones.consumirRepuesto({
      idOrden: 'orden-1',
      idRepuesto: 'repuesto-1',
      idBodegaOrigen: 'bodega-1',
      cantidad: 1,
      precioUnitario: 0,
    });

    expect(accion.carga['precioUnitario']).toBe(0);
  });

  it('la visita se fecha con la hora de llegada, no con la de sincronizacion', () => {
    const llegada = '2026-09-15T14:05:00.000Z';
    const accion = acciones.registrarVisita({
      idOrden: 'orden-1',
      resultado: RESULTADO_VISITA.CLIENTE_AUSENTE,
      horaLlegada: llegada,
    });

    expect(accion.momentoDispositivo).toBe(llegada);
    expect(accion.carga['horaLlegada']).toBe(llegada);
  });

  it('el traslado al taller registra primero la visita y despues el cambio de estado', () => {
    const generadas = acciones.visitaConTrasladoATaller({
      idOrden: 'orden-1',
      resultado: RESULTADO_VISITA.REQUIERE_TRASLADO_TALLER,
      horaLlegada: '2026-09-15T14:05:00.000Z',
      horaSalida: '2026-09-15T14:40:00.000Z',
    });

    // Al reves, el servidor moveria la orden antes de saber por que.
    expect(generadas.map((accion) => accion.tipoOperacion)).toEqual([
      TIPO_OPERACION.VISITA_REGISTRAR,
      TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO,
    ]);
    expect(generadas[1]?.carga['hacia']).toBe(ESTADO_ORDEN.EN_COLA_TALLER);
  });

  it('la evidencia registra la ficha, nunca el archivo', () => {
    const accion = acciones.registrarEvidencia({
      idOrden: 'orden-1',
      clave: 'foto_articulo',
      tipo: 'foto',
      bytes: 204_800,
      huellaDigital: 'abc123',
    });

    expect(accion.carga['huellaDigital']).toBe('abc123');
    // El binario viaja por la segunda cola, reanudable y por partes.
    expect(Object.keys(accion.carga)).not.toContain('rutaLocal');
  });
});
