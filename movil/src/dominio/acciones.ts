/**
 * Constructores de las acciones que el tecnico registra sin conexion.
 *
 * Una pantalla no arma un `Record<string, unknown>` a mano: lo pide aqui.
 * Asi la carga que viaja al servidor tiene un solo lugar donde se decide su
 * forma, y ese lugar casa con los ejecutores del servidor
 * (`modulos/sincronizacion/ejecutores.ts`). Si el servidor exige un campo y
 * la app no lo manda, la operacion termina en la bandeja de excepciones:
 * trabajo hecho que hay que reconciliar a mano. Por eso esto es codigo
 * tipado y probado, no un objeto suelto en un `onPress`.
 */
import {
  ESTADO_ORDEN, RESULTADO_VISITA, TIPO_OPERACION,
  type EstadoOrden, type ModalidadServicio, type ResultadoVisita,
} from '@servitotal/compartido';
import type { AccionSinConexion } from '../sincronizacion/cola.js';

/** Orden levantada en el domicilio del cliente (H4 del pliego). */
export interface DatosOrdenEnCampo {
  /** UUID que genera el dispositivo: la orden existe antes de llegar al servidor. */
  readonly idOrden: string;
  readonly idCliente: string;
  readonly idArticulo: string;
  readonly modalidad: ModalidadServicio;
  readonly fallaReportada: string;
  readonly telefonoContacto?: string;
  readonly direccionServicio?: string;
  readonly referenciaUbicacion?: string;
  readonly idZona?: string;
}

/**
 * El id de la orden es TAMBIEN el id de la operacion.
 *
 * No es una economia: es lo que hace que reenviar no cree dos ordenes. El
 * dispositivo ya conoce el identificador de la orden antes de tener senal,
 * asi que puede seguir trabajando sobre ella —consumir repuestos, tomar
 * fotos— y todo eso apunta al mismo lugar cuando por fin sube.
 */
export function crearOrden(datos: DatosOrdenEnCampo, momento?: string): AccionSinConexion {
  return {
    idOperacion: datos.idOrden,
    tipoOperacion: TIPO_OPERACION.ORDEN_CREAR,
    ...(momento === undefined ? {} : { momentoDispositivo: momento }),
    carga: sinVacios({
      id: datos.idOrden,
      idCliente: datos.idCliente,
      idArticulo: datos.idArticulo,
      modalidad: datos.modalidad,
      fallaReportada: datos.fallaReportada,
      telefonoContacto: datos.telefonoContacto,
      direccionServicio: datos.direccionServicio,
      referenciaUbicacion: datos.referenciaUbicacion,
      idZona: datos.idZona,
    }),
  };
}

export function cambiarEstado(
  idOrden: string, hacia: EstadoOrden,
  extras: { motivo?: string; observacion?: string } = {},
  momento?: string,
): AccionSinConexion {
  return {
    tipoOperacion: TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO,
    ...(momento === undefined ? {} : { momentoDispositivo: momento }),
    carga: sinVacios({
      idOrden,
      hacia,
      motivo: extras.motivo,
      observacion: extras.observacion,
    }),
  };
}

export interface DatosVisita {
  readonly idOrden: string;
  readonly resultado: ResultadoVisita;
  readonly horaLlegada: string;
  readonly horaSalida?: string;
  readonly motivo?: string;
}

/**
 * Resultado de la visita al domicilio.
 *
 * `cliente_ausente` y `no_autorizada` importan tanto como la reparacion:
 * son las que explican por que la orden sigue abierta y, sin ellas, el
 * plazo corre contra el taller por algo que no hizo.
 */
export function registrarVisita(datos: DatosVisita): AccionSinConexion {
  return {
    tipoOperacion: TIPO_OPERACION.VISITA_REGISTRAR,
    momentoDispositivo: datos.horaLlegada,
    carga: sinVacios({
      idOrden: datos.idOrden,
      resultado: datos.resultado,
      horaLlegada: datos.horaLlegada,
      horaSalida: datos.horaSalida,
      motivo: datos.motivo,
    }),
  };
}

export interface DatosDiagnostico {
  readonly idOrden: string;
  readonly idTecnico: string;
  readonly fallaReal: string;
  readonly componente?: string;
}

export function registrarDiagnostico(
  datos: DatosDiagnostico, momento?: string,
): AccionSinConexion {
  return {
    tipoOperacion: TIPO_OPERACION.DIAGNOSTICO_REGISTRAR,
    ...(momento === undefined ? {} : { momentoDispositivo: momento }),
    carga: sinVacios({
      idOrden: datos.idOrden,
      idTecnico: datos.idTecnico,
      fallaReal: datos.fallaReal,
      componente: datos.componente,
    }),
  };
}

export interface DatosConsumo {
  readonly idOrden: string;
  readonly idRepuesto: string;
  readonly idBodegaOrigen: string;
  readonly cantidad: number;
  /**
   * Precio que el cliente vio y acepto. Viaja aunque el catalogo diga otra
   * cosa: lo que se firmo en el domicilio se respeta y la diferencia se
   * anota, no se corrige por lo bajo.
   */
  readonly precioUnitario: number;
}

export function consumirRepuesto(datos: DatosConsumo, momento?: string): AccionSinConexion {
  return {
    tipoOperacion: TIPO_OPERACION.INVENTARIO_CONSUMO,
    ...(momento === undefined ? {} : { momentoDispositivo: momento }),
    carga: {
      idOrden: datos.idOrden,
      idRepuesto: datos.idRepuesto,
      idBodegaOrigen: datos.idBodegaOrigen,
      cantidad: datos.cantidad,
      precioUnitario: datos.precioUnitario,
    },
  };
}

export interface DatosEvidencia {
  readonly idOrden: string;
  readonly clave: string;
  readonly tipo: string;
  readonly bytes: number;
  readonly huellaDigital: string;
  readonly latitud?: number | null;
  readonly longitud?: number | null;
}

/**
 * Registro de la evidencia. El archivo NO va aqui: sube por la segunda
 * cola, por partes y reanudable. Esto es la ficha que dice que existe.
 */
export function registrarEvidencia(datos: DatosEvidencia, momento?: string): AccionSinConexion {
  return {
    tipoOperacion: TIPO_OPERACION.EVIDENCIA_REGISTRAR,
    ...(momento === undefined ? {} : { momentoDispositivo: momento }),
    carga: sinVacios({
      idOrden: datos.idOrden,
      clave: datos.clave,
      tipo: datos.tipo,
      bytes: datos.bytes,
      huellaDigital: datos.huellaDigital,
      latitud: datos.latitud ?? undefined,
      longitud: datos.longitud ?? undefined,
    }),
  };
}

/**
 * Atajo de la visita que termina en traslado al taller: la visita y el
 * cambio de estado son dos operaciones, y en ESE orden. Al reves el
 * servidor movería la orden antes de saber por que.
 */
export function visitaConTrasladoATaller(datos: DatosVisita): readonly AccionSinConexion[] {
  return [
    registrarVisita({ ...datos, resultado: RESULTADO_VISITA.REQUIERE_TRASLADO_TALLER }),
    cambiarEstado(datos.idOrden, ESTADO_ORDEN.EN_COLA_TALLER, {
      observacion: 'El articulo no se pudo reparar en el domicilio y se traslada al taller.',
    }, datos.horaSalida ?? datos.horaLlegada),
  ];
}

/** Quita las claves sin valor: el servidor distingue "no vino" de "vino vacio". */
function sinVacios(carga: Record<string, unknown>): Record<string, unknown> {
  const limpia: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(carga)) {
    if (valor !== undefined && valor !== null && valor !== '') limpia[clave] = valor;
  }
  return limpia;
}
