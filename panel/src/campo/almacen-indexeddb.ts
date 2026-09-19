/**
 * Almacenamiento local del navegador, sobre IndexedDB.
 *
 * Es el adaptador que sustituye a SQLite ahora que el tecnico trabaja desde
 * el navegador de su celular en vez de una aplicacion instalada. La logica
 * de las colas no cambio ni una linea: habla contra los puertos.
 *
 * POR QUE INDEXEDDB Y NO localStorage. `localStorage` es sincrono —bloquea
 * la pantalla mientras escribe—, guarda solo texto y ronda los 5 MB. La cola
 * de una jornada con fotos comprimidas se pasa de ahi sin esfuerzo, y una
 * cuota agotada en `localStorage` lanza una excepcion a mitad de guardar: el
 * tecnico perderia el registro sin enterarse. IndexedDB es asincrono, guarda
 * binarios y tiene cuota de cientos de megas.
 *
 * LO QUE NO RESUELVE NINGUNA DE LAS DOS. El navegador puede borrar el
 * almacenamiento de un sitio si el dispositivo se queda sin espacio. Por eso
 * la aplicacion pide `navigator.storage.persist()` al abrir: le dice al
 * navegador que estos datos no son cache, son el trabajo del dia.
 */
import type { TipoOperacion } from '@servitotal/compartido';
import {
  ESTADO_EVIDENCIA, ESTADO_LOCAL,
  type AlmacenDeCola, type AlmacenDeEvidencias, type EstadoEvidencia, type EstadoLocal,
  type FilaEvidencia, type FilaOperacion, type LectorDeArchivos,
} from './puertos.js';

const NOMBRE_BASE = 'servitotal-campo';
const VERSION = 1;

export const ALMACEN_OPERACIONES = 'operaciones';
export const ALMACEN_EVIDENCIAS = 'evidencias';
/** Los binarios de las evidencias, aparte de sus metadatos. */
export const ALMACEN_ARCHIVOS = 'archivos';
/** El espejo de trabajo: descartable, se vuelve a bajar. */
export const ALMACEN_ESPEJO = 'espejo';

/** Abre —y si hace falta crea— la base local del navegador. */
export function abrirBaseLocal(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BASE, VERSION);

    peticion.onupgradeneeded = () => {
      const base = peticion.result;
      if (!base.objectStoreNames.contains(ALMACEN_OPERACIONES)) {
        const operaciones = base.createObjectStore(ALMACEN_OPERACIONES, { keyPath: 'idOperacion' });
        // El orden de la cola es parte del protocolo: se indexa para poder
        // leerla siempre en el mismo orden en que se registro.
        operaciones.createIndex('ordenEnCola', 'ordenEnCola');
        operaciones.createIndex('estado', 'estado');
      }
      if (!base.objectStoreNames.contains(ALMACEN_EVIDENCIAS)) {
        const evidencias = base.createObjectStore(ALMACEN_EVIDENCIAS, { keyPath: 'idLocal' });
        evidencias.createIndex('estado', 'estado');
      }
      if (!base.objectStoreNames.contains(ALMACEN_ARCHIVOS)) {
        base.createObjectStore(ALMACEN_ARCHIVOS);
      }
      if (!base.objectStoreNames.contains(ALMACEN_ESPEJO)) {
        base.createObjectStore(ALMACEN_ESPEJO);
      }
    };

    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error ?? new Error('No se pudo abrir la base local.'));
  });
}

/**
 * Pide al navegador que no borre estos datos para hacer sitio.
 *
 * Sin esto, el almacenamiento de un sitio web es descartable: el navegador
 * puede vaciarlo cuando el telefono se queda sin espacio. Aqui dentro esta
 * el trabajo de una jornada que todavia no llego al servidor.
 */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  try {
    if (navigator.storage?.persist === undefined) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Envuelve una peticion de IndexedDB en una promesa. */
function comoPromesa<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error ?? new Error('Fallo la operacion local.'));
  });
}

function transaccion(
  base: IDBDatabase, almacenes: string | string[], modo: IDBTransactionMode,
): IDBTransaction {
  return base.transaction(almacenes, modo);
}

// ── cola de operaciones ────────────────────────────────────────────────

export class ColaIndexedDB implements AlmacenDeCola {
  constructor(private readonly base: IDBDatabase) {}

  async guardar(fila: FilaOperacion): Promise<void> {
    const almacen = transaccion(this.base, ALMACEN_OPERACIONES, 'readwrite')
      .objectStore(ALMACEN_OPERACIONES);
    await comoPromesa(almacen.put(fila));
  }

  async leerPorEstado(estados: readonly EstadoLocal[], limite: number): Promise<FilaOperacion[]> {
    const almacen = transaccion(this.base, ALMACEN_OPERACIONES, 'readonly')
      .objectStore(ALMACEN_OPERACIONES);
    // Se recorre por el indice de orden para respetar la posicion en la
    // cola, y se filtra por estado en memoria: son decenas de filas, no
    // miles, y asi el orden queda garantizado por el indice.
    const todas = await comoPromesa(almacen.index('ordenEnCola').getAll());
    return todas.filter((fila) => estados.includes(fila.estado)).slice(0, limite);
  }

  async actualizar(idOperacion: string, cambios: Partial<FilaOperacion>): Promise<void> {
    const almacen = transaccion(this.base, ALMACEN_OPERACIONES, 'readwrite')
      .objectStore(ALMACEN_OPERACIONES);
    const fila = await comoPromesa<FilaOperacion | undefined>(almacen.get(idOperacion));
    if (fila === undefined) return;
    await comoPromesa(almacen.put({ ...fila, ...cambios }));
  }

  async eliminar(idsOperacion: readonly string[]): Promise<void> {
    if (idsOperacion.length === 0) return;
    const almacen = transaccion(this.base, ALMACEN_OPERACIONES, 'readwrite')
      .objectStore(ALMACEN_OPERACIONES);
    for (const id of idsOperacion) await comoPromesa(almacen.delete(id));
  }

  async contarPorEstado(estados: readonly EstadoLocal[]): Promise<number> {
    const filas = await this.leerPorEstado(estados, Number.MAX_SAFE_INTEGER);
    return filas.length;
  }

  async siguienteOrden(): Promise<number> {
    const almacen = transaccion(this.base, ALMACEN_OPERACIONES, 'readonly')
      .objectStore(ALMACEN_OPERACIONES);
    const cursor = await comoPromesa(almacen.index('ordenEnCola').openCursor(null, 'prev'));
    return cursor === null ? 1 : (cursor.value as FilaOperacion).ordenEnCola + 1;
  }
}

// ── cola de evidencias ─────────────────────────────────────────────────

export class EvidenciasIndexedDB implements AlmacenDeEvidencias {
  constructor(private readonly base: IDBDatabase) {}

  async guardar(fila: FilaEvidencia): Promise<void> {
    const almacen = transaccion(this.base, ALMACEN_EVIDENCIAS, 'readwrite')
      .objectStore(ALMACEN_EVIDENCIAS);
    await comoPromesa(almacen.put(fila));
  }

  async leerPorEstado(estados: readonly EstadoEvidencia[], limite: number): Promise<FilaEvidencia[]> {
    const almacen = transaccion(this.base, ALMACEN_EVIDENCIAS, 'readonly')
      .objectStore(ALMACEN_EVIDENCIAS);
    const todas = await comoPromesa(almacen.getAll());
    return todas.filter((fila) => estados.includes(fila.estado)).slice(0, limite);
  }

  async actualizar(idLocal: string, cambios: Partial<FilaEvidencia>): Promise<void> {
    const almacen = transaccion(this.base, ALMACEN_EVIDENCIAS, 'readwrite')
      .objectStore(ALMACEN_EVIDENCIAS);
    const fila = await comoPromesa<FilaEvidencia | undefined>(almacen.get(idLocal));
    if (fila === undefined) return;
    await comoPromesa(almacen.put({ ...fila, ...cambios }));
  }

  async eliminar(idsLocal: readonly string[]): Promise<void> {
    if (idsLocal.length === 0) return;
    const almacen = transaccion(this.base, ALMACEN_EVIDENCIAS, 'readwrite')
      .objectStore(ALMACEN_EVIDENCIAS);
    for (const id of idsLocal) await comoPromesa(almacen.delete(id));
  }

  async contarPorEstado(estados: readonly EstadoEvidencia[]): Promise<number> {
    const filas = await this.leerPorEstado(estados, Number.MAX_SAFE_INTEGER);
    return filas.length;
  }
}

// ── archivos de evidencia ──────────────────────────────────────────────

/**
 * Los binarios viven en su propio almacen, con la ruta local como clave.
 *
 * «Ruta» aqui no es una ruta de disco —el navegador no tiene— sino la clave
 * con la que se guardo el Blob. El resto del codigo no necesita saberlo, y
 * por eso la cola de evidencias sigue hablando de `rutaLocal`.
 */
export class ArchivosIndexedDB implements LectorDeArchivos {
  constructor(private readonly base: IDBDatabase) {}

  async guardarArchivo(clave: string, contenido: Blob): Promise<void> {
    const almacen = transaccion(this.base, ALMACEN_ARCHIVOS, 'readwrite')
      .objectStore(ALMACEN_ARCHIVOS);
    await comoPromesa(almacen.put(contenido, clave));
  }

  async obtenerArchivo(clave: string): Promise<Blob | undefined> {
    const almacen = transaccion(this.base, ALMACEN_ARCHIVOS, 'readonly')
      .objectStore(ALMACEN_ARCHIVOS);
    return comoPromesa<Blob | undefined>(almacen.get(clave));
  }

  async leerParte(ruta: string, desplazamiento: number, largo: number): Promise<Uint8Array> {
    const archivo = await this.obtenerArchivo(ruta);
    if (archivo === undefined) {
      throw new Error(`La evidencia ${ruta} ya no esta en este dispositivo.`);
    }
    const trozo = archivo.slice(desplazamiento, desplazamiento + largo);
    return new Uint8Array(await trozo.arrayBuffer());
  }

  async eliminar(ruta: string): Promise<void> {
    const almacen = transaccion(this.base, ALMACEN_ARCHIVOS, 'readwrite')
      .objectStore(ALMACEN_ARCHIVOS);
    await comoPromesa(almacen.delete(ruta));
  }
}

export { ESTADO_EVIDENCIA, ESTADO_LOCAL };
export type { TipoOperacion };
