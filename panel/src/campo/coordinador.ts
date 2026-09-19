/**
 * Coordinador del trabajo de campo: lo unico que las pantallas del tecnico
 * conocen.
 *
 * Una pantalla no toca la cola, ni el espejo, ni el cliente HTTP. Pide
 * "registra este diagnostico" y aqui se decide en que orden se escriben las
 * cosas. Ese orden no es un detalle:
 *
 *   PRIMERO LA COLA, DESPUES EL ESPEJO.
 *
 * La cola es la unica copia del trabajo del tecnico hasta que el servidor
 * confirme; el espejo es una comodidad visual que se puede volver a bajar.
 * Si se escribiera el espejo primero y la pestana se cerrara en medio, el
 * telefono mostraria una orden "en reparacion" que el servidor nunca va a
 * conocer:
 * trabajo perdido que ademas parece hecho. Al reves, lo peor que pasa es
 * que la lista muestre el estado viejo un rato.
 */
import {
  ESTADO_ORDEN, TIPO_GARANTIA, TIPO_OPERACION,
  type EstadoOrden, type JornadaDelDispositivo, type ReglaEvidenciaDeJornada,
  type ResultadoVisita,
} from '@servitotal/compartido';
import type { ClienteApi } from '../api/cliente.js';
import type { AlmacenDeEspejo, OrdenEnEspejo, RepuestoConExistencia } from './espejo.js';
import type { ColaDeOperaciones, GeneradorDeIdentificadores } from './cola.js';
import type { ColaDeEvidencias } from './cola-evidencias.js';
import type { MotorDeSincronizacion, ResumenDeSincronizacion } from './motor.js';
import * as acciones from './acciones.js';
import { momentosVigentes } from './flujo-campo.js';

/** Una fila de la cola, dicha como la entiende el tecnico. */
export interface PendienteDeEnvio {
  readonly clave: string;
  readonly descripcion: string;
  readonly numeroOrden: number | null;
  readonly intentos: number;
  /** Avance de una carga, o el motivo del ultimo rechazo. */
  readonly detalle: string | null;
}

const DESCRIPCION_OPERACION: Readonly<Record<string, string>> = {
  [TIPO_OPERACION.ORDEN_CREAR]: 'Orden levantada en el domicilio',
  [TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO]: 'Cambio de estado',
  [TIPO_OPERACION.DIAGNOSTICO_REGISTRAR]: 'Diagnostico',
  [TIPO_OPERACION.VISITA_REGISTRAR]: 'Resultado de la visita',
  [TIPO_OPERACION.INVENTARIO_CONSUMO]: 'Repuesto consumido',
  [TIPO_OPERACION.EVIDENCIA_REGISTRAR]: 'Ficha de evidencia',
};

export interface EstadoDeLaApp {
  readonly idTecnico: string | null;
  readonly idBodega: string | null;
  readonly descargadaEn: string | null;
  readonly operacionesPendientes: number;
  readonly evidenciasPendientes: number;
}

export class Coordinador {
  private idTecnico: string | null = null;
  private idBodega: string | null = null;

  constructor(
    private readonly cliente: ClienteApi,
    private readonly cola: ColaDeOperaciones,
    private readonly evidencias: ColaDeEvidencias,
    private readonly espejo: AlmacenDeEspejo,
    private readonly motor: MotorDeSincronizacion,
    private readonly nuevoIdentificador: GeneradorDeIdentificadores,
  ) {}

  // ── sesion ──────────────────────────────────────────────────────────

  /**
   * Lo pendiente y cuando se bajo la jornada.
   *
   * La sesion NO se gestiona aqui: es la misma del panel. Un tecnico entra
   * al mismo sistema que la jefatura; lo que cambia es el tamano de la
   * pantalla y lo que puede hacer, no la aplicacion.
   */
  async estado(): Promise<EstadoDeLaApp> {
    const identidad = await this.espejo.identidad();
    // La identidad sale del espejo, no de memoria: al recargar la pagina el
    // objeto se pierde, pero la jornada descargada sigue en IndexedDB.
    this.idTecnico = identidad.idTecnico;
    this.idBodega = identidad.idBodega;
    return {
      idTecnico: identidad.idTecnico,
      idBodega: identidad.idBodega,
      descargadaEn: await this.espejo.descargadaEn(),
      operacionesPendientes: await this.cola.pendientes(),
      evidenciasPendientes: await this.evidencias.pendientes(),
    };
  }

  // ── descarga y sincronizacion ───────────────────────────────────────

  /**
   * Baja la jornada. Se llama al entrar y al volver al taller, NUNCA en
   * medio de una visita: reemplazar el espejo con la orden a medio
   * registrar confundiria al tecnico sin ganar nada.
   */
  async descargarJornada(): Promise<JornadaDelDispositivo> {
    const jornada = await this.cliente.descargarJornada();
    await this.espejo.reemplazar(jornada);
    this.idTecnico = jornada.idTecnico;
    this.idBodega = jornada.bodega?.id ?? null;
    return jornada;
  }

  async sincronizar(): Promise<ResumenDeSincronizacion> {
    return this.motor.sincronizar();
  }

  /**
   * Vuelta al taller: primero se sube lo del dia y solo despues se baja lo
   * nuevo. Al reves, la descarga pisaria el espejo con estados viejos —el
   * servidor todavia no sabria de los cambios— y el tecnico veria retroceder
   * ordenes que el mismo movio.
   */
  async sincronizarYDescargar(): Promise<ResumenDeSincronizacion> {
    const resumen = await this.motor.sincronizar();
    if (!resumen.interrumpidaPorConexion) await this.descargarJornada();
    return resumen;
  }

  /**
   * Lo que todavia no ha subido, en el orden en que va a subir.
   *
   * La pantalla de cierre lo muestra entero, con nombre y todo. No es
   * adorno: un tecnico que ve «3 pendientes» y nada mas no sabe si lo que
   * falta es su trabajo de la manana o una foto suelta, y en la duda vuelve
   * a anotarlo en papel.
   */
  async colaPendiente(): Promise<PendienteDeEnvio[]> {
    const operaciones = await this.cola.siguienteLote(200);
    const evidencias = await this.evidencias.siguientes(200);
    const ordenes = new Map((await this.espejo.ordenes()).map((o) => [o.id, o.numero]));

    const deOperaciones = operaciones.map((fila) => ({
      clave: fila.idOperacion,
      descripcion: DESCRIPCION_OPERACION[fila.tipoOperacion] ?? fila.tipoOperacion,
      numeroOrden: ordenes.get(String(fila.carga['idOrden'] ?? fila.carga['id'] ?? '')) ?? null,
      intentos: fila.intentos,
      detalle: fila.ultimoMensaje,
    }));

    const deEvidencias = evidencias.map((fila) => ({
      clave: fila.idLocal,
      descripcion: `Evidencia: ${fila.clave.replace(/_/g, ' ')}`,
      numeroOrden: ordenes.get(fila.idOrden) ?? null,
      intentos: fila.intentos,
      detalle: fila.bytesEnviados > 0
        ? `${Math.round((fila.bytesEnviados / fila.bytes) * 100)} % enviado`
        : null,
    }));

    return [...deOperaciones, ...deEvidencias];
  }

  // ── consultas del espejo ────────────────────────────────────────────

  async misOrdenes(): Promise<OrdenEnEspejo[]> {
    return this.espejo.ordenes();
  }

  async orden(idOrden: string): Promise<OrdenEnEspejo | null> {
    return this.espejo.orden(idOrden);
  }

  async repuestos(): Promise<RepuestoConExistencia[]> {
    return this.espejo.repuestos();
  }

  async evidenciaRequerida(orden: OrdenEnEspejo): Promise<ReglaEvidenciaDeJornada[]> {
    // Mientras la garantia no este validada no se sabe que exigir; se pide
    // lo de particular, que es el minimo comun, para no quedarse sin nada.
    const tipo = orden.tipoGarantia === TIPO_GARANTIA.POR_VALIDAR
      ? TIPO_GARANTIA.PARTICULAR
      : orden.tipoGarantia;
    const reglas = await this.espejo.reglasEvidencia(tipo);
    // Y solo lo que toca donde la orden esta: pedirle hoy la firma de
    // entrega es lo que hace que deje de leer la lista.
    const vigentes = new Set<string>(momentosVigentes(orden.estado));
    return reglas.filter((regla) => vigentes.has(regla.momento));
  }

  // ── acciones del tecnico ────────────────────────────────────────────

  async moverOrden(
    idOrden: string, hacia: EstadoOrden, observacion?: string,
  ): Promise<void> {
    await this.cola.encolar(acciones.cambiarEstado(
      idOrden, hacia, observacion === undefined ? {} : { observacion },
    ));
    await this.espejo.cambiarEstadoLocal(idOrden, hacia);
  }

  async registrarDiagnostico(
    idOrden: string, fallaReal: string, componente?: string,
  ): Promise<void> {
    const { idTecnico } = await this.espejo.identidad();
    if (idTecnico === null) {
      throw new Error(
        'Todavia no se ha descargado la jornada, asi que el sistema no sabe que tecnico es '
        + 'usted. Abra el sistema con senal una vez antes de salir.',
      );
    }
    await this.cola.encolar(acciones.registrarDiagnostico({
      idOrden,
      idTecnico,
      fallaReal,
      ...(componente === undefined ? {} : { componente }),
    }));
  }

  async registrarVisita(
    idOrden: string, resultado: ResultadoVisita, horaLlegada: string, motivo?: string,
  ): Promise<void> {
    await this.cola.encolar(acciones.registrarVisita({
      idOrden,
      resultado,
      horaLlegada,
      horaSalida: new Date().toISOString(),
      ...(motivo === undefined ? {} : { motivo }),
    }));
  }

  /** La visita que termina en traslado: dos operaciones, en orden. */
  async trasladarAlTaller(idOrden: string, horaLlegada: string, motivo?: string): Promise<void> {
    for (const accion of acciones.visitaConTrasladoATaller({
      idOrden,
      resultado: 'requiere_traslado_taller',
      horaLlegada,
      horaSalida: new Date().toISOString(),
      ...(motivo === undefined ? {} : { motivo }),
    })) {
      await this.cola.encolar(accion);
    }
    await this.espejo.cambiarEstadoLocal(idOrden, ESTADO_ORDEN.EN_COLA_TALLER);
  }

  /**
   * Consumo de repuesto en campo.
   *
   * El precio que se manda es el que el tecnico le mostro al cliente, no el
   * que el catalogo diga hoy en el servidor. Si difieren, el servidor
   * acepta el firmado y anota la diferencia: lo que se pacto en la casa del
   * cliente no se corrige a sus espaldas.
   */
  async consumirRepuesto(
    idOrden: string, idRepuesto: string, cantidad: number, precioUnitario: number,
  ): Promise<void> {
    const { idBodega } = await this.espejo.identidad();
    if (idBodega === null) {
      throw new Error(
        'Esta cuenta no tiene bodega movil asignada, asi que no puede descargar repuestos '
        + 'en campo. Avise a bodega antes de salir.',
      );
    }
    await this.cola.encolar(acciones.consumirRepuesto({
      idOrden,
      idRepuesto,
      idBodegaOrigen: idBodega,
      cantidad,
      precioUnitario,
    }));
    await this.espejo.descontarExistencia(idRepuesto, cantidad);
  }

  /**
   * Evidencia: dos colas, en este orden.
   *
   * Primero la FICHA por la cola de operaciones —que es la que le dice al
   * servidor que esta evidencia existe— y despues el ARCHIVO por la cola de
   * cargas. Si solo sube la ficha, queda una evidencia sin archivo, visible
   * y reclamable. Si solo subiera el archivo, quedaria un binario huerfano
   * que nadie sabe de que orden es.
   */
  async registrarEvidencia(datos: {
    idOrden: string;
    clave: string;
    tipo: string;
    rutaLocal: string;
    bytes: number;
    huellaDigital: string;
    latitud?: number | null;
    longitud?: number | null;
  }): Promise<void> {
    const momento = new Date().toISOString();

    await this.cola.encolar(acciones.registrarEvidencia({
      idOrden: datos.idOrden,
      clave: datos.clave,
      tipo: datos.tipo,
      bytes: datos.bytes,
      huellaDigital: datos.huellaDigital,
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
    }, momento));

    await this.espejo.anotarEvidenciaLocal(datos.idOrden, datos.clave);

    await this.evidencias.encolar({
      idLocal: this.nuevoIdentificador(),
      idOrden: datos.idOrden,
      clave: datos.clave,
      tipo: datos.tipo,
      rutaLocal: datos.rutaLocal,
      bytes: datos.bytes,
      huellaDigital: datos.huellaDigital,
      momentoDispositivo: momento,
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
    });
  }

  /** Orden levantada en el domicilio: el dispositivo le da el identificador. */
  async levantarOrdenEnCampo(datos: Omit<acciones.DatosOrdenEnCampo, 'idOrden'>): Promise<string> {
    const idOrden = this.nuevoIdentificador();
    await this.cola.encolar(acciones.crearOrden({ ...datos, idOrden }));
    return idOrden;
  }
}
