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
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { enTransaccion, ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorConflicto, ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { construirCalendario, type CalendarioLaboral } from '../../dominio/plazos/indice.js';
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

  const [jornadas, dias] = await Promise.all([
    repositorio.listarJornadas(idCentro, ejecutor),
    repositorio.listarDiasNoLaborables(idCentro, ejecutor),
  ]);

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

export async function listar(
  filtro: repositorio.FiltroAgenda, pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenVisita[]; paginacion: Paginacion }> {
  const [total, filas] = await Promise.all([
    repositorio.contar(filtro),
    repositorio.listar(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenVisita), paginacion: construirPaginacion(pagina, total) };
}

export async function listarDeOrden(idOrden: string): Promise<readonly ResumenVisita[]> {
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
    const tecnico = await repositorio.tecnicoExiste(peticion.idTecnico, cliente);
    if (tecnico === null) {
      throw new ErrorValidacion('El tecnico indicado no existe o esta inactivo.',
        { idTecnico: 'Tecnico no valido.' });
    }

    const vigente = await repositorio.buscarVigenteDeOrden(idOrden, cliente);
    if (vigente !== null) {
      throw new ErrorConflicto(
        `La orden ya tiene una visita programada para el ${vigente.fecha_programada.toISOString().slice(0, 10)} ` +
          `en la franja ${vigente.franja_horaria}. Si hay que moverla, reprogramela.`,
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
export async function reprogramarVisita(
  actor: Actor, idOrden: string, peticion: PeticionReprogramarVisita,
): Promise<ResumenVisita> {
  return enTransaccion(async (cliente) => {
    const vigente = await repositorio.buscarVigenteDeOrden(idOrden, cliente);
    if (vigente === null) {
      throw new ErrorNoEncontrado('La orden no tiene ninguna visita vigente que reprogramar.');
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
