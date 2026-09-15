/**
 * La cola local: orden, idempotencia y la regla que la gobierna —nada se
 * borra del dispositivo sin confirmacion del servidor—.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ESTADO_OPERACION, TIPO_OPERACION } from '@servitotal/compartido';
import { ColaEnMemoria } from '../src/datos/almacen-memoria.js';
import { ESTADO_LOCAL } from '../src/datos/puertos.js';
import { ColaDeOperaciones } from '../src/sincronizacion/cola.js';
import { generadorSecuencial } from './apoyo.js';

let almacen: ColaEnMemoria;
let cola: ColaDeOperaciones;

beforeEach(() => {
  almacen = new ColaEnMemoria();
  cola = new ColaDeOperaciones(almacen, generadorSecuencial());
});

describe('la cola conserva el orden', () => {
  it('cada accion recibe la siguiente posicion', async () => {
    const primera = await cola.encolar({
      tipoOperacion: TIPO_OPERACION.ORDEN_CREAR, carga: { falla: 'No enfria' },
    });
    const segunda = await cola.encolar({
      tipoOperacion: TIPO_OPERACION.DIAGNOSTICO_REGISTRAR, carga: { fallaReal: 'Compresor' },
    });

    expect(primera.ordenEnCola).toBe(1);
    expect(segunda.ordenEnCola).toBe(2);
  });

  it('el lote sale en el orden en que se registro, no en otro', async () => {
    for (const falla of ['primera', 'segunda', 'tercera', 'cuarta']) {
      await cola.encolar({ tipoOperacion: TIPO_OPERACION.ORDEN_CREAR, carga: { falla } });
    }
    const lote = await cola.siguienteLote();
    expect(lote.map((fila) => fila.carga['falla'])).toEqual(
      ['primera', 'segunda', 'tercera', 'cuarta'],
    );
  });

  it('genera un UUID propio si no se le da uno', async () => {
    const fila = await cola.encolar({ tipoOperacion: TIPO_OPERACION.ORDEN_CREAR, carga: {} });
    expect(fila.idOperacion).toBe('op-0001');
  });

  it('respeta el identificador que se le pasa, para reusar el de la orden', async () => {
    const fila = await cola.encolar({
      tipoOperacion: TIPO_OPERACION.ORDEN_CREAR, carga: {}, idOperacion: 'uuid-de-la-orden',
    });
    expect(fila.idOperacion).toBe('uuid-de-la-orden');
  });

  it('guarda el momento del dispositivo, que es cuando ocurrio de verdad', async () => {
    const cuando = '2026-09-15T08:30:00.000Z';
    const fila = await cola.encolar({
      tipoOperacion: TIPO_OPERACION.DIAGNOSTICO_REGISTRAR, carga: {}, momentoDispositivo: cuando,
    });
    expect(fila.momentoDispositivo).toBe(cuando);
  });
});

describe('nada se borra sin confirmacion del servidor', () => {
  it('una operacion aplicada y confirmada se borra', async () => {
    const fila = await cola.encolar({ tipoOperacion: TIPO_OPERACION.ORDEN_CREAR, carga: {} });
    await cola.aplicarVeredicto(fila.idOperacion, ESTADO_OPERACION.APLICADA, true, 'Aplicada.');

    expect(await cola.purgarConfirmadas()).toBe(1);
    expect(almacen.todas()).toHaveLength(0);
  });

  it('una operacion en excepcion TAMBIEN se borra: el servidor la conserva integra', async () => {
    const fila = await cola.encolar({ tipoOperacion: TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO, carga: {} });
    await cola.aplicarVeredicto(
      fila.idOperacion, ESTADO_OPERACION.EN_EXCEPCION, true, 'Se conserva el trabajo.',
    );

    expect(await cola.purgarConfirmadas()).toBe(1);
    expect(almacen.todas()).toHaveLength(0);
  });

  it('sin confirmacion NO se borra y vuelve a pendiente para reintentarse', async () => {
    const fila = await cola.encolar({ tipoOperacion: TIPO_OPERACION.ORDEN_CREAR, carga: {} });
    await cola.marcarEnviando([fila]);
    await cola.aplicarVeredicto(
      fila.idOperacion, ESTADO_OPERACION.APLICADA, false, 'No se pudo procesar ahora.',
    );

    expect(await cola.purgarConfirmadas()).toBe(0);
    expect(almacen.todas()).toHaveLength(1);
    expect(almacen.todas()[0]!.estado).toBe(ESTADO_LOCAL.PENDIENTE);
    expect(await cola.pendientes()).toBe(1);
  });

  it('lo que quedo en enviando vuelve al lote: puede que la respuesta se perdiera', async () => {
    const fila = await cola.encolar({ tipoOperacion: TIPO_OPERACION.ORDEN_CREAR, carga: {} });
    await cola.marcarEnviando([fila]);

    // La app murio aqui, sin veredicto. Al abrir de nuevo:
    const lote = await cola.siguienteLote();
    expect(lote).toHaveLength(1);
    expect(lote[0]!.idOperacion).toBe(fila.idOperacion);
    expect(lote[0]!.intentos).toBe(1);
  });

  it('cuenta los intentos, para poder avisar de una operacion trabada', async () => {
    const fila = await cola.encolar({ tipoOperacion: TIPO_OPERACION.ORDEN_CREAR, carga: {} });
    await cola.marcarEnviando([fila]);
    const primer = (await cola.siguienteLote())[0]!;
    await cola.marcarEnviando([primer]);

    expect((await cola.siguienteLote())[0]!.intentos).toBe(2);
  });
});

describe('formato del protocolo', () => {
  it('la fila local se traduce a lo que espera el servidor', async () => {
    const fila = await cola.encolar({
      tipoOperacion: TIPO_OPERACION.INVENTARIO_CONSUMO,
      carga: { idOrden: 'orden-1', cantidad: 2 },
      momentoDispositivo: '2026-09-15T10:00:00.000Z',
    });

    expect(ColaDeOperaciones.aOperacionEnCola(fila)).toEqual({
      idOperacion: fila.idOperacion,
      tipoOperacion: TIPO_OPERACION.INVENTARIO_CONSUMO,
      momentoDispositivo: '2026-09-15T10:00:00.000Z',
      carga: { idOrden: 'orden-1', cantidad: 2 },
    });
  });
});
