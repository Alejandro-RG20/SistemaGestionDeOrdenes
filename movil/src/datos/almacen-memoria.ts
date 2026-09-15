/**
 * Almacenamiento local en memoria. Es la implementacion que usan las
 * pruebas: misma semantica que SQLite, sin dispositivo de por medio.
 */
import type {
  EstadoOrden, JornadaDelDispositivo, ReglaEvidenciaDeJornada, RepuestoDeJornada, TipoGarantia,
} from '@servitotal/compartido';
import type {
  AlmacenDeCola, AlmacenDeEvidencias, EstadoEvidencia, EstadoLocal,
  FilaEvidencia, FilaOperacion, LectorDeArchivos,
} from './puertos.js';
import type { AlmacenDeEspejo, OrdenEnEspejo, RepuestoConExistencia } from './espejo.js';

export class ColaEnMemoria implements AlmacenDeCola {
  private readonly filas = new Map<string, FilaOperacion>();

  async guardar(fila: FilaOperacion): Promise<void> {
    this.filas.set(fila.idOperacion, fila);
  }

  async leerPorEstado(estados: readonly EstadoLocal[], limite: number): Promise<FilaOperacion[]> {
    return [...this.filas.values()]
      .filter((fila) => estados.includes(fila.estado))
      .sort((una, otra) => una.ordenEnCola - otra.ordenEnCola)
      .slice(0, limite);
  }

  async actualizar(idOperacion: string, cambios: Partial<FilaOperacion>): Promise<void> {
    const fila = this.filas.get(idOperacion);
    if (fila === undefined) return;
    this.filas.set(idOperacion, { ...fila, ...cambios });
  }

  async eliminar(idsOperacion: readonly string[]): Promise<void> {
    for (const id of idsOperacion) this.filas.delete(id);
  }

  async contarPorEstado(estados: readonly EstadoLocal[]): Promise<number> {
    return [...this.filas.values()].filter((fila) => estados.includes(fila.estado)).length;
  }

  async siguienteOrden(): Promise<number> {
    const mayor = [...this.filas.values()].reduce((tope, fila) => Math.max(tope, fila.ordenEnCola), 0);
    return mayor + 1;
  }

  /** Solo para las pruebas: todo lo que queda guardado. */
  todas(): FilaOperacion[] {
    return [...this.filas.values()].sort((una, otra) => una.ordenEnCola - otra.ordenEnCola);
  }
}

export class EvidenciasEnMemoria implements AlmacenDeEvidencias {
  private readonly filas = new Map<string, FilaEvidencia>();

  async guardar(fila: FilaEvidencia): Promise<void> {
    this.filas.set(fila.idLocal, fila);
  }

  async leerPorEstado(estados: readonly EstadoEvidencia[], limite: number): Promise<FilaEvidencia[]> {
    return [...this.filas.values()]
      .filter((fila) => estados.includes(fila.estado))
      .slice(0, limite);
  }

  async actualizar(idLocal: string, cambios: Partial<FilaEvidencia>): Promise<void> {
    const fila = this.filas.get(idLocal);
    if (fila === undefined) return;
    this.filas.set(idLocal, { ...fila, ...cambios });
  }

  async eliminar(idsLocal: readonly string[]): Promise<void> {
    for (const id of idsLocal) this.filas.delete(id);
  }

  async contarPorEstado(estados: readonly EstadoEvidencia[]): Promise<number> {
    return [...this.filas.values()].filter((fila) => estados.includes(fila.estado)).length;
  }

  todas(): FilaEvidencia[] {
    return [...this.filas.values()];
  }
}

/** Archivos en memoria, para las pruebas. */
export class ArchivosEnMemoria implements LectorDeArchivos {
  private readonly archivos = new Map<string, Uint8Array>();

  escribir(ruta: string, contenido: Uint8Array): void {
    this.archivos.set(ruta, contenido);
  }

  existe(ruta: string): boolean {
    return this.archivos.has(ruta);
  }

  async leerParte(ruta: string, desplazamiento: number, largo: number): Promise<Uint8Array> {
    const contenido = this.archivos.get(ruta);
    if (contenido === undefined) throw new Error(`No existe el archivo local ${ruta}.`);
    return contenido.subarray(desplazamiento, desplazamiento + largo);
  }

  async eliminar(ruta: string): Promise<void> {
    this.archivos.delete(ruta);
  }
}

/**
 * Espejo en memoria. Misma semantica que el de SQLite, incluida la que
 * importa: reemplazar lo borra todo y el saldo nunca queda negativo.
 */
export class EspejoEnMemoria implements AlmacenDeEspejo {
  private ordenesGuardadas: OrdenEnEspejo[] = [];
  private repuestosGuardados: RepuestoDeJornada[] = [];
  private existencias = new Map<string, number>();
  private reglas: ReglaEvidenciaDeJornada[] = [];
  private cuandoSeDescargo: string | null = null;

  async reemplazar(jornada: JornadaDelDispositivo): Promise<void> {
    this.ordenesGuardadas = jornada.ordenes.map((orden) => ({
      ...orden, descargadaEn: jornada.descargadaEn,
    }));
    this.repuestosGuardados = [...jornada.repuestos];
    this.existencias = new Map(
      jornada.existencias.map((fila) => [fila.idRepuesto, fila.cantidad]),
    );
    this.reglas = [...jornada.reglasEvidencia];
    this.cuandoSeDescargo = jornada.descargadaEn;
  }

  async ordenes(): Promise<OrdenEnEspejo[]> {
    return [...this.ordenesGuardadas];
  }

  async orden(idOrden: string): Promise<OrdenEnEspejo | null> {
    return this.ordenesGuardadas.find((orden) => orden.id === idOrden) ?? null;
  }

  async cambiarEstadoLocal(idOrden: string, estado: EstadoOrden): Promise<void> {
    this.ordenesGuardadas = this.ordenesGuardadas.map((orden) =>
      orden.id === idOrden ? { ...orden, estado } : orden);
  }

  async repuestos(): Promise<RepuestoConExistencia[]> {
    return this.repuestosGuardados.map((repuesto) => ({
      ...repuesto, cantidad: this.existencias.get(repuesto.id) ?? 0,
    }));
  }

  async descontarExistencia(idRepuesto: string, cantidad: number): Promise<void> {
    const actual = this.existencias.get(idRepuesto) ?? 0;
    this.existencias.set(idRepuesto, Math.max(0, actual - cantidad));
  }

  async reglasEvidencia(tipo: TipoGarantia): Promise<ReglaEvidenciaDeJornada[]> {
    return this.reglas.filter((regla) => regla.tipo === tipo);
  }

  async descargadaEn(): Promise<string | null> {
    return this.cuandoSeDescargo;
  }
}
