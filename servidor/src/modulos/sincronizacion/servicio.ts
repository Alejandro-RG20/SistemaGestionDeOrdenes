/**
 * Motor de la cola de sincronizacion.
 *
 * Tres invariantes, en este orden de importancia:
 *
 *  1. REENVIAR NO DUPLICA. El UUID que genero el dispositivo es la clave de
 *     idempotencia. Si ya llego, se devuelve el resultado de entonces sin
 *     volver a ejecutar nada.
 *  2. NADA DE LO REGISTRADO EN CAMPO SE DESCARTA. Lo que el servidor no
 *     puede aplicar va a la bandeja de excepciones con la carga original
 *     integra.
 *  3. EL DISPOSITIVO NO BORRA SIN CONFIRMACION. Toda operacion procesada
 *     —aplicada o en excepcion— vuelve con `confirmada: true`; solo lo que
 *     fallo de forma inesperada vuelve sin confirmar, para que se reintente.
 *
 * Las operaciones se procesan EN ORDEN y cada una en su propia
 * transaccion: que la tercera falle no puede deshacer las dos primeras.
 */
import {
  ESTADO_OPERACION, type OperacionEnCola, type ResultadoOperacion, type ResultadoSincronizacion,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { ErrorAplicacion, ErrorDominio } from '../../comun/errores.js';
import { bitacora } from '../../comun/bitacora.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { RESOLUCION, clasificarPorCodigo, resolverConflicto } from '../../dominio/sincronizacion/indice.js';
import { ejecutorDe, type ResultadoEjecucion } from './ejecutores.js';
import * as repositorio from './repositorio.js';

/** Codigo de violacion de restriccion unica de PostgreSQL. */
const UNICIDAD_VIOLADA = '23505';

function esUnicidadViolada(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { code?: string }).code === UNICIDAD_VIOLADA;
}

export async function procesarCola(
  actor: Actor, operaciones: readonly OperacionEnCola[],
): Promise<ResultadoSincronizacion> {
  if (actor.idDispositivo === undefined) {
    throw new ErrorDominio(
      'SESION_SIN_DISPOSITIVO',
      'Esta sesion no esta atada a un dispositivo movil. Vuelva a iniciar sesion desde la aplicacion.',
    );
  }

  const resultados: ResultadoOperacion[] = [];
  // En orden y una por una: el orden de la cola es parte del protocolo.
  for (const operacion of operaciones) {
    resultados.push(await procesarUna(actor, actor.idDispositivo, operacion));
  }

  return {
    procesadas: resultados.length,
    aplicadas: resultados.filter((r) => r.estado === ESTADO_OPERACION.APLICADA
      || r.estado === ESTADO_OPERACION.ACEPTADA_CON_DIFERENCIA).length,
    repetidas: resultados.filter((r) => r.estado === ESTADO_OPERACION.REPETIDA).length,
    enExcepcion: resultados.filter((r) => r.estado === ESTADO_OPERACION.EN_EXCEPCION).length,
    resultados,
  };
}

function comoRepetida(
  operacion: OperacionEnCola, previa: repositorio.FilaOperacion,
): ResultadoOperacion {
  const guardado = previa.resultado as { mensaje?: string; estado?: string };
  return {
    idOperacion: operacion.idOperacion,
    tipoOperacion: operacion.tipoOperacion,
    estado: ESTADO_OPERACION.REPETIDA,
    confirmada: true,
    idEntidad: previa.id_entidad,
    mensaje: guardado.mensaje ?? 'Esta operacion ya habia llegado; no se volvio a aplicar.',
    datos: previa.resultado,
  };
}

async function procesarUna(
  actor: Actor, idDispositivo: string, operacion: OperacionEnCola,
): Promise<ResultadoOperacion> {
  // 1. ¿Ya llego antes? Entonces no se ejecuta nada: se devuelve aquello.
  const previa = await repositorio.buscarOperacion(operacion.idOperacion);
  if (previa !== null) return comoRepetida(operacion, previa);

  try {
    return await aplicar(actor, idDispositivo, operacion);
  } catch (error) {
    // Dos envios simultaneos de la misma operacion: uno gana, el otro
    // choca con la clave primaria. Eso no es un fallo, es idempotencia.
    if (esUnicidadViolada(error)) {
      const yaGuardada = await repositorio.buscarOperacion(operacion.idOperacion);
      if (yaGuardada !== null) return comoRepetida(operacion, yaGuardada);
    }

    if (error instanceof ErrorAplicacion) {
      return conservarEnExcepcion(actor, idDispositivo, operacion, error);
    }

    // Fallo inesperado: NO se marca como procesada. El dispositivo
    // conserva su copia y la volvera a mandar.
    bitacora.error('Fallo inesperado al aplicar una operacion sincronizada', {
      idOperacion: operacion.idOperacion,
      tipoOperacion: operacion.tipoOperacion,
      detalle: error instanceof Error ? error.message : String(error),
    });
    return {
      idOperacion: operacion.idOperacion,
      tipoOperacion: operacion.tipoOperacion,
      estado: ESTADO_OPERACION.EN_EXCEPCION,
      confirmada: false,
      idEntidad: null,
      mensaje: 'No se pudo procesar en este momento. Se volvera a intentar; no borre nada del dispositivo.',
    };
  }
}

/**
 * Aplica la operacion y anota su clave de idempotencia EN LA MISMA
 * transaccion. Si se anotara aparte, una caida entre ambas dejaria la
 * operacion aplicada y sin registrar, y el reintento la duplicaria: justo
 * lo que este protocolo existe para impedir.
 */
async function aplicar(
  actor: Actor, idDispositivo: string, operacion: OperacionEnCola,
): Promise<ResultadoOperacion> {
  const momentoDispositivo = new Date(operacion.momentoDispositivo);

  const ejecucion = await enTransaccion(async (cliente) => {
    const resultado: ResultadoEjecucion = await ejecutorDe(operacion.tipoOperacion)({
      actor, ejecutor: cliente, momentoDispositivo, carga: operacion.carga,
    });

    await repositorio.anotarOperacion(cliente, {
      idOperacion: operacion.idOperacion,
      idDispositivo,
      tipoOperacion: operacion.tipoOperacion,
      idEntidad: resultado.idEntidad,
      resultado: { estado: 'aplicada', mensaje: resultado.mensaje, ...(resultado.datos ?? {}) },
      aceptada: true,
      momentoDispositivo,
    });

    // La diferencia se anota en la misma transaccion: aceptar el consumo y
    // olvidar la diferencia seria peor que rechazarlo.
    let idExcepcion: string | undefined;
    if (resultado.diferencia !== undefined) {
      idExcepcion = await repositorio.anotarExcepcion(cliente, {
        idOperacion: operacion.idOperacion,
        idOrden: typeof operacion.carga['idOrden'] === 'string' ? operacion.carga['idOrden'] : null,
        idTecnico: await repositorio.tecnicoDeUsuario(actor.id, cliente),
        motivo: resultado.diferencia.motivo,
        cargaOriginal: { operacion, diferencia: resultado.diferencia.detalle },
      });
      await repositorio.enlazarExcepcion(cliente, operacion.idOperacion, idExcepcion);
    }

    return { resultado, idExcepcion };
  });

  return {
    idOperacion: operacion.idOperacion,
    tipoOperacion: operacion.tipoOperacion,
    estado: ejecucion.idExcepcion === undefined
      ? ESTADO_OPERACION.APLICADA
      : ESTADO_OPERACION.ACEPTADA_CON_DIFERENCIA,
    confirmada: true,
    idEntidad: ejecucion.resultado.idEntidad,
    mensaje: ejecucion.idExcepcion === undefined
      ? ejecucion.resultado.mensaje
      : `${ejecucion.resultado.mensaje} ${ejecucion.resultado.diferencia?.motivo ?? ''}`.trim(),
    ...(ejecucion.idExcepcion === undefined ? {} : { idExcepcion: ejecucion.idExcepcion }),
    ...(ejecucion.resultado.datos === undefined ? {} : { datos: ejecucion.resultado.datos }),
  };
}

/**
 * El servidor no pudo aplicarlo. La carga original se guarda integra y la
 * operacion queda marcada como procesada-y-no-aceptada, para que el
 * dispositivo pueda borrarla sabiendo que aqui esta.
 *
 * Se anota en su PROPIA transaccion, que se confirma: la que intento
 * aplicar ya se revirtio entera.
 */
async function conservarEnExcepcion(
  actor: Actor, idDispositivo: string, operacion: OperacionEnCola, error: ErrorAplicacion,
): Promise<ResultadoOperacion> {
  const conflicto = resolverConflicto(clasificarPorCodigo(error.codigo));

  const idExcepcion = await enTransaccion(async (cliente) => {
    // La operacion va PRIMERO: excepcion_sincronizacion tiene clave foranea
    // hacia ella, asi que al reves la insercion falla.
    await repositorio.anotarOperacion(cliente, {
      idOperacion: operacion.idOperacion,
      idDispositivo,
      tipoOperacion: operacion.tipoOperacion,
      idEntidad: null,
      resultado: {
        estado: 'en_excepcion',
        clase: conflicto.clase,
        mensaje: conflicto.motivo,
        codigo: error.codigo,
      },
      aceptada: false,
      momentoDispositivo: new Date(operacion.momentoDispositivo),
    });

    const id = await repositorio.anotarExcepcion(cliente, {
      idOperacion: operacion.idOperacion,
      idOrden: typeof operacion.carga['idOrden'] === 'string' ? operacion.carga['idOrden'] : null,
      idTecnico: await repositorio.tecnicoDeUsuario(actor.id, cliente),
      motivo: `${conflicto.motivo} Detalle: ${error.message}`,
      // Integra: la operacion tal cual llego, sin recortar ni normalizar.
      cargaOriginal: operacion,
    });

    await repositorio.enlazarExcepcion(cliente, operacion.idOperacion, id);
    return id;
  });

  bitacora.advertencia('Operacion sincronizada conservada en excepcion', {
    idOperacion: operacion.idOperacion, clase: conflicto.clase, codigo: error.codigo,
  });

  return {
    idOperacion: operacion.idOperacion,
    tipoOperacion: operacion.tipoOperacion,
    estado: ESTADO_OPERACION.EN_EXCEPCION,
    // Confirmada igual: el servidor ya tiene el trabajo integro.
    confirmada: conflicto.resolucion === RESOLUCION.CONSERVAR_EN_EXCEPCION,
    idEntidad: null,
    mensaje: conflicto.motivo,
    idExcepcion,
  };
}
