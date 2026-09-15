/**
 * Espejo de trabajo: la copia local de lo que el tecnico necesita ver.
 *
 * Es DESCARTABLE. Si se corrompe o se borra, se vuelve a bajar del
 * servidor y no se pierde nada. Lo que no es descartable son las colas:
 * esas son la unica copia del trabajo del dia. Esa distincion es la que
 * decide todo lo que hay aqui —por ejemplo, que la descarga de jornada
 * reemplace el espejo entero sin preguntar, cosa que jamas se le haria a
 * una cola.
 *
 * El espejo tambien se actualiza SIN servidor: cuando el tecnico mueve una
 * orden sin senal, la lista tiene que mostrar el estado nuevo aunque
 * falten horas para que el servidor se entere. Esa escritura local es
 * optimista y se corrige sola en la siguiente descarga.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  EstadoOrden, JornadaDelDispositivo, OrdenDeJornada, ReglaEvidenciaDeJornada,
  RepuestoDeJornada, TipoGarantia,
} from '@servitotal/compartido';

/** Lo que la lista de ordenes necesita, con el saldo local ya aplicado. */
export interface OrdenEnEspejo extends OrdenDeJornada {
  readonly descargadaEn: string;
}

export interface RepuestoConExistencia extends RepuestoDeJornada {
  /** Lo que el tecnico lleva encima segun la ultima descarga y sus consumos. */
  readonly cantidad: number;
}

export interface AlmacenDeEspejo {
  /** Reemplaza el espejo entero por lo recien descargado. */
  reemplazar(jornada: JornadaDelDispositivo): Promise<void>;
  ordenes(): Promise<OrdenEnEspejo[]>;
  orden(idOrden: string): Promise<OrdenEnEspejo | null>;
  /** Anota el estado nuevo sin esperar al servidor. */
  cambiarEstadoLocal(idOrden: string, estado: EstadoOrden): Promise<void>;
  repuestos(): Promise<RepuestoConExistencia[]>;
  /** Descuenta lo consumido en campo. Nunca deja la existencia negativa. */
  descontarExistencia(idRepuesto: string, cantidad: number): Promise<void>;
  reglasEvidencia(tipo: TipoGarantia): Promise<ReglaEvidenciaDeJornada[]>;
  /** Cuando se bajo por ultima vez. Null si nunca. */
  descargadaEn(): Promise<string | null>;
}

// ── implementacion sobre expo-sqlite ────────────────────────────────────

interface FilaOrdenCruda {
  id: string; numero: number; estado: string; modalidad: string; tipo_garantia: string;
  id_cliente: string; cliente: string; id_articulo: string; articulo: string;
  falla_reportada: string; telefono_contacto: string; direccion_servicio: string | null;
  referencia_ubicacion: string | null; zona: string | null; plazo_vence_en: string | null;
  descargada_en: string;
}

function comoOrden(fila: FilaOrdenCruda): OrdenEnEspejo {
  return {
    id: fila.id,
    numero: fila.numero,
    estado: fila.estado as EstadoOrden,
    modalidad: fila.modalidad as OrdenDeJornada['modalidad'],
    tipoGarantia: fila.tipo_garantia as TipoGarantia,
    idCliente: fila.id_cliente,
    cliente: fila.cliente,
    idArticulo: fila.id_articulo,
    articulo: fila.articulo,
    fallaReportada: fila.falla_reportada,
    telefonoContacto: fila.telefono_contacto,
    direccionServicio: fila.direccion_servicio,
    referenciaUbicacion: fila.referencia_ubicacion,
    zona: fila.zona,
    plazoVenceEn: fila.plazo_vence_en,
    descargadaEn: fila.descargada_en,
  };
}

export class EspejoSqlite implements AlmacenDeEspejo {
  constructor(private readonly base: SQLiteDatabase) {}

  /**
   * Se reemplaza dentro de una transaccion: si la escritura se corta a
   * mitad, el tecnico se queda con el espejo viejo —que sirve— y no con
   * media lista.
   */
  async reemplazar(jornada: JornadaDelDispositivo): Promise<void> {
    await this.base.withTransactionAsync(async () => {
      await this.base.runAsync('DELETE FROM orden_local');
      await this.base.runAsync('DELETE FROM repuesto_local');
      await this.base.runAsync('DELETE FROM existencia_local');
      await this.base.runAsync('DELETE FROM regla_evidencia_local');

      for (const orden of jornada.ordenes) {
        await this.base.runAsync(
          `INSERT INTO orden_local
             (id, numero, estado, modalidad, tipo_garantia, cliente, articulo,
              falla_reportada, telefono_contacto, direccion_servicio, zona,
              plazo_vence_en, descargada_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orden.id, orden.numero, orden.estado, orden.modalidad, orden.tipoGarantia,
            orden.cliente, orden.articulo, orden.fallaReportada, orden.telefonoContacto,
            orden.direccionServicio, orden.zona, orden.plazoVenceEn, jornada.descargadaEn],
        );
      }
      for (const repuesto of jornada.repuestos) {
        await this.base.runAsync(
          'INSERT INTO repuesto_local (id, codigo, descripcion, precio) VALUES (?, ?, ?, ?)',
          [repuesto.id, repuesto.codigo, repuesto.descripcion, repuesto.precio],
        );
      }
      for (const existencia of jornada.existencias) {
        await this.base.runAsync(
          'INSERT INTO existencia_local (id_repuesto, cantidad) VALUES (?, ?)',
          [existencia.idRepuesto, existencia.cantidad],
        );
      }
      for (const regla of jornada.reglasEvidencia) {
        await this.base.runAsync(
          `INSERT OR REPLACE INTO regla_evidencia_local
             (clave, etiqueta, tipo, momento, tipo_archivo, bloquea_avance)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [regla.clave, regla.etiqueta, regla.tipo, regla.momento,
            regla.tipoArchivo, regla.bloqueaAvance ? 1 : 0],
        );
      }
    });
  }

  async ordenes(): Promise<OrdenEnEspejo[]> {
    const filas = await this.base.getAllAsync<FilaOrdenCruda>(
      'SELECT * FROM orden_local ORDER BY plazo_vence_en IS NULL, plazo_vence_en, numero',
    );
    return filas.map(comoOrden);
  }

  async orden(idOrden: string): Promise<OrdenEnEspejo | null> {
    const fila = await this.base.getFirstAsync<FilaOrdenCruda>(
      'SELECT * FROM orden_local WHERE id = ?', [idOrden],
    );
    return fila === null ? null : comoOrden(fila);
  }

  async cambiarEstadoLocal(idOrden: string, estado: EstadoOrden): Promise<void> {
    await this.base.runAsync('UPDATE orden_local SET estado = ? WHERE id = ?', [estado, idOrden]);
  }

  async repuestos(): Promise<RepuestoConExistencia[]> {
    const filas = await this.base.getAllAsync<{
      id: string; codigo: string; descripcion: string; precio: number; cantidad: number | null;
    }>(
      `SELECT r.id, r.codigo, r.descripcion, r.precio, e.cantidad
         FROM repuesto_local r
         LEFT JOIN existencia_local e ON e.id_repuesto = r.id
        ORDER BY r.codigo`,
    );
    return filas.map((fila) => ({
      id: fila.id,
      codigo: fila.codigo,
      descripcion: fila.descripcion,
      precio: fila.precio,
      cantidad: fila.cantidad ?? 0,
    }));
  }

  /**
   * El saldo local no baja de cero.
   *
   * Que el tecnico ponga un repuesto que su bodega no registraba es algo
   * que PASA —lo trae de otra orden, se lo presto un companero— y el
   * servidor ya sabe compensarlo. Lo que no debe pasar es que la tableta le
   * muestre "-2 tornillos", que no significa nada para quien la usa.
   */
  async descontarExistencia(idRepuesto: string, cantidad: number): Promise<void> {
    await this.base.runAsync(
      `UPDATE existencia_local SET cantidad = max(0, cantidad - ?) WHERE id_repuesto = ?`,
      [cantidad, idRepuesto],
    );
  }

  async reglasEvidencia(tipo: TipoGarantia): Promise<ReglaEvidenciaDeJornada[]> {
    const filas = await this.base.getAllAsync<{
      clave: string; etiqueta: string; tipo: string; momento: string;
      tipo_archivo: string; bloquea_avance: number;
    }>('SELECT * FROM regla_evidencia_local WHERE tipo = ? ORDER BY momento, clave', [tipo]);
    return filas.map((fila) => ({
      clave: fila.clave,
      etiqueta: fila.etiqueta,
      tipo: fila.tipo as TipoGarantia,
      momento: fila.momento,
      tipoArchivo: fila.tipo_archivo,
      bloqueaAvance: fila.bloquea_avance === 1,
    }));
  }

  async descargadaEn(): Promise<string | null> {
    const fila = await this.base.getFirstAsync<{ descargada_en: string }>(
      'SELECT descargada_en FROM orden_local ORDER BY descargada_en DESC LIMIT 1',
    );
    return fila?.descargada_en ?? null;
  }
}
