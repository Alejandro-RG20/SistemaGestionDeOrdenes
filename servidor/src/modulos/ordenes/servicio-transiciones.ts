/**
 * Movimiento de la orden entre estados.
 *
 * Todo pasa por la maquina de estados: este archivo arma el contexto, le
 * pregunta, y si dice que no, propaga el mensaje que ella escribio. No hay
 * aqui ninguna regla sobre que transicion vale.
 */
import type {
  AccionDeEstado, EstadoOrden, PeticionNotaCorreccion, PeticionTransicion, ResultadoTransicion,
} from '@servitotal/compartido';
import { CODIGO_ROL, ESTADO_ORDEN, MODALIDAD_SERVICIO } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto, enTransaccion } from '../../comun/transacciones.js';
import { ErrorDominio, ErrorNoEncontrado } from '../../comun/errores.js';
import {
  TECNICO_ASIGNADO, definicionDe, evaluarTransicion, momentoEvidenciaDe,
  type ContextoTransicion,
} from '../../dominio/ordenes/indice.js';
import { requierePagoDeVisita } from '../../dominio/ordenes/requisitos.js';
import { horasParaVencer, sumarHorasLaborables } from '../../dominio/plazos/indice.js';
import * as servicioAgenda from '../agenda/servicio.js';
import * as repositorio from './repositorio.js';
import { alcanceDe, exigirCerco } from './alcance.js';
import { aResumenOrden } from './dto.js';

/**
 * Quien queda a cargo del estado nuevo.
 *
 * Si lo atiende el tecnico asignado, es el. Si lo atiende un rol y quien
 * mueve la orden tiene ese rol, se queda el. Si no, se deja sin responsable
 * nominal y manda el rol: es preferible a colgarle la orden a alguien que
 * no la pidio.
 */
async function responsableDelNuevoEstado(
  estado: EstadoOrden,
  actor: Actor,
  idTecnico: string | null,
  ejecutor: Ejecutor,
): Promise<string | null> {
  const definicion = definicionDe(estado);
  if (definicion.esFinal) return null;

  if (definicion.responsable === TECNICO_ASIGNADO) {
    if (idTecnico === null) return null;
    const { rows } = await ejecutor.query<{ id_usuario: string }>(
      'SELECT id_usuario FROM tecnico WHERE id = $1', [idTecnico],
    );
    return rows[0]?.id_usuario ?? null;
  }

  return definicion.responsable === actor.rol ? actor.id : null;
}

/**
 * El contexto que la maquina de estados necesita. Lo usan mover la orden y
 * evaluar que acciones se le ofrecen al usuario: la misma pregunta, las
 * mismas respuestas, para que el panel nunca ofrezca un boton que el
 * servidor va a rechazar ni esconda uno que aceptaria.
 */
async function armarContexto(
  actor: Actor, fila: repositorio.FilaContextoTransicion, hacia: EstadoOrden,
  motivo: string | null, ejecutor: Ejecutor,
): Promise<ContextoTransicion> {
  const momento = momentoEvidenciaDe(fila.estado);
  // En secuencia: comparten el cliente de la transaccion.
  const faltantes = momento === null
    ? []
    : await repositorio.evidenciasFaltantes(fila.id, momento, ejecutor);
  const tecnicoDelActor = await repositorio.buscarTecnicoDeUsuario(actor.id, ejecutor);

  return {
    hacia,
    orden: {
      id: fila.id,
      numero: fila.numero,
      estado: fila.estado,
      modalidad: fila.modalidad as ContextoTransicion['orden']['modalidad'],
      tipoGarantia: fila.tipo_garantia as ContextoTransicion['orden']['tipoGarantia'],
      idTecnico: fila.id_tecnico,
      idResponsableActual: fila.id_responsable_actual,
      cargoVisita: Number(fila.cargo_visita ?? 0),
    },
    actor: {
      id: actor.id,
      rol: actor.rol,
      idTecnico: tecnicoDelActor?.id ?? null,
      puedeAnular: actor.permisos.includes('ordenes.anular'),
      puedeCerrar: actor.permisos.includes('ordenes.cerrar'),
      puedeEntregar: actor.permisos.includes('ordenes.entregar'),
      puedeAsignar: actor.permisos.includes('ordenes.asignar'),
      puedeAutorizar: actor.permisos.includes('taller.cotizacion.autorizar'),
      esAdministrador: actor.rol === CODIGO_ROL.ADMINISTRADOR,
    },
    evidenciasFaltantes: faltantes,
    tieneVisitaVigente: fila.tiene_visita,
    tieneDiagnostico: fila.tiene_diagnostico,
    tieneCotizacion: fila.tiene_cotizacion,
    cotizacionAceptada: fila.cotizacion_aceptada,
    solicitudesSinLiberar: fila.solicitudes_sin_liberar,
    solicitudesAbiertas: fila.solicitudes_abiertas,
    piezasSinConciliar: fila.piezas_sin_conciliar,
    tieneEntrega: fila.tiene_entrega,
    pagoVisita: {
      registrado: fila.pago_registrado,
      confirmadoPorOtraPersona: fila.pago_confirmado_por_otra,
    },
    motivo,
  };
}

/**
 * Con que se autorizo: queda en el evento, junto a quien lo hizo (la
 * sesion) y cuando (el servidor).
 */
function baseDeLaAutorizacion(contexto: ContextoTransicion): string {
  if (contexto.cotizacionAceptada) return 'Autorizacion comercial: el cliente acepto la cotizacion.';
  if (requierePagoDeVisita(contexto)) {
    return 'Autorizacion comercial: pago de la visita registrado y confirmado por otra persona en la bitacora.';
  }
  return 'Autorizacion comercial: el caso no exige cotizacion aceptada ni pago previo.';
}

/** Destinos que exigen motivo escrito: se ofrecen y el motivo se pide al pulsar. */
const DESTINOS_CON_MOTIVO: readonly EstadoOrden[] = [ESTADO_ORDEN.ANULADA];

/**
 * Las acciones de estado que ESTE usuario puede dar sobre ESTA orden, ya
 * evaluadas por la maquina de estados con los datos reales. Las que no
 * puede llevan el motivo, para que el panel lo explique en vez de esconder
 * el boton sin decir por que.
 */
export async function evaluarAcciones(
  actor: Actor, idOrden: string, ejecutor?: Ejecutor,
): Promise<readonly AccionDeEstado[]> {
  const fila = await repositorio.buscarContextoTransicion(idOrden, ejecutor, false);
  if (fila === null) return [];
  const definicion = definicionDe(fila.estado);
  const acciones: AccionDeEstado[] = [];
  for (const transicion of definicion.transiciones) {
    const pideMotivo = DESTINOS_CON_MOTIVO.includes(transicion.hacia);
    const contexto = await armarContexto(
      actor, fila, transicion.hacia,
      // Para evaluar se supone el motivo escrito: se pedira al pulsar.
      pideMotivo ? 'motivo que se pedira al confirmar' : null,
      ejecutor ?? ejecutorPorDefecto(),
    );
    const veredicto = evaluarTransicion(contexto);
    acciones.push({
      hacia: transicion.hacia,
      permitida: veredicto.permitida,
      motivo: veredicto.permitida ? null : veredicto.motivo ?? null,
      pideMotivo,
    });
  }
  return acciones;
}

export async function mover(
  actor: Actor, idOrden: string, peticion: PeticionTransicion,
): Promise<ResultadoTransicion> {
  const { estadoAnterior, estadoNuevo } = await enTransaccion(async (cliente) => {
    const fila = await repositorio.buscarContextoTransicion(idOrden, cliente);
    if (fila === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');

    // El cerco primero: la maquina de estados dice si el PASO vale, esto
    // dice si la ORDEN es suya. Son dos preguntas y hay que hacer las dos.
    exigirCerco(await alcanceDe(actor, cliente), fila);

    const contexto = await armarContexto(actor, fila, peticion.hacia, peticion.motivo ?? null, cliente);

    const veredicto = evaluarTransicion(contexto);
    if (!veredicto.permitida) {
      throw new ErrorDominio(
        veredicto.codigo ?? 'TRANSICION_INVALIDA',
        veredicto.motivo ?? 'No se puede mover la orden a ese estado.',
      );
    }

    // Conversion de ruta a taller: cambia la modalidad, conserva numero e
    // historial. La maquina ya garantizo que el sentido inverso no existe.
    const convierteATaller = fila.estado === ESTADO_ORDEN.EN_RUTA
      && peticion.hacia === ESTADO_ORDEN.EN_COLA_TALLER;

    const calendario = await servicioAgenda.obtenerCalendarioLaboral(fila.id_centro, cliente);
    const cierra = definicionDe(peticion.hacia).esFinal;
    const plazo = cierra
      ? null
      : await repositorio.buscarPlazo(peticion.hacia, fila.tipo_garantia, cliente);

    // Un solo instante para el plazo nuevo y para el sello del estado: dos
    // relojes distintos harian que el plazo no sea el que se prometio.
    const momentoCambio = new Date();

    await repositorio.aplicarTransicion(cliente, {
      idOrden,
      estadoNuevo: peticion.hacia,
      plazoVenceEn: plazo === null
        ? null
        : sumarHorasLaborables(momentoCambio, plazo.horas_maximas, calendario),
      idResponsableActual: await responsableDelNuevoEstado(peticion.hacia, actor, fila.id_tecnico, cliente),
      modalidadNueva: convierteATaller ? MODALIDAD_SERVICIO.TALLER : null,
      motivoAnulacion: peticion.hacia === ESTADO_ORDEN.ANULADA ? peticion.motivo ?? null : null,
      marcaEntrega: peticion.hacia === ESTADO_ORDEN.ENTREGADA,
      modificadoPor: actor.id,
      momentoCambio,
      // Al cerrar se conserva el ultimo plazo: es el registro de lo que se
      // prometio, y sin el no se puede medir si se cumplio.
      conservarPlazo: cierra,
    });

    await repositorio.insertarEvento(cliente, {
      idOrden,
      estadoAnterior: fila.estado,
      estadoNuevo: peticion.hacia,
      idResponsable: actor.id,
      observacion: convierteATaller
        ? `Conversion de ruta a taller: el articulo se traslada al centro. ${peticion.observacion ?? ''}`.trim()
        : peticion.hacia === ESTADO_ORDEN.AUTORIZADA
          ? `${baseDeLaAutorizacion(contexto)} ${peticion.observacion ?? ''}`.trim()
          : peticion.observacion ?? peticion.motivo ?? null,
    });

    return { estadoAnterior: fila.estado, estadoNuevo: peticion.hacia };
  });

  const fila = await repositorio.buscarPorId(idOrden);
  const calendario = await servicioAgenda.obtenerCalendarioLaboral(actor.idCentro);
  const restantes = fila!.plazo_vence_en === null
    ? null
    : horasParaVencer(new Date(), fila!.plazo_vence_en, calendario);

  return {
    orden: aResumenOrden(fila!, restantes),
    estadoAnterior,
    estadoNuevo,
    plazoVenceEn: fila!.plazo_vence_en?.toISOString() ?? null,
  };
}

/**
 * RN-29: una orden cerrada no se edita, se le adjunta una nota de
 * correccion. Lo contrario —solo se puede corregir lo que sigue abierto—
 * tambien vale: una orden en curso se corrige editandola.
 */
export async function agregarNotaCorreccion(
  actor: Actor, idOrden: string, peticion: PeticionNotaCorreccion,
): Promise<void> {
  await enTransaccion(async (cliente) => {
    const fila = await repositorio.buscarContextoTransicion(idOrden, cliente);
    if (fila === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');

    if (!definicionDe(fila.estado).esFinal) {
      throw new ErrorDominio(
        'ORDEN_ABIERTA',
        `La orden ${fila.numero} sigue abierta: corrijala directamente. Las notas de correccion ` +
          'son para lo que ya no se puede editar.',
      );
    }

    await repositorio.insertarNota(cliente, {
      idOrden, motivo: peticion.motivo, detalle: peticion.detalle, creadoPor: actor.id,
    });
  });
}
