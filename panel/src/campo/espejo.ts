/**
 * Espejo de trabajo: la copia local de lo que el tecnico necesita ver.
 *
 * Es DESCARTABLE. Si se corrompe o se borra, se vuelve a bajar del servidor
 * y no se pierde nada. Lo que NO es descartable son las colas: esas son la
 * unica copia del trabajo del dia hasta que el servidor confirme. Esa
 * distincion decide todo lo que hay aqui —por ejemplo, que la descarga de
 * jornada reemplace el espejo entero sin preguntar, cosa que jamas se le
 * haria a una cola.
 *
 * El espejo tambien se actualiza SIN servidor: cuando el tecnico mueve una
 * orden sin senal, la lista tiene que mostrar el estado nuevo aunque falten
 * horas para que el servidor se entere. Esa escritura local es optimista y
 * se corrige sola en la siguiente descarga.
 */
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
  /**
   * Deja constancia de una evidencia capturada aqui mismo.
   *
   * Hace falta porque la cola de evidencias BORRA la fila al confirmarse, y
   * sin esta anotacion la lista de comprobacion volveria a pedir una foto
   * recien subida. Se junta con las que el servidor ya traia en la jornada.
   */
  anotarEvidenciaLocal(idOrden: string, clave: string): Promise<void>;
  repuestos(): Promise<RepuestoConExistencia[]>;
  /** Descuenta lo consumido en campo. Nunca deja la existencia negativa. */
  descontarExistencia(idRepuesto: string, cantidad: number): Promise<void>;
  reglasEvidencia(tipo: TipoGarantia): Promise<ReglaEvidenciaDeJornada[]>;
  /** Cuando se bajo por ultima vez. Null si nunca. */
  descargadaEn(): Promise<string | null>;
  /** El tecnico y su bodega, que la app necesita para registrar consumos. */
  identidad(): Promise<{ idTecnico: string | null; idBodega: string | null }>;
}

/** Lo que se guarda: la jornada completa mas los ajustes locales. */
interface EspejoGuardado {
  readonly jornada: JornadaDelDispositivo;
  /** Estados cambiados sin conexion, por orden. */
  readonly estadosLocales: Record<string, EstadoOrden>;
  /** Unidades consumidas sin conexion, por repuesto. */
  readonly consumosLocales: Record<string, number>;
  /** Claves de evidencia capturadas aqui, por orden. */
  readonly evidenciasLocales: Record<string, readonly string[]>;
}

const ALMACEN_ESPEJO = 'espejo';
const CLAVE = 'jornada';

/**
 * Espejo sobre IndexedDB.
 *
 * Se guarda como UN SOLO registro, no como tablas. La jornada de un tecnico
 * son unas decenas de ordenes y trescientos repuestos: cabe de sobra en un
 * objeto, y asi reemplazarla entera es una escritura atomica en vez de
 * cuatro borrados y cuatro insercciones que podrian cortarse a mitad.
 */
export class EspejoIndexedDB implements AlmacenDeEspejo {
  constructor(private readonly base: IDBDatabase) {}

  private leer(): Promise<EspejoGuardado | undefined> {
    return new Promise((resolver, rechazar) => {
      const peticion = this.base.transaction(ALMACEN_ESPEJO, 'readonly')
        .objectStore(ALMACEN_ESPEJO).get(CLAVE);
      peticion.onsuccess = () => resolver(peticion.result as EspejoGuardado | undefined);
      peticion.onerror = () => rechazar(peticion.error);
    });
  }

  private escribir(valor: EspejoGuardado): Promise<void> {
    return new Promise((resolver, rechazar) => {
      const peticion = this.base.transaction(ALMACEN_ESPEJO, 'readwrite')
        .objectStore(ALMACEN_ESPEJO).put(valor, CLAVE);
      peticion.onsuccess = () => resolver();
      peticion.onerror = () => rechazar(peticion.error);
    });
  }

  async reemplazar(jornada: JornadaDelDispositivo): Promise<void> {
    // Los ajustes locales se descartan: lo que baja del servidor ya los
    // incluye si la cola llego a subir, y si no llego, la cola sigue ahi.
    await this.escribir({
      jornada, estadosLocales: {}, consumosLocales: {}, evidenciasLocales: {},
    });
  }

  async ordenes(): Promise<OrdenEnEspejo[]> {
    const guardado = await this.leer();
    if (guardado === undefined) return [];
    return guardado.jornada.ordenes.map((orden) => ({
      ...orden,
      estado: guardado.estadosLocales[orden.id] ?? orden.estado,
      // Union de lo que trajo el servidor y lo capturado sin senal.
      evidenciasRegistradas: [...new Set([
        ...orden.evidenciasRegistradas,
        ...(guardado.evidenciasLocales?.[orden.id] ?? []),
      ])],
      descargadaEn: guardado.jornada.descargadaEn,
    }));
  }

  async orden(idOrden: string): Promise<OrdenEnEspejo | null> {
    return (await this.ordenes()).find((orden) => orden.id === idOrden) ?? null;
  }

  async cambiarEstadoLocal(idOrden: string, estado: EstadoOrden): Promise<void> {
    const guardado = await this.leer();
    if (guardado === undefined) return;
    await this.escribir({
      ...guardado,
      estadosLocales: { ...guardado.estadosLocales, [idOrden]: estado },
    });
  }

  async anotarEvidenciaLocal(idOrden: string, clave: string): Promise<void> {
    const guardado = await this.leer();
    if (guardado === undefined) return;
    const anteriores = guardado.evidenciasLocales?.[idOrden] ?? [];
    if (anteriores.includes(clave)) return;
    await this.escribir({
      ...guardado,
      evidenciasLocales: {
        ...guardado.evidenciasLocales,
        [idOrden]: [...anteriores, clave],
      },
    });
  }

  async repuestos(): Promise<RepuestoConExistencia[]> {
    const guardado = await this.leer();
    if (guardado === undefined) return [];
    const existencias = new Map(
      guardado.jornada.existencias.map((fila) => [fila.idRepuesto, fila.cantidad]),
    );
    return guardado.jornada.repuestos.map((repuesto) => ({
      ...repuesto,
      cantidad: Math.max(
        0,
        (existencias.get(repuesto.id) ?? 0) - (guardado.consumosLocales[repuesto.id] ?? 0),
      ),
    }));
  }

  /**
   * El saldo local no baja de cero.
   *
   * Que el tecnico ponga un repuesto que su bodega no registraba es algo que
   * PASA —lo trae de otra orden, se lo presto un companero— y el servidor ya
   * sabe compensarlo. Lo que no debe pasar es que la pantalla le muestre
   * «-2 tornillos», que no significa nada para quien la usa.
   */
  async descontarExistencia(idRepuesto: string, cantidad: number): Promise<void> {
    const guardado = await this.leer();
    if (guardado === undefined) return;
    const yaConsumido = guardado.consumosLocales[idRepuesto] ?? 0;
    await this.escribir({
      ...guardado,
      consumosLocales: { ...guardado.consumosLocales, [idRepuesto]: yaConsumido + cantidad },
    });
  }

  async reglasEvidencia(tipo: TipoGarantia): Promise<ReglaEvidenciaDeJornada[]> {
    const guardado = await this.leer();
    if (guardado === undefined) return [];
    return guardado.jornada.reglasEvidencia.filter((regla) => regla.tipo === tipo);
  }

  async descargadaEn(): Promise<string | null> {
    return (await this.leer())?.jornada.descargadaEn ?? null;
  }

  async identidad(): Promise<{ idTecnico: string | null; idBodega: string | null }> {
    const guardado = await this.leer();
    return {
      idTecnico: guardado?.jornada.idTecnico ?? null,
      idBodega: guardado?.jornada.bodega?.id ?? null,
    };
  }
}

export { ALMACEN_ESPEJO };
