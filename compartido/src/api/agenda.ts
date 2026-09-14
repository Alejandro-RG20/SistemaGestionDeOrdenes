/** Contratos del modulo de agenda: visitas y calendario laboral. */
import type { ResultadoVisita } from '../dominio/orden.js';

export const FRANJAS_HORARIAS = [
  '07:00-09:00', '09:00-11:00', '11:00-13:00',
  '13:00-15:00', '15:00-17:00', '17:00-19:00',
] as const;
export type FranjaHoraria = (typeof FRANJAS_HORARIAS)[number];

export interface ResumenVisita {
  readonly id: string;
  readonly idOrden: string;
  readonly numeroOrden: number;
  readonly idTecnico: string;
  readonly tecnico: string;
  readonly fechaProgramada: string;
  readonly franjaHoraria: string;
  readonly ordenRecorrido: number | null;
  readonly horaLlegada: string | null;
  readonly horaSalida: string | null;
  readonly resultado: ResultadoVisita;
  readonly vigente: boolean;
  readonly motivo: string | null;
  readonly direccionServicio: string | null;
  readonly zona: string | null;
}

export interface PeticionProgramarVisita {
  readonly idTecnico: string;
  readonly fechaProgramada: string;
  readonly franjaHoraria: string;
  readonly ordenRecorrido?: number | null;
}

export interface PeticionReprogramarVisita extends PeticionProgramarVisita {
  readonly motivo: string;
}

export interface JornadaDelCentro {
  readonly diaSemana: number;
  readonly horaInicio: string;
  readonly horaFin: string;
}

export interface CalendarioDelCentro {
  readonly jornadas: readonly JornadaDelCentro[];
  readonly diasNoLaborables: readonly { readonly fecha: string; readonly motivo: string | null }[];
}
