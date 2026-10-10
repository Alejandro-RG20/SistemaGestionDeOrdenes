/**
 * Reglas de agenda.
 *
 * La doble programacion se vuelve imposible, no improbable: el indice
 * ux_visita_tecnico_franja la prohibe en la base y aqui se traduce el
 * choque a un mensaje que el asistente entiende. No se comprueba antes con
 * un SELECT, porque entre ese SELECT y el INSERT cabe otra peticion.
 */
import type {
  CalendarioDelCentro, Paginacion, PeticionProgramarVisita,
  PeticionReprogramarVisita, ResumenVisita,
} from '@servitotal/compartido';
import { ESTADOS_FINALES, MODALIDAD_SERVICIO, RESULTADO_VISITA, type ResumenAgenda } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { enTransaccion, ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorConflicto, ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { construirCalendario, type CalendarioLaboral } from '../../dominio/plazos/indice.js';
import { exigirCercoSobreOrden } from '../ordenes/alcance.js';
import * as repositorio from './repositorio.js';
import { aCalendarioDelCentro, aResumenVisita } from './dto.js';

/** Codigo de violacion de restriccion unica de PostgreSQL. */
const UNICIDAD_VIOLADA = '23505';

/**
 * El calendario cambia una o dos veces al ano; leerlo en cada calculo de
 * plazo seria un viaje a la base por orden listada en la bandeja.
 */
const CACHE_CALENDARIO = new Map<string, { calendario: CalendarioLaboral; vence: number }>();
const VIDA_CACHE_MS = 5 * 60_000;

export function olvidarCalendario(idCentro?: string): void {
  if (idCentro === undefined) CACHE_CALENDARIO.clear();
  else CACHE_CALENDARIO.delete(idCentro);
}

export async function obtenerCalendarioLaboral(
  idCentro: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<CalendarioLaboral> {
  const guardado = CACHE_CALENDARIO.get(idCentro);
  if (guardado !== undefined && guardado.vence > Date.now()) return guardado.calendario;

  // En secuencia: `ejecutor` puede ser un cliente de transaccion.
  const jornadas = await repositorio.listarJornadas(idCentro, ejecutor);
  const dias = await repositorio.listarDiasNoLaborables(idCentro, ejecutor);

  if (jornadas.length === 0) {
    throw new ErrorDominio(
      'SIN_CALENDARIO_LABORAL',
      'El centro no tiene horario de trabajo configurado, asi que no se pueden calcular los plazos. ' +
        'Pida a la jefatura que registre el horario de atencion.',
    );
  }

  const calendario = construirCalendario(
    jornadas.map((jornada) => ({
      diaSemana: jornada.dia_semana,
      horaInicio: jornada.hora_inicio,
      horaFin: jornada.hora_fin,
    })),
    dias.map((dia) => dia.fecha.toISOString().slice(0, 10)),
  );

  CACHE_CALENDARIO.set(idCentro, { calendario, vence: Date.now() + VIDA_CACHE_MS });
  return calendario;
}

export async function obtenerCalendarioDelCentro(idCentro: string): Promise<CalendarioDelCentro> {
  const [jornadas, dias] = await Promise.all([
    repositorio.listarJornadas(idCentro),
    repositorio.listarDiasNoLaborables(idCentro),
  ]);
  return aCalendarioDelCentro(jornadas, dias);
}

/**
 * Un tecnico ve en la agenda solo sus visitas: la agenda de los demas
 * lleva direcciones y telefonos de clientes que no atiende.
 */
async function filtroConCerco(actor: Actor, filtro: repositorio.FiltroAgenda): Promise<repositorio.FiltroAgenda> {
  const propio = await repositorio.tecnicoDeUsuario(actor.id);
  return propio === null || actor.permisos.includes('agenda.programar') ? filtro : { ...filtro, idTecnico: propio };
}

export async function resumir(actor: Actor, filtro: repositorio.FiltroAgenda): Promise<ResumenAgenda> {
  const fila = await repositorio.resumir(await filtroConCerco(actor, filtro));
  return {
    programadas: fila.programadas, enCurso: fila.en_curso, realizadas: fila.realizadas,
    resueltasEnSitio: fila.resueltas_en_sitio, requiereTrasladoTaller: fila.requiere_traslado_taller,
    clienteAusente: fila.cliente_ausente, noAutorizada: fila.no_autorizada,
  };
}

export async function listarConCerco(
  actor: Actor, filtro: repositorio.FiltroAgenda, pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenVisita[]; paginacion: Paginacion }> {
  return listar(await filtroConCerco(actor, filtro), pagina);
}

export async function listar(
  filtro: repositorio.FiltroAgenda, pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenVisita[]; paginacion: Paginacion }> {
  const [total, filas] = await Promise.all([
    repositorio.contar(filtro),
    repositorio.listar(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenVisita), paginacion: construirPaginacion(pagina, total) };
}

/**
 * Las visitas de una orden.
 *
 * Lleva el cerco por datos: una visita dice a que hora se llego a la casa
 * del cliente y que se encontro. Es el mismo expediente de la orden, visto
 * por otra puerta.
 */
export async function listarDeOrden(
  actor: Actor, idOrden: string,
): Promise<readonly ResumenVisita[]> {
  await exigirCercoSobreOrden(actor, idOrden);
  const filas = await repositorio.listarDeOrden(idOrden);
  return filas.map(aResumenVisita);
}

/** Lo consulta la maquina de estados antes de dejar salir una orden a ruta. */
export async function tieneVisitaVigente(idOrden: string, ejecutor?: Ejecutor): Promise<boolean> {
  return repositorio.hayVisitaVigente(idOrden, ejecutor ?? ejecutorPorDefecto());
}

async function insertarCuidandoLaFranja(
  ejecutor: Ejecutor,
  datos: Parameters<typeof repositorio.insertar>[1],
): Promise<string> {
  try {
    return await repositorio.insertar(ejecutor, datos);
  } catch (error) {
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === UNICIDAD_VIOLADA) {
      throw new ErrorConflicto(
        `Ese tecnico ya tiene una visita el ${datos.fechaProgramada} en la franja ` +
          `${datos.franjaHoraria}. Elija otra franja u otro tecnico.`,
        error,
      );
    }
    throw error;
  }
}

export async function programarVisita(
  actor: Actor, idOrden: string, peticion: PeticionProgramarVisita,
): Promise<ResumenVisita> {
  return enTransaccion(async (cliente) => {
    // El cerco por datos. Hoy ningun rol con `agenda.programar` esta
    // cercado, asi que no cambia nada; esta puesto para que el dia que se
    // agregue uno no haya que acordarse de esta linea.
    await exigirCercoSobreOrden(actor, idOrden, cliente);
    const tecnico = await repositorio.tecnicoExiste(peticion.idTecnico, cliente);
    if (tecnico === null) {
      throw new ErrorValidacion('El tecnico indicado no existe o esta inactivo.',
        { idTecnico: 'Tecnico no valido.' });
    }

    await exigirOrdenQueAdmiteVisitas(idOrden, cliente);
    // Solo choca con una visita que todavia no se hizo. Una ya realizada
    // conserva su registro y no impide programar la siguiente.
    const pendiente = await repositorio.buscarPendienteDeOrden(idOrden, cliente);
    if (pendiente !== null) {
      throw new ErrorConflicto(
        `La orden ya tiene una visita programada para el ${pendiente.fecha_programada.toISOString().slice(0, 10)} ` +
          `en la franja ${pendiente.franja_horaria}. Si hay que moverla, reprogramela.`,
      );
    }

    const id = await insertarCuidandoLaFranja(cliente, {
      idOrden,
      idTecnico: peticion.idTecnico,
      fechaProgramada: peticion.fechaProgramada,
      franjaHoraria: peticion.franjaHoraria,
      ordenRecorrido: peticion.ordenRecorrido ?? null,
      creadoPor: actor.id,
    });

    const fila = await repositorio.buscarPorId(id, cliente);
    return aResumenVisita(fila!);
  });
}

/**
 * Reprogramar cierra la visita anterior y abre otra. La anterior deja de
 * ser vigente, con lo que libera su franja para otra orden.
 */
export interface ResultadoDeVisita {
  readonly resultado: string;
  readonly horaLlegada: string;
  readonly horaSalida?: string | undefined;
  readonly motivo?: string | undefined;
}

/**
 * Cierra la visita con lo que paso en el domicilio. Llega de la cola de
 * sincronizacion, asi que corre dentro de la transaccion del motor.
 */
export async function registrarResultadoDeVisita(
  ejecutor: Ejecutor, actor: Actor, idOrden: string, datos: ResultadoDeVisita,
): Promise<ResumenVisita> {
  const vigente = await repositorio.buscarVigenteDeOrden(idOrden, ejecutor);
  if (vigente === null) {
    throw new ErrorNoEncontrado('La orden no tiene ninguna visita vigente que cerrar.');
  }
  // Una visita sigue «vigente» despues de cerrarse (deja de serlo solo al
  // reprogramarla). Sin esta comprobacion, un segundo registro —otro
  // dispositivo, o el mismo con otro identificador de operacion— pisaba la
  // hora de llegada y el resultado del primero sin dejar rastro.
  if (vigente.resultado !== RESULTADO_VISITA.PROGRAMADA) {
    throw new ErrorDominio(
      'VISITA_YA_REGISTRADA',
      `La visita de la orden ${vigente.numero_orden} ya tiene resultado (${vigente.resultado}). `
        + 'Si hubo otra visita, hay que programarla o reprogramarla primero.',
    );
  }
  // La registra el tecnico al que se le programo. Otro tecnico no cierra
  // una visita ajena, aunque vea la orden.
  const idTecnico = await repositorio.tecnicoDeUsuario(actor.id, ejecutor);
  if (idTecnico !== null && idTecnico !== vigente.id_tecnico) {
    throw new ErrorDominio(
      'NO_ES_RESPONSABLE',
      `La visita de la orden ${vigente.numero_orden} esta programada para otro tecnico.`,
    );
  }

  await repositorio.registrarResultado(ejecutor, {
    id: vigente.id,
    resultado: datos.resultado,
    horaLlegada: new Date(datos.horaLlegada),
    horaSalida: datos.horaSalida === undefined ? null : new Date(datos.horaSalida),
    motivo: datos.motivo ?? null,
  });

  const fila = await repositorio.buscarPorId(vigente.id, ejecutor);
  return aResumenVisita(fila!);
}

/** Una visita se programa sobre una orden de ruta abierta. */
async function exigirOrdenQueAdmiteVisitas(idOrden: string, ejecutor: Ejecutor): Promise<void> {
  const orden = await repositorio.ordenParaVisita(idOrden, ejecutor);
  if (orden === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');
  if ((ESTADOS_FINALES as readonly string[]).includes(orden.estado)) {
    throw new ErrorDominio('ORDEN_CERRADA', `La orden ya esta ${orden.estado.replace(/_/g, ' ')}: no se programan visitas.`);
  }
  if (orden.modalidad !== MODALIDAD_SERVICIO.RUTA) {
    throw new ErrorDominio(
      'ORDEN_DE_TALLER',
      'Es una orden de taller: el cliente lleva el articulo al centro y no lleva visita a domicilio.',
    );
  }
}

type VisitaParaRegistrar = NonNullable<Awaited<ReturnType<typeof repositorio.buscarParaRegistrar>>>;

/**
 * Comprobaciones comunes a llegada y salida: la orden es visible para quien
 * registra y sigue abierta, la visita no esta reprogramada ni cerrada, y
 * quien registra es el tecnico de la visita o alguien que programa agenda.
 */
async function visitaParaRegistrar(actor: Actor, idVisita: string, ejecutor: Ejecutor): Promise<VisitaParaRegistrar> {
  const visita = await repositorio.buscarParaRegistrar(idVisita, ejecutor);
  if (visita === null) throw new ErrorNoEncontrado('No existe una visita con ese identificador.');
  await exigirCercoSobreOrden(actor, visita.id_orden, ejecutor);
  if ((ESTADOS_FINALES as readonly string[]).includes(visita.estado_orden)) {
    throw new ErrorDominio('ORDEN_CERRADA', 'La orden ya esta cerrada: no se registran visitas.');
  }
  if (!visita.vigente) {
    throw new ErrorDominio('VISITA_REPROGRAMADA', 'Esa visita se reprogramo: registre la visita vigente.');
  }
  if (visita.resultado !== RESULTADO_VISITA.PROGRAMADA) {
    throw new ErrorDominio(
      'VISITA_YA_REGISTRADA',
      `Esa visita ya tiene resultado (${visita.resultado.replace(/_/g, ' ')}) y no se modifica. `
        + 'Si hubo otra visita, programela.',
    );
  }
  const propio = await repositorio.tecnicoDeUsuario(actor.id, ejecutor);
  const esElTecnico = propio !== null && propio === visita.id_tecnico;
  if (!esElTecnico && !actor.permisos.includes('agenda.programar')) {
    throw new ErrorDominio('NO_ES_RESPONSABLE', 'Esta visita esta programada para otro tecnico.');
  }
  return visita;
}

/** El tecnico llego al domicilio. La hora es la del servidor, no la del navegador. */
export async function registrarLlegada(actor: Actor, idVisita: string): Promise<ResumenVisita> {
  return enTransaccion(async (cliente) => {
    const visita = await visitaParaRegistrar(actor, idVisita, cliente);
    if (visita.hora_llegada !== null) {
      throw new ErrorConflicto(
        `La llegada ya se registro a las ${visita.hora_llegada.toISOString()}. No se sobrescribe.`,
        undefined, 'LLEGADA_YA_REGISTRADA',
      );
    }
    await repositorio.anotarLlegada(cliente, idVisita);
    return aResumenVisita((await repositorio.buscarPorId(idVisita, cliente))!);
  });
}

/** El tecnico termina la visita: hora de salida, resultado y observaciones. */
export async function registrarSalida(
  actor: Actor, idVisita: string, datos: { resultado: string; observaciones?: string | null | undefined },
): Promise<ResumenVisita> {
  return enTransaccion(async (cliente) => {
    const visita = await visitaParaRegistrar(actor, idVisita, cliente);
    if (visita.hora_llegada === null) {
      throw new ErrorDominio('SIN_LLEGADA', 'Registre primero la llegada al domicilio.');
    }
    await repositorio.anotarSalida(cliente, {
      idVisita, resultado: datos.resultado, observaciones: datos.observaciones?.trim() || null,
    });
    return aResumenVisita((await repositorio.buscarPorId(idVisita, cliente))!);
  });
}

export async function reprogramarVisita(
  actor: Actor, idOrden: string, peticion: PeticionReprogramarVisita,
): Promise<ResumenVisita> {
  return enTransaccion(async (cliente) => {
    // El cerco por datos. Hoy ningun rol con `agenda.programar` esta
    // cercado, asi que no cambia nada; esta puesto para que el dia que se
    // agregue uno no haya que acordarse de esta linea.
    await exigirCercoSobreOrden(actor, idOrden, cliente);
    // Se reprograma la visita que falta hacer; una realizada no se toca.
    const vigente = await repositorio.buscarPendienteDeOrden(idOrden, cliente);
    if (vigente === null) {
      throw new ErrorNoEncontrado('La orden no tiene ninguna visita pendiente que reprogramar.');
    }
    const tecnico = await repositorio.tecnicoExiste(peticion.idTecnico, cliente);
    if (tecnico === null) {
      throw new ErrorValidacion('El tecnico indicado no existe o esta inactivo.',
        { idTecnico: 'Tecnico no valido.' });
    }

    await repositorio.dejarSinVigencia(cliente, vigente.id, peticion.motivo);

    const id = await insertarCuidandoLaFranja(cliente, {
      idOrden,
      idTecnico: peticion.idTecnico,
      fechaProgramada: peticion.fechaProgramada,
      franjaHoraria: peticion.franjaHoraria,
      ordenRecorrido: peticion.ordenRecorrido ?? null,
      creadoPor: actor.id,
    });

    const fila = await repositorio.buscarPorId(id, cliente);
    return aResumenVisita(fila!);
  });
}
