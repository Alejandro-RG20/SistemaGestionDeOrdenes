/**
 * Coordinador de la aplicacion: lo unico que las pantallas conocen.
 *
 * Una pantalla no toca la cola, ni el espejo, ni el cliente HTTP. Pide
 * "registra este diagnostico" y aqui se decide en que orden se escriben las
 * cosas. Ese orden no es un detalle:
 *
 *   PRIMERO LA COLA, DESPUES EL ESPEJO.
 *
 * La cola es la unica copia del trabajo del tecnico hasta que el servidor
 * confirme; el espejo es una comodidad visual que se puede volver a bajar.
 * Si se escribiera el espejo primero y la app muriera en medio, la tableta
 * mostraria una orden "en reparacion" que el servidor nunca va a conocer:
 * trabajo perdido que ademas parece hecho. Al reves, lo peor que pasa es
 * que la lista muestre el estado viejo un rato.
 */
import {
  ESTADO_ORDEN, TIPO_GARANTIA,
  type EstadoOrden, type JornadaDelDispositivo, type ReglaEvidenciaDeJornada,
  type ResultadoVisita, type UsuarioAutenticado,
} from '@servitotal/compartido';
import type { ClienteApi } from '../api/cliente.js';
import type { AlmacenDeSesion } from '../api/sesion.js';
import type { AlmacenDeEspejo, OrdenEnEspejo, RepuestoConExistencia } from '../datos/espejo.js';
import type { ColaDeOperaciones, GeneradorDeIdentificadores } from '../sincronizacion/cola.js';
import type { ColaDeEvidencias } from '../sincronizacion/cola-evidencias.js';
import type { MotorDeSincronizacion, ResumenDeSincronizacion } from '../sincronizacion/motor.js';
import * as acciones from '../dominio/acciones.js';

export interface EstadoDeLaApp {
  readonly usuario: UsuarioAutenticado | null;
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
    private readonly sesion: AlmacenDeSesion,
    private readonly cola: ColaDeOperaciones,
    private readonly evidencias: ColaDeEvidencias,
    private readonly espejo: AlmacenDeEspejo,
    private readonly motor: MotorDeSincronizacion,
    private readonly nuevoIdentificador: GeneradorDeIdentificadores,
  ) {}

  // ── sesion ──────────────────────────────────────────────────────────

  async iniciarSesion(nombreUsuario: string, contrasena: string): Promise<UsuarioAutenticado> {
    let identificador = await this.sesion.identificadorDelDispositivo();
    if (identificador === null) {
      identificador = this.nuevoIdentificador();
      await this.sesion.recordarDispositivo(identificador);
    }

    const sesion = await this.cliente.iniciarSesion(nombreUsuario, contrasena, identificador);
    await this.sesion.guardar(sesion);
    return sesion.usuario;
  }

  /**
   * Cierra la sesion. La cola NO se toca, y por eso la app avisa antes si
   * queda trabajo sin subir: el siguiente que entre en esta tableta no
   * tiene por que cargar con operaciones que no son suyas, pero borrarlas
   * seria peor.
   */
  async cerrarSesion(): Promise<void> {
    await this.sesion.cerrar();
    this.idTecnico = null;
    this.idBodega = null;
  }

  async estado(): Promise<EstadoDeLaApp> {
    return {
      usuario: await this.sesion.usuario(),
      idTecnico: this.idTecnico,
      idBodega: this.idBodega,
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
    return this.espejo.reglasEvidencia(tipo);
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
    if (this.idTecnico === null) {
      throw new Error(
        'Todavia no se ha descargado la jornada, asi que la aplicacion no sabe que tecnico ' +
        'es usted. Conectese una vez al taller antes de salir.',
      );
    }
    await this.cola.encolar(acciones.registrarDiagnostico({
      idOrden,
      idTecnico: this.idTecnico,
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
    if (this.idBodega === null) {
      throw new Error(
        'Esta cuenta no tiene bodega movil asignada, asi que no puede descargar repuestos ' +
        'en campo. Avise a bodega antes de salir.',
      );
    }
    await this.cola.encolar(acciones.consumirRepuesto({
      idOrden,
      idRepuesto,
      idBodegaOrigen: this.idBodega,
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
