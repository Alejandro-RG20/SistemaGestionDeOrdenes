/**
 * Como se aplica cada tipo de operacion que llega de la cola.
 *
 * Es una tabla: agregar un tipo de operacion es agregar una entrada, no
 * tocar el motor. Cada ejecutor llama a los SERVICIOS de su modulo —nunca a
 * sus repositorios— y corre dentro de la transaccion que abrio el motor,
 * gracias a que las transacciones son reentrantes.
 */
import { TIPO_OPERACION, type TipoOperacion } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { ErrorValidacion } from '../../comun/errores.js';
import * as servicioOrdenes from '../ordenes/servicio.js';
import * as servicioTransiciones from '../ordenes/servicio-transiciones.js';
import * as servicioAgenda from '../agenda/servicio.js';
import { consumirDesdeCampo } from '../inventario/servicio-consumo-campo.js';
import * as repositorioCampo from '../campo/repositorio.js';

export interface ContextoEjecucion {
  readonly actor: Actor;
  readonly ejecutor: Ejecutor;
  readonly momentoDispositivo: Date;
  readonly carga: Record<string, unknown>;
}

export interface ResultadoEjecucion {
  /** Lo creado o modificado, para que el dispositivo pueda referenciarlo. */
  readonly idEntidad: string | null;
  readonly mensaje: string;
  readonly datos?: Record<string, unknown>;
  /**
   * Se aplico, pero hubo que compensar algo. El motor lo anota como
   * diferencia sin frenar la cola.
   */
  readonly diferencia?: { readonly motivo: string; readonly detalle: Record<string, unknown> };
}

export type Ejecutador = (contexto: ContextoEjecucion) => Promise<ResultadoEjecucion>;

/** Lee un campo obligatorio de la carga, con un mensaje util si falta. */
function exigir<T>(carga: Record<string, unknown>, campo: string, tipo: 'string' | 'number'): T {
  const valor = carga[campo];
  if (typeof valor !== tipo) {
    throw new ErrorValidacion(
      `La operacion llego sin "${campo}", que es obligatorio para aplicarla.`,
      { [campo]: 'Falta o no tiene el tipo esperado.' },
    );
  }
  return valor as T;
}

function opcional<T>(carga: Record<string, unknown>, campo: string, tipo: 'string' | 'number'): T | undefined {
  const valor = carga[campo];
  return typeof valor === tipo ? (valor as T) : undefined;
}

const EJECUTORES: Readonly<Record<TipoOperacion, Ejecutador>> = {
  [TIPO_OPERACION.ORDEN_CREAR]: async ({ actor, carga }) => {
    const ficha = await servicioOrdenes.crear(actor, {
      id: opcional<string>(carga, 'id', 'string'),
      idCliente: exigir<string>(carga, 'idCliente', 'string'),
      idArticulo: exigir<string>(carga, 'idArticulo', 'string'),
      modalidad: exigir<'ruta' | 'taller'>(carga, 'modalidad', 'string'),
      fallaReportada: exigir<string>(carga, 'fallaReportada', 'string'),
      telefonoContacto: opcional<string>(carga, 'telefonoContacto', 'string'),
      direccionServicio: opcional<string>(carga, 'direccionServicio', 'string'),
      referenciaUbicacion: opcional<string>(carga, 'referenciaUbicacion', 'string'),
      idZona: opcional<string>(carga, 'idZona', 'string'),
      levantadaEnCampo: true,
    });
    return {
      idEntidad: ficha.id,
      mensaje: `Orden ${ficha.numero} registrada.`,
      datos: { numero: ficha.numero, tipoGarantia: ficha.tipoGarantia },
    };
  },

  [TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO]: async ({ actor, carga }) => {
    const idOrden = exigir<string>(carga, 'idOrden', 'string');
    const resultado = await servicioTransiciones.mover(actor, idOrden, {
      hacia: exigir<never>(carga, 'hacia', 'string'),
      motivo: opcional<string>(carga, 'motivo', 'string'),
      observacion: opcional<string>(carga, 'observacion', 'string'),
    });
    return {
      idEntidad: idOrden,
      mensaje: `Orden ${resultado.orden.numero}: ${resultado.estadoAnterior} -> ${resultado.estadoNuevo}.`,
      datos: { estado: resultado.estadoNuevo },
    };
  },

  [TIPO_OPERACION.VISITA_REGISTRAR]: async ({ actor, carga, momentoDispositivo, ejecutor }) => {
    const idOrden = exigir<string>(carga, 'idOrden', 'string');
    const visita = await servicioAgenda.registrarResultadoDeVisita(ejecutor, actor, idOrden, {
      resultado: exigir<never>(carga, 'resultado', 'string'),
      horaLlegada: opcional<string>(carga, 'horaLlegada', 'string') ?? momentoDispositivo.toISOString(),
      horaSalida: opcional<string>(carga, 'horaSalida', 'string'),
      motivo: opcional<string>(carga, 'motivo', 'string'),
    });
    return { idEntidad: visita.id, mensaje: `Visita registrada como ${visita.resultado}.` };
  },

  [TIPO_OPERACION.DIAGNOSTICO_REGISTRAR]: async ({ actor, carga, momentoDispositivo, ejecutor }) => {
    const idOrden = exigir<string>(carga, 'idOrden', 'string');
    const id = await repositorioCampo.insertarDiagnostico(ejecutor, {
      idOrden,
      idTecnico: exigir<string>(carga, 'idTecnico', 'string'),
      fallaReal: exigir<string>(carga, 'fallaReal', 'string'),
      componente: opcional<string>(carga, 'componente', 'string') ?? null,
      momentoDispositivo,
      creadoPor: actor.id,
    });
    return { idEntidad: id, mensaje: 'Diagnostico registrado.' };
  },

  [TIPO_OPERACION.INVENTARIO_CONSUMO]: async ({ actor, carga, momentoDispositivo, ejecutor }) => {
    const resultado = await consumirDesdeCampo(ejecutor, actor, {
      idRepuesto: exigir<string>(carga, 'idRepuesto', 'string'),
      idBodegaOrigen: exigir<string>(carga, 'idBodegaOrigen', 'string'),
      cantidad: exigir<number>(carga, 'cantidad', 'number'),
      idOrden: exigir<string>(carga, 'idOrden', 'string'),
      precioFirmado: opcional<number>(carga, 'precioUnitario', 'number'),
      momentoDispositivo,
    });

    const diferencias: string[] = [];
    if (resultado.faltanteAjustado > 0) {
      diferencias.push(
        `${resultado.faltanteAjustado} unidad(es) no figuraban en la bodega movil y se ajustaron`,
      );
    }
    if (resultado.diferenciaDePrecio !== 0) {
      diferencias.push(
        `el precio firmado (${resultado.precioAplicado}) difiere del catalogo en ${resultado.diferenciaDePrecio}`,
      );
    }

    return {
      idEntidad: resultado.idMovimiento,
      mensaje: 'Consumo registrado.',
      datos: { existencia: resultado.existenciaResultante, precio: resultado.precioAplicado },
      ...(diferencias.length === 0 ? {} : {
        diferencia: {
          motivo: `Consumo aceptado con diferencia: ${diferencias.join('; ')}.`,
          detalle: {
            faltanteAjustado: resultado.faltanteAjustado,
            idMovimientoAjuste: resultado.idMovimientoAjuste,
            precioAplicado: resultado.precioAplicado,
            diferenciaDePrecio: resultado.diferenciaDePrecio,
          },
        },
      }),
    };
  },

  [TIPO_OPERACION.EVIDENCIA_REGISTRAR]: async ({ actor, carga, momentoDispositivo, ejecutor }) => {
    const id = await repositorioCampo.insertarEvidencia(ejecutor, {
      idOrden: exigir<string>(carga, 'idOrden', 'string'),
      tipo: exigir<string>(carga, 'tipo', 'string'),
      clave: exigir<string>(carga, 'clave', 'string'),
      rutaArchivo: opcional<string>(carga, 'rutaArchivo', 'string') ?? null,
      huellaDigital: opcional<string>(carga, 'huellaDigital', 'string') ?? null,
      idAutor: actor.id,
      momentoDispositivo,
      latitud: opcional<number>(carga, 'latitud', 'number') ?? null,
      longitud: opcional<number>(carga, 'longitud', 'number') ?? null,
      bytes: opcional<number>(carga, 'bytes', 'number') ?? null,
      // El binario viaja por la segunda cola; esto es solo el registro.
      sincronizada: false,
    });
    return { idEntidad: id, mensaje: 'Evidencia registrada; falta subir el archivo.' };
  },
};

export function ejecutorDe(tipo: TipoOperacion): Ejecutador {
  const ejecutor = EJECUTORES[tipo];
  if (ejecutor === undefined) {
    throw new ErrorValidacion(`El servidor no sabe aplicar operaciones de tipo "${tipo}".`);
  }
  return ejecutor;
}
