/**
 * Almacenamiento local sobre expo-sqlite.
 *
 * Es la implementacion que corre en la tableta. La logica de las colas no
 * la conoce: habla contra los puertos, y por eso se puede probar sin
 * dispositivo.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { TipoOperacion } from '@servitotal/compartido';
import { ESQUEMA_LOCAL } from './esquema-local.js';
import type {
  AlmacenDeCola, AlmacenDeEvidencias, EstadoEvidencia, EstadoLocal,
  FilaEvidencia, FilaOperacion,
} from './puertos.js';

export async function prepararBaseLocal(base: SQLiteDatabase): Promise<void> {
  await base.execAsync(ESQUEMA_LOCAL);
}

/** Marcadores `?` para un IN, que SQLite no admite como arreglo. */
function marcadores(cantidad: number): string {
  return new Array(cantidad).fill('?').join(', ');
}

interface FilaOperacionCruda {
  id_operacion: string;
  orden_en_cola: number;
  tipo_operacion: string;
  momento_dispositivo: string;
  carga: string;
  estado: string;
  intentos: number;
  ultimo_mensaje: string | null;
}

export class ColaSqlite implements AlmacenDeCola {
  constructor(private readonly base: SQLiteDatabase) {}

  async guardar(fila: FilaOperacion): Promise<void> {
    await this.base.runAsync(
      `INSERT OR REPLACE INTO operacion_pendiente
         (id_operacion, orden_en_cola, tipo_operacion, momento_dispositivo, carga,
          estado, intentos, ultimo_mensaje)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [fila.idOperacion, fila.ordenEnCola, fila.tipoOperacion, fila.momentoDispositivo,
        JSON.stringify(fila.carga), fila.estado, fila.intentos, fila.ultimoMensaje],
    );
  }

  async leerPorEstado(estados: readonly EstadoLocal[], limite: number): Promise<FilaOperacion[]> {
    const filas = await this.base.getAllAsync<FilaOperacionCruda>(
      `SELECT * FROM operacion_pendiente WHERE estado IN (${marcadores(estados.length)})
        ORDER BY orden_en_cola LIMIT ?`,
      [...estados, limite],
    );
    return filas.map((fila) => ({
      idOperacion: fila.id_operacion,
      ordenEnCola: fila.orden_en_cola,
      tipoOperacion: fila.tipo_operacion as TipoOperacion,
      momentoDispositivo: fila.momento_dispositivo,
      carga: JSON.parse(fila.carga) as Record<string, unknown>,
      estado: fila.estado as EstadoLocal,
      intentos: fila.intentos,
      ultimoMensaje: fila.ultimo_mensaje,
    }));
  }

  async actualizar(idOperacion: string, cambios: Partial<FilaOperacion>): Promise<void> {
    const columnas: Record<string, unknown> = {};
    if (cambios.estado !== undefined) columnas['estado'] = cambios.estado;
    if (cambios.intentos !== undefined) columnas['intentos'] = cambios.intentos;
    if (cambios.ultimoMensaje !== undefined) columnas['ultimo_mensaje'] = cambios.ultimoMensaje;
    if (cambios.carga !== undefined) columnas['carga'] = JSON.stringify(cambios.carga);
    if (Object.keys(columnas).length === 0) return;

    const asignaciones = Object.keys(columnas).map((columna) => `${columna} = ?`).join(', ');
    await this.base.runAsync(
      `UPDATE operacion_pendiente SET ${asignaciones} WHERE id_operacion = ?`,
      [...Object.values(columnas), idOperacion] as never,
    );
  }

  async eliminar(idsOperacion: readonly string[]): Promise<void> {
    if (idsOperacion.length === 0) return;
    await this.base.runAsync(
      `DELETE FROM operacion_pendiente WHERE id_operacion IN (${marcadores(idsOperacion.length)})`,
      [...idsOperacion],
    );
  }

  async contarPorEstado(estados: readonly EstadoLocal[]): Promise<number> {
    const fila = await this.base.getFirstAsync<{ total: number }>(
      `SELECT count(*) AS total FROM operacion_pendiente WHERE estado IN (${marcadores(estados.length)})`,
      [...estados],
    );
    return fila?.total ?? 0;
  }

  async siguienteOrden(): Promise<number> {
    const fila = await this.base.getFirstAsync<{ tope: number | null }>(
      'SELECT max(orden_en_cola) AS tope FROM operacion_pendiente',
    );
    return (fila?.tope ?? 0) + 1;
  }
}

interface FilaEvidenciaCruda {
  id_local: string;
  id_orden: string;
  clave: string;
  tipo: string;
  ruta_local: string;
  bytes: number;
  huella_digital: string;
  momento_dispositivo: string;
  latitud: number | null;
  longitud: number | null;
  id_carga: string | null;
  id_evidencia: string | null;
  bytes_enviados: number;
  estado: string;
  intentos: number;
}

export class EvidenciasSqlite implements AlmacenDeEvidencias {
  constructor(private readonly base: SQLiteDatabase) {}

  async guardar(fila: FilaEvidencia): Promise<void> {
    await this.base.runAsync(
      `INSERT OR REPLACE INTO evidencia_pendiente
         (id_local, id_orden, clave, tipo, ruta_local, bytes, huella_digital,
          momento_dispositivo, latitud, longitud, id_carga, id_evidencia,
          bytes_enviados, estado, intentos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fila.idLocal, fila.idOrden, fila.clave, fila.tipo, fila.rutaLocal, fila.bytes,
        fila.huellaDigital, fila.momentoDispositivo, fila.latitud, fila.longitud,
        fila.idCarga, fila.idEvidencia, fila.bytesEnviados, fila.estado, fila.intentos],
    );
  }

  async leerPorEstado(estados: readonly EstadoEvidencia[], limite: number): Promise<FilaEvidencia[]> {
    const filas = await this.base.getAllAsync<FilaEvidenciaCruda>(
      `SELECT * FROM evidencia_pendiente WHERE estado IN (${marcadores(estados.length)})
        ORDER BY momento_dispositivo LIMIT ?`,
      [...estados, limite],
    );
    return filas.map((fila) => ({
      idLocal: fila.id_local,
      idOrden: fila.id_orden,
      clave: fila.clave,
      tipo: fila.tipo,
      rutaLocal: fila.ruta_local,
      bytes: fila.bytes,
      huellaDigital: fila.huella_digital,
      momentoDispositivo: fila.momento_dispositivo,
      latitud: fila.latitud,
      longitud: fila.longitud,
      idCarga: fila.id_carga,
      idEvidencia: fila.id_evidencia,
      bytesEnviados: fila.bytes_enviados,
      estado: fila.estado as EstadoEvidencia,
      intentos: fila.intentos,
    }));
  }

  async actualizar(idLocal: string, cambios: Partial<FilaEvidencia>): Promise<void> {
    const mapa: Readonly<Record<string, string>> = {
      idCarga: 'id_carga', idEvidencia: 'id_evidencia', bytesEnviados: 'bytes_enviados',
      estado: 'estado', intentos: 'intentos',
    };
    const columnas: Record<string, unknown> = {};
    for (const [campo, columna] of Object.entries(mapa)) {
      const valor = (cambios as Record<string, unknown>)[campo];
      if (valor !== undefined) columnas[columna] = valor;
    }
    if (Object.keys(columnas).length === 0) return;

    const asignaciones = Object.keys(columnas).map((columna) => `${columna} = ?`).join(', ');
    await this.base.runAsync(
      `UPDATE evidencia_pendiente SET ${asignaciones} WHERE id_local = ?`,
      [...Object.values(columnas), idLocal] as never,
    );
  }

  async eliminar(idsLocal: readonly string[]): Promise<void> {
    if (idsLocal.length === 0) return;
    await this.base.runAsync(
      `DELETE FROM evidencia_pendiente WHERE id_local IN (${marcadores(idsLocal.length)})`,
      [...idsLocal],
    );
  }

  async contarPorEstado(estados: readonly EstadoEvidencia[]): Promise<number> {
    const fila = await this.base.getFirstAsync<{ total: number }>(
      `SELECT count(*) AS total FROM evidencia_pendiente WHERE estado IN (${marcadores(estados.length)})`,
      [...estados],
    );
    return fila?.total ?? 0;
  }
}
