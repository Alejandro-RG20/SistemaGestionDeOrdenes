/**
 * Los adaptadores de IndexedDB: lo que guarda el trabajo del tecnico entre
 * una casa sin cobertura y el taller.
 *
 * Se prueban contra IndexedDB de verdad porque lo que puede salir mal son
 * las rarezas del API, no la logica —esa ya esta probada en `cola.prueba`
 * contra el almacen en memoria—. Aqui interesan tres cosas concretas, y las
 * tres pueden costar una jornada de trabajo:
 *
 *   1. Que la cola salga SIEMPRE en el orden en que se registro.
 *   2. Que actualizar una fila no la pise entera.
 *   3. Que leer un trozo de un archivo devuelva exactamente esos bytes,
 *      porque sobre ellos se calcula la huella que el servidor rehashea.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TIPO_OPERACION } from '@servitotal/compartido';
import {
  ArchivosIndexedDB, ColaIndexedDB, ESTADO_EVIDENCIA, ESTADO_LOCAL, EvidenciasIndexedDB,
} from '../src/campo/almacen-indexeddb.js';
import type { FilaEvidencia, FilaOperacion } from '../src/campo/puertos.js';
import { baseLimpia } from './apoyo-navegador.js';

function operacion(parcial: Partial<FilaOperacion> = {}): FilaOperacion {
  return {
    idOperacion: 'op-1',
    ordenEnCola: 1,
    tipoOperacion: TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO,
    momentoDispositivo: '2026-09-16T10:00:00.000Z',
    carga: { idOrden: 'orden-1' },
    estado: ESTADO_LOCAL.PENDIENTE,
    intentos: 0,
    ultimoMensaje: null,
    ...parcial,
  };
}

function evidencia(parcial: Partial<FilaEvidencia> = {}): FilaEvidencia {
  return {
    idLocal: 'ev-1',
    idOrden: 'orden-1',
    clave: 'foto_articulo',
    tipo: 'foto',
    rutaLocal: 'evidencia/ev-1',
    bytes: 1024,
    huellaDigital: 'abc',
    momentoDispositivo: '2026-09-16T10:00:00.000Z',
    latitud: null,
    longitud: null,
    idCarga: null,
    idEvidencia: null,
    bytesEnviados: 0,
    estado: ESTADO_EVIDENCIA.CAPTURADA,
    intentos: 0,
    ...parcial,
  };
}

describe('cola de operaciones sobre IndexedDB', () => {
  let cola: ColaIndexedDB;

  beforeEach(async () => { cola = new ColaIndexedDB(await baseLimpia()); });

  it('devuelve la cola en su orden, no en el de las claves', async () => {
    // A proposito al reves: si se leyera por clave primaria, «op-3»
    // vendria antes que «op-10» y el servidor recibiria el cambio de estado
    // antes que el diagnostico que lo justifica.
    await cola.guardar(operacion({ idOperacion: 'op-10', ordenEnCola: 1 }));
    await cola.guardar(operacion({ idOperacion: 'op-3', ordenEnCola: 2 }));
    await cola.guardar(operacion({ idOperacion: 'op-7', ordenEnCola: 3 }));

    const filas = await cola.leerPorEstado([ESTADO_LOCAL.PENDIENTE], 10);
    expect(filas.map((fila) => fila.idOperacion)).toEqual(['op-10', 'op-3', 'op-7']);
  });

  it('filtra por estado y respeta el limite', async () => {
    await cola.guardar(operacion({ idOperacion: 'a', ordenEnCola: 1 }));
    await cola.guardar(operacion({
      idOperacion: 'b', ordenEnCola: 2, estado: ESTADO_LOCAL.CONFIRMADA,
    }));
    await cola.guardar(operacion({ idOperacion: 'c', ordenEnCola: 3 }));

    expect((await cola.leerPorEstado([ESTADO_LOCAL.PENDIENTE], 10)).map((f) => f.idOperacion))
      .toEqual(['a', 'c']);
    expect((await cola.leerPorEstado([ESTADO_LOCAL.PENDIENTE], 1)).map((f) => f.idOperacion))
      .toEqual(['a']);
    expect(await cola.contarPorEstado([ESTADO_LOCAL.PENDIENTE])).toBe(2);
  });

  it('actualizar cambia solo lo indicado y conserva la carga', async () => {
    await cola.guardar(operacion({ carga: { idOrden: 'orden-1', hacia: 'en_diagnostico' } }));
    await cola.actualizar('op-1', { estado: ESTADO_LOCAL.ENVIANDO, intentos: 1 });

    const [fila] = await cola.leerPorEstado([ESTADO_LOCAL.ENVIANDO], 10);
    expect(fila?.intentos).toBe(1);
    // La carga es el trabajo del tecnico: una actualizacion parcial que la
    // borrara dejaria una operacion vacia que el servidor rechaza.
    expect(fila?.carga).toEqual({ idOrden: 'orden-1', hacia: 'en_diagnostico' });
  });

  it('actualizar una fila que ya no esta no crea una fila nueva', async () => {
    await cola.actualizar('fantasma', { estado: ESTADO_LOCAL.CONFIRMADA });
    expect(await cola.contarPorEstado([ESTADO_LOCAL.CONFIRMADA])).toBe(0);
  });

  it('la siguiente posicion continua la cola, tambien tras borrar el ultimo', async () => {
    expect(await cola.siguienteOrden()).toBe(1);

    await cola.guardar(operacion({ idOperacion: 'a', ordenEnCola: 1 }));
    await cola.guardar(operacion({ idOperacion: 'b', ordenEnCola: 2 }));
    expect(await cola.siguienteOrden()).toBe(3);

    await cola.eliminar(['b']);
    // Baja a 2 porque la posicion sale del maximo vivo. No importa que se
    // reuse: lo que el protocolo exige es el ORDEN RELATIVO de lo que
    // todavia esta en la cola, no que el contador nunca retroceda.
    expect(await cola.siguienteOrden()).toBe(2);
  });

  it('eliminar sin identificadores no toca nada', async () => {
    await cola.guardar(operacion());
    await cola.eliminar([]);
    expect(await cola.contarPorEstado([ESTADO_LOCAL.PENDIENTE])).toBe(1);
  });
});

describe('cola de evidencias sobre IndexedDB', () => {
  let evidencias: EvidenciasIndexedDB;

  beforeEach(async () => { evidencias = new EvidenciasIndexedDB(await baseLimpia()); });

  it('lee las que faltan por subir y cuenta solo esas', async () => {
    await evidencias.guardar(evidencia({ idLocal: 'ev-1' }));
    await evidencias.guardar(evidencia({ idLocal: 'ev-2', estado: ESTADO_EVIDENCIA.SUBIENDO }));
    await evidencias.guardar(evidencia({ idLocal: 'ev-3', estado: ESTADO_EVIDENCIA.CONFIRMADA }));

    const pendientes = await evidencias.leerPorEstado(
      [ESTADO_EVIDENCIA.CAPTURADA, ESTADO_EVIDENCIA.SUBIENDO], 10,
    );
    expect(pendientes.map((fila) => fila.idLocal).sort()).toEqual(['ev-1', 'ev-2']);
    expect(await evidencias.contarPorEstado([ESTADO_EVIDENCIA.CONFIRMADA])).toBe(1);
  });

  it('anotar el avance no pierde la huella ni la ruta del archivo', async () => {
    await evidencias.guardar(evidencia());
    await evidencias.actualizar('ev-1', {
      idCarga: 'carga-1', bytesEnviados: 512, estado: ESTADO_EVIDENCIA.SUBIENDO,
    });

    const [fila] = await evidencias.leerPorEstado([ESTADO_EVIDENCIA.SUBIENDO], 10);
    expect(fila?.bytesEnviados).toBe(512);
    expect(fila?.huellaDigital).toBe('abc');
    expect(fila?.rutaLocal).toBe('evidencia/ev-1');
  });
});

describe('archivos de evidencia sobre IndexedDB', () => {
  let archivos: ArchivosIndexedDB;

  beforeEach(async () => { archivos = new ArchivosIndexedDB(await baseLimpia()); });

  /**
   * La subida va por partes y la huella se calcula sobre los bytes crudos.
   * Si `leerParte` devolviera un byte de mas o de menos, el servidor
   * rechazaria la evidencia por huella y el motor volveria a intentarlo sin
   * fin: no un error visible, sino una foto que no sube jamas.
   */
  it('devuelve exactamente el trozo pedido, y el ultimo aunque sea corto', async () => {
    const contenido = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await archivos.guardarArchivo('evidencia/ev-1', new Blob([contenido]));

    expect(Array.from(await archivos.leerParte('evidencia/ev-1', 0, 4)))
      .toEqual([0, 1, 2, 3]);
    expect(Array.from(await archivos.leerParte('evidencia/ev-1', 4, 4)))
      .toEqual([4, 5, 6, 7]);
    // El ultimo trozo pide 4 y solo quedan 2: tiene que devolver 2, no
    // rellenar ni fallar.
    expect(Array.from(await archivos.leerParte('evidencia/ev-1', 8, 4)))
      .toEqual([8, 9]);
  });

  it('pedir un archivo que ya se borro lo dice con claridad', async () => {
    await expect(archivos.leerParte('evidencia/perdida', 0, 4))
      .rejects.toThrow(/ya no esta en este dispositivo/);
  });

  it('borrar el archivo lo quita de verdad', async () => {
    await archivos.guardarArchivo('evidencia/ev-1', new Blob([new Uint8Array([1])]));
    await archivos.eliminar('evidencia/ev-1');
    expect(await archivos.obtenerArchivo('evidencia/ev-1')).toBeUndefined();
  });
});
