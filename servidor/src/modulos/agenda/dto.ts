/** Filas de visita y calendario, y su traduccion a los contratos publicos. */
import type { CalendarioDelCentro, ResultadoVisita, ResumenVisita } from '@servitotal/compartido';

export interface FilaVisita {
  readonly id: string;
  readonly id_orden: string;
  readonly numero_orden: number;
  readonly id_tecnico: string;
  readonly tecnico: string;
  readonly fecha_programada: Date;
  readonly franja_horaria: string;
  readonly orden_recorrido: number | null;
  readonly hora_llegada: Date | null;
  readonly hora_salida: Date | null;
  readonly resultado: ResultadoVisita;
  readonly vigente: boolean;
  readonly motivo: string | null;
  readonly direccion_servicio: string | null;
  readonly zona: string | null;
}

export interface FilaJornada {
  readonly dia_semana: number;
  readonly hora_inicio: string;
  readonly hora_fin: string;
}

export interface FilaDiaNoLaborable {
  readonly fecha: Date;
  readonly motivo: string | null;
}

const comoFecha = (valor: Date): string => valor.toISOString().slice(0, 10);

export function aResumenVisita(fila: FilaVisita): ResumenVisita {
  return {
    id: fila.id,
    idOrden: fila.id_orden,
    numeroOrden: fila.numero_orden,
    idTecnico: fila.id_tecnico,
    tecnico: fila.tecnico,
    fechaProgramada: comoFecha(fila.fecha_programada),
    franjaHoraria: fila.franja_horaria,
    ordenRecorrido: fila.orden_recorrido,
    horaLlegada: fila.hora_llegada?.toISOString() ?? null,
    horaSalida: fila.hora_salida?.toISOString() ?? null,
    resultado: fila.resultado,
    vigente: fila.vigente,
    motivo: fila.motivo,
    direccionServicio: fila.direccion_servicio,
    zona: fila.zona,
  };
}

export function aCalendarioDelCentro(
  jornadas: readonly FilaJornada[],
  dias: readonly FilaDiaNoLaborable[],
): CalendarioDelCentro {
  return {
    jornadas: jornadas.map((jornada) => ({
      diaSemana: jornada.dia_semana,
      horaInicio: jornada.hora_inicio.slice(0, 5),
      horaFin: jornada.hora_fin.slice(0, 5),
    })),
    diasNoLaborables: dias.map((dia) => ({ fecha: comoFecha(dia.fecha), motivo: dia.motivo })),
  };
}
