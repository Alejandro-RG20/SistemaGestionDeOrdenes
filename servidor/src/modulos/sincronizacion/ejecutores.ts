/**
 * Como se aplica cada tipo de operacion que llega de la cola.
 *
 * Es una tabla: agregar un tipo de operacion es agregar una entrada, no
 * tocar el motor. Cada ejecutor llama a los SERVICIOS de su modulo —nunca a
 * sus repositorios— y corre dentro de la transaccion que abrio el motor,
 * gracias a que las transacciones son reentrantes.
 */
import { ESTADOS_FINALES, TIPO_OPERACION, type EstadoOrden, type TipoOperacion } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { ErrorAutorizacion, ErrorDominio, ErrorValidacion } from '../../comun/errores.js';
import { exigirCercoSobreOrden } from '../ordenes/alcance.js';
import * as repositorioSincronizacion from './repositorio.js';
import * as servicioOrdenes from '../ordenes/servicio.js';
import * as servicioTransiciones from '../ordenes/servicio-transiciones.js';
import * as servicioAgenda from '../agenda/servicio.js';
import * as servicioDiagnostico from '../ordenes/servicio-diagnostico.js';
import * as servicioTaller from '../ordenes/servicio-taller.js';
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

/**
 * Lo que toda operacion de campo sobre una orden exige antes de aplicarse:
 * que quien la envia pueda ver esa orden (un tecnico, solo las suyas) y que
 * la orden no este cerrada. Los servicios del panel ya lo exigian; la cola
 * no, y por ella un tecnico podia registrar visitas, diagnosticos,
 * consumos o evidencias en ordenes ajenas o ya entregadas.
 *
 * Los rechazos llevan los codigos que el clasificador de conflictos conoce
 * (ORDEN_CERRADA), asi que el trabajo no se pierde: queda en la bandeja de
 * excepciones para conciliarlo.
 */
async function exigirOrdenDeCampo(actor: Actor, idOrden: string, ejecutor: Ejecutor): Promise<void> {
  await exigirCercoSobreOrden(actor, idOrden, ejecutor);
  const estado = await repositorioSincronizacion.estadoDeOrden(idOrden, ejecutor);
  if (estado !== null && (ESTADOS_FINALES as readonly string[]).includes(estado)) {
    throw new ErrorDominio(
      'ORDEN_CERRADA',
      `La orden ya esta ${(estado as EstadoOrden).replace(/_/g, ' ')} y no admite trabajo de campo.`,
    );
  }
}

const EJECUTORES: Readonly<Record<TipoOperacion, Ejecutador>> = {
  /*
   * Cotizacion en el domicilio, sin conexion (RF-27). Las mismas reglas que
   * el panel (servicio-taller): repuestos pedidos al precio del inventario,
   * mas los de la bodega movil al precio que el tecnico mostro al cliente.
   * Si no puede aplicarse (sin diagnostico, sin permiso, orden de garantia
   * con ajustes...), la operacion va a la bandeja de excepciones: el
   * trabajo de campo no se pierde.
   */
  [TIPO_OPERACION.COTIZACION_REGISTRAR]: async ({ actor, carga, ejecutor }) => {
    const idOrden = exigir<string>(carga, 'idOrden', 'string');
    await exigirOrdenDeCampo(actor, idOrden, ejecutor);
    if (!actor.permisos.includes('taller.cotizacion.registrar')) {
      throw new ErrorAutorizacion('Esta cuenta no puede registrar cotizaciones.');
    }
    const lineas = Array.isArray(carga['repuestos']) ? carga['repuestos'] as unknown[] : [];
    const repuestosDeBodega: Array<{ idRepuesto: string; cantidad: number }> = [];
    const preciosDeCampo = new Map<string, number>();
    for (const linea of lineas) {
      const fila = (linea ?? {}) as Record<string, unknown>;
      const idRepuesto = exigir<string>(fila, 'idRepuesto', 'string');
      const cantidad = exigir<number>(fila, 'cantidad', 'number');
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        throw new ErrorValidacion('La cantidad de cada repuesto debe ser un entero positivo.', { repuestos: idRepuesto });
      }
      repuestosDeBodega.push({ idRepuesto, cantidad });
      const precio = opcional<number>(fila, 'precioUnitario', 'number');
      if (precio !== undefined) preciosDeCampo.set(idRepuesto, precio);
    }
    const motivo = opcional<string>(carga, 'motivo', 'string');
    const datos = await servicioTaller.registrarCotizacion(actor, idOrden, {
      manoObra: exigir<number>(carga, 'manoObra', 'number'),
      repuestosDeBodega,
      ...(motivo === undefined ? {} : { motivo }),
    }, { preciosDeCampo });
    const vigente = datos.cotizaciones[datos.cotizaciones.length - 1];
    return {
      idEntidad: vigente?.id ?? null,
      mensaje: `Cotizacion registrada: total ${vigente?.total ?? 0}.`,
    };
  },

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
    await exigirOrdenDeCampo(actor, idOrden, ejecutor);
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
    await exigirOrdenDeCampo(actor, idOrden, ejecutor);
    // El diagnostico se firma con el tecnico de la SESION, no con el que
    // diga la carga: antes cualquiera podia registrarlo a nombre de otro.
    // La carga puede seguir trayendo idTecnico (las colas ya guardadas en
    // los dispositivos lo traen); si no coincide, se rechaza.
    const idTecnicoDeLaSesion = await repositorioSincronizacion.tecnicoDeUsuario(actor.id, ejecutor);
    const idTecnicoDeLaCarga = opcional<string>(carga, 'idTecnico', 'string');
    if (idTecnicoDeLaSesion !== null && idTecnicoDeLaCarga !== undefined
        && idTecnicoDeLaCarga !== idTecnicoDeLaSesion) {
      throw new ErrorDominio(
        'NO_ES_RESPONSABLE',
        'El diagnostico viene a nombre de otro tecnico. Solo puede registrar diagnosticos propios.',
      );
    }
    const idTecnico = idTecnicoDeLaSesion ?? exigir<string>(carga, 'idTecnico', 'string');
    const id = await repositorioCampo.insertarDiagnostico(ejecutor, {
      idOrden,
      idTecnico,
      fallaReal: exigir<string>(carga, 'fallaReal', 'string'),
      componente: opcional<string>(carga, 'componente', 'string') ?? null,
      momentoDispositivo,
      creadoPor: actor.id,
    });
    // Lista de verificacion (RF-22/23). Una operacion guardada en el
    // dispositivo antes de esta version no trae `mediciones`: se acepta
    // sin ellas, para no descartar trabajo de campo (RN-20).
    const mediciones = carga['mediciones'];
    if (mediciones !== undefined && !Array.isArray(mediciones)) {
      throw new ErrorValidacion('Las mediciones del diagnostico no tienen el formato esperado.', {});
    }
    const fuera = await servicioDiagnostico.registrarMediciones(ejecutor, {
      idOrden, idDiagnostico: id, estadoOrden: await repositorioSincronizacion.estadoDeOrden(idOrden, ejecutor) ?? '',
      idResponsable: actor.id, respuestas: mediciones as never, exigirLista: false,
    });
    return {
      idEntidad: id,
      mensaje: fuera.length === 0
        ? 'Diagnostico registrado.'
        : `Diagnostico registrado con ${fuera.length} medicion(es) fuera de rango.`,
    };
  },

  [TIPO_OPERACION.INVENTARIO_CONSUMO]: async ({ actor, carga, momentoDispositivo, ejecutor }) => {
    const idOrden = exigir<string>(carga, 'idOrden', 'string');
    await exigirOrdenDeCampo(actor, idOrden, ejecutor);
    const resultado = await consumirDesdeCampo(ejecutor, actor, {
      idRepuesto: exigir<string>(carga, 'idRepuesto', 'string'),
      idBodegaOrigen: exigir<string>(carga, 'idBodegaOrigen', 'string'),
      cantidad: exigir<number>(carga, 'cantidad', 'number'),
      idOrden,
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
    const idOrden = exigir<string>(carga, 'idOrden', 'string');
    await exigirOrdenDeCampo(actor, idOrden, ejecutor);
    const clave = exigir<string>(carga, 'clave', 'string');
    const huellaDigital = opcional<string>(carga, 'huellaDigital', 'string') ?? null;

    // La otra mitad de la misma regla que en `campo/servicio.ts`: las dos
    // colas describen UNA fotografia. La que llegue segunda se reconoce por
    // la huella y no vuelve a insertar.
    const yaRegistrada = await repositorioCampo.buscarFichaSinArchivo(ejecutor, {
      idOrden, clave, huellaDigital,
    });
    if (yaRegistrada !== null) {
      return { idEntidad: yaRegistrada, mensaje: 'La evidencia ya estaba registrada.' };
    }

    const id = await repositorioCampo.insertarEvidencia(ejecutor, {
      idOrden,
      tipo: exigir<string>(carga, 'tipo', 'string'),
      clave,
      rutaArchivo: opcional<string>(carga, 'rutaArchivo', 'string') ?? null,
      huellaDigital,
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
