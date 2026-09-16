/**
 * Indicadores de operacion.
 *
 * Los numeros con los que la jefatura decide: si el taller cumple lo que
 * promete, donde se atasca el trabajo, y que articulos vuelven.
 */
import type { IndicadoresDeOperacion } from '@servitotal/compartido';
import * as repositorio from './repositorio.js';

/** Cuantos articulos reincidentes se listan. */
const TOPE_REINCIDENCIAS = 20;

function redondear(valor: number | null): number | null {
  return valor === null ? null : Math.round(valor * 10) / 10;
}

export async function calcular(): Promise<IndicadoresDeOperacion> {
  // En serie a proposito: van sobre la misma conexion del pool.
  const porEstado = await repositorio.ordenesPorEstado();
  const cumplimiento = await repositorio.cumplimiento();
  const permanencia = await repositorio.permanenciaPorEstado();
  const tecnicos = await repositorio.productividadDeTecnicos();
  const reincidencias = await repositorio.reincidencias(TOPE_REINCIDENCIAS);

  const cerradas = Number(cumplimiento.cerradas);
  const aTiempo = Number(cumplimiento.a_tiempo);

  return {
    calculadoEn: new Date().toISOString(),
    ordenesVivas: porEstado.reduce((suma, fila) => suma + Number(fila.ordenes), 0),
    porEstado: porEstado.map((fila) => ({
      estado: fila.estado,
      ordenes: Number(fila.ordenes),
      vencidas: Number(fila.vencidas),
    })),
    cumplimiento: {
      cerradas,
      aTiempo,
      // Sin ordenes cerradas no hay porcentaje: cero, no una division por cero.
      porcentaje: cerradas === 0 ? 0 : Math.round((aTiempo / cerradas) * 1000) / 10,
      vencidasAbiertas: Number(cumplimiento.vencidas_abiertas),
    },
    permanencia: permanencia.map((fila) => ({
      estado: fila.estado,
      ordenes: Number(fila.ordenes),
      horasPromedio: redondear(fila.horas_promedio) ?? 0,
    })),
    tecnicos: tecnicos.map((fila) => ({
      idTecnico: fila.id,
      tecnico: fila.tecnico,
      tipo: fila.tipo,
      ordenesCerradas: Number(fila.cerradas),
      enCurso: Number(fila.en_curso),
      vencidas: Number(fila.vencidas),
      horasPromedioCierre: redondear(fila.horas_promedio_cierre),
    })),
    reincidencias: reincidencias.map((fila) => ({
      idArticulo: fila.id_articulo,
      articulo: fila.articulo,
      cliente: fila.cliente,
      ordenes: Number(fila.ordenes),
      ultimaOrden: Number(fila.ultima_orden),
      diasEntreUltimasDos: redondear(fila.dias_entre_ultimas_dos),
    })),
  };
}
