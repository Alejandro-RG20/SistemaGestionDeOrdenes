/**
 * Lectura de una excepcion de sincronizacion para una persona.
 *
 * La bandeja mostraba la carga original tal cual, en JSON. Esa carga es la
 * evidencia y se conserva intacta; pero quien concilia necesita saber QUE
 * se intento hacer, CUANDO, sobre QUE orden y por que no se aplico, y si
 * los datos del registro cuadran entre si.
 *
 * En la base conviven tres formas de carga:
 *
 *   1. La operacion rechazada, tal como la envio el dispositivo:
 *      { idOperacion, tipoOperacion, momentoDispositivo, carga }.
 *   2. La operacion aceptada con diferencia (un consumo que no cuadraba):
 *      { operacion: <forma 1>, diferencia: {...} }.
 *   3. Un registro resumido, sin la carga del dispositivo:
 *      { tipo_operacion, id_orden, estado_local, momento_dispositivo,
 *        registrado_sin_conexion }. Es la forma de los registros historicos
 *      que trae la siembra de datos.
 *
 * Esta funcion no inventa nada: traduce los campos que hay, y cuando dos
 * datos del mismo registro se contradicen lo dice, en vez de elegir uno.
 * Codigo puro: no consulta la base ni conoce el HTTP.
 */
import {
  ESTADOS_FINALES, TIPO_OPERACION, type EstadoOrden, type LecturaExcepcion,
} from '@servitotal/compartido';

const NOMBRE_OPERACION: Readonly<Record<string, string>> = {
  [TIPO_OPERACION.ORDEN_CREAR]: 'Creacion de la orden en campo',
  [TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO]: 'Cambio de estado de la orden',
  [TIPO_OPERACION.VISITA_REGISTRAR]: 'Resultado de la visita al domicilio',
  [TIPO_OPERACION.DIAGNOSTICO_REGISTRAR]: 'Registro del diagnostico',
  [TIPO_OPERACION.INVENTARIO_CONSUMO]: 'Consumo de repuesto en campo',
  [TIPO_OPERACION.EVIDENCIA_REGISTRAR]: 'Registro de evidencia (fotografia o firma)',
};

/**
 * Que exige el servidor para aplicar cada operacion. Es lo que el codigo
 * comprueba hoy (sincronizacion/ejecutores.ts), no una regla de negocio
 * nueva: sirve para que quien concilia sepa contra que fallo.
 */
const CONDICION_OPERACION: Readonly<Record<string, string>> = {
  [TIPO_OPERACION.ORDEN_CREAR]: 'Se aplica si el cliente y el articulo existen y estan activos.',
  [TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO]:
    'Se aplica si la maquina de estados admite el paso desde el estado que la orden tenga al llegar.',
  [TIPO_OPERACION.VISITA_REGISTRAR]:
    'Se aplica si la orden tiene una visita programada sin resultado. El servidor no exige un estado '
    + 'particular de la orden para registrar la visita, salvo que no este cerrada.',
  [TIPO_OPERACION.DIAGNOSTICO_REGISTRAR]: 'Se aplica si la orden no esta cerrada y el tecnico es el asignado.',
  [TIPO_OPERACION.INVENTARIO_CONSUMO]:
    'Se aplica si la orden no esta cerrada; si la pieza no figuraba en la bodega del tecnico se acepta '
    + 'igual y queda una diferencia por conciliar.',
  [TIPO_OPERACION.EVIDENCIA_REGISTRAR]: 'Se aplica si la orden no esta cerrada.',
};

/** Operaciones que ocurren en el domicilio o en el banco sobre una orden viva. */
const DE_CAMPO = new Set<string>([
  TIPO_OPERACION.VISITA_REGISTRAR, TIPO_OPERACION.DIAGNOSTICO_REGISTRAR,
  TIPO_OPERACION.INVENTARIO_CONSUMO, TIPO_OPERACION.EVIDENCIA_REGISTRAR,
]);

/** Etiquetas legibles de los campos que suelen venir en la carga. */
const ETIQUETA_CAMPO: Readonly<Record<string, string>> = {
  idOrden: 'Orden', id_orden: 'Orden', estadoNuevo: 'Estado solicitado', estado: 'Estado',
  resultado: 'Resultado', horaLlegada: 'Hora de llegada', horaSalida: 'Hora de salida',
  motivo: 'Motivo indicado', fallaEncontrada: 'Falla encontrada', diagnostico: 'Diagnostico',
  idRepuesto: 'Repuesto', cantidad: 'Cantidad', precioUnitario: 'Precio unitario',
  idBodega: 'Bodega', tipo: 'Tipo', descripcion: 'Descripcion', idTecnico: 'Tecnico',
  observaciones: 'Observaciones', idCliente: 'Cliente', idArticulo: 'Articulo',
  fallaReportada: 'Falla reportada', modalidad: 'Modalidad',
};

const nombreEstado = (estado: string): string => estado.replace(/_/g, ' ');

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? valor as Record<string, unknown> : null;
}

function valorLegible(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'boolean') return valor ? 'si' : 'no';
  if (typeof valor === 'string' || typeof valor === 'number') return String(valor);
  return JSON.stringify(valor);
}

export interface EntradaLectura {
  readonly motivo: string;
  readonly cargaOriginal: Record<string, unknown>;
  /** Estado de la orden hoy, si la excepcion apunta a una. */
  readonly estadoActualOrden: string | null;
}

export function leerExcepcion(entrada: EntradaLectura): LecturaExcepcion {
  const carga = entrada.cargaOriginal;
  const envuelta = comoObjeto(carga['operacion']);
  const operacion = envuelta ?? carga;

  const forma: LecturaExcepcion['forma'] = envuelta !== null
    ? 'aceptada_con_diferencia'
    : texto(carga['tipoOperacion']) !== null ? 'operacion_rechazada' : 'registro_resumido';

  const codigoOperacion = texto(operacion['tipoOperacion']) ?? texto(operacion['tipo_operacion']);
  const momento = texto(operacion['momentoDispositivo']) ?? texto(operacion['momento_dispositivo']);
  const sinConexion = typeof carga['registrado_sin_conexion'] === 'boolean'
    ? carga['registrado_sin_conexion'] as boolean : null;
  const estadoAnotado = texto(carga['estado_local']);
  const estadoActual = entrada.estadoActualOrden;

  const reconocida = codigoOperacion !== null && NOMBRE_OPERACION[codigoOperacion] !== undefined;
  const nombre = codigoOperacion === null
    ? 'Operacion sin tipo registrado'
    : NOMBRE_OPERACION[codigoOperacion] ?? `Operacion «${codigoOperacion}»`;

  // Lo que el dispositivo mando, campo por campo.
  const detalles: { etiqueta: string; valor: string }[] = [];
  const cuerpo = comoObjeto(operacion['carga']);
  if (cuerpo !== null) {
    for (const [clave, valor] of Object.entries(cuerpo)) {
      detalles.push({ etiqueta: ETIQUETA_CAMPO[clave] ?? clave, valor: valorLegible(valor) });
    }
  }
  const diferencia = comoObjeto(carga['diferencia']);
  if (diferencia !== null) {
    for (const [clave, valor] of Object.entries(diferencia)) {
      detalles.push({ etiqueta: `Diferencia · ${ETIQUETA_CAMPO[clave] ?? clave}`, valor: valorLegible(valor) });
    }
  }

  const advertencias: string[] = [];

  if (codigoOperacion !== null && !reconocida) {
    advertencias.push(
      `El tipo de operacion «${codigoOperacion}» no existe en esta version del sistema. `
      + 'No se puede saber con certeza que intento hacer el dispositivo.',
    );
  }

  if (forma === 'registro_resumido') {
    advertencias.push(
      'Este registro no conserva lo que envio el dispositivo, solo un resumen (tipo de operacion, '
      + 'orden y un estado anotado). No hay datos de campo que se puedan volver a aplicar.',
    );
  }

  const estadosFinales = ESTADOS_FINALES as readonly string[];
  if (estadoAnotado !== null && codigoOperacion !== null && DE_CAMPO.has(codigoOperacion)
      && estadosFinales.includes(estadoAnotado)) {
    advertencias.push(
      `El registro anota la orden como «${nombreEstado(estadoAnotado)}», que es un estado final, y una `
      + `orden cerrada no admite «${nombre}». Ese estado no puede ser el que tenia la orden cuando se `
      + 'hizo la operacion: trate el estado anotado como no confiable.',
    );
  }

  const motivo = entrada.motivo.toLowerCase();
  const hablaDeRepuesto = /repuesto|precio|bodega movil/.test(motivo);
  if (hablaDeRepuesto && codigoOperacion !== null && codigoOperacion !== TIPO_OPERACION.INVENTARIO_CONSUMO) {
    advertencias.push(
      `El motivo habla de un repuesto consumido, pero la operacion registrada es «${nombre}». `
      + 'Motivo y operacion no se corresponden; confirme con el tecnico que paso.',
    );
  }
  const hablaDeAnulacion = /anulad/.test(motivo);
  if (hablaDeAnulacion && estadoActual !== null && estadoActual !== 'anulada'
      && estadoAnotado !== 'anulada') {
    advertencias.push(
      `El motivo dice que la orden fue anulada, pero la orden esta hoy en «${nombreEstado(estadoActual)}»`
      + (estadoAnotado === null ? '.' : ` y el registro anota «${nombreEstado(estadoAnotado)}».`),
    );
  }

  return {
    forma,
    operacion: nombre,
    codigoOperacion,
    operacionReconocida: reconocida,
    condicion: codigoOperacion === null ? null : CONDICION_OPERACION[codigoOperacion] ?? null,
    momentoDispositivo: momento,
    registradoSinConexion: sinConexion,
    estadoAnotado: estadoAnotado as EstadoOrden | null,
    estadoActualOrden: estadoActual as EstadoOrden | null,
    detalles,
    advertencias,
  };
}
