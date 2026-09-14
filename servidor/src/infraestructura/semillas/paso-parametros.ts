/**
 * Paso 3: parametros de proceso. Plazos, calendario laboral, matriz de
 * evidencia obligatoria y plantillas de diagnostico. Son datos, no codigo.
 */
import type { PoolClient } from 'pg';
import { ESTADO_ORDEN, MOMENTO_EVIDENCIA, TIPO_GARANTIA, TIPO_CAMPO_CHECKLIST } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import type { ContextoSiembra } from './contexto.js';
import { PLANTILLAS_DIAGNOSTICO, REGLAS_EVIDENCIA } from './parametros-datos.js';

/** [estado, horas_maximas, horas_alerta] en horas laborables (H3 · RN-16). */
export const PLAZOS_GENERALES: readonly (readonly [string, number, number])[] = [
  [ESTADO_ORDEN.REGISTRADA, 8, 6],
  [ESTADO_ORDEN.ASIGNADA, 16, 12],
  [ESTADO_ORDEN.EN_RUTA, 24, 18],
  [ESTADO_ORDEN.EN_COLA_TALLER, 24, 18],
  [ESTADO_ORDEN.EN_DIAGNOSTICO, 16, 12],
  [ESTADO_ORDEN.COTIZADA, 8, 6],
  [ESTADO_ORDEN.ESPERANDO_AUTORIZACION, 40, 32],
  [ESTADO_ORDEN.ESPERANDO_REPUESTO, 120, 96],
  [ESTADO_ORDEN.EN_REPARACION, 32, 24],
  [ESTADO_ORDEN.FINALIZADA, 24, 16],
];

/** La garantia de proveedor corre contra plazos del fabricante: son mas cortos. */
const PLAZOS_POR_TIPO: readonly (readonly [string, string, number, number])[] = [
  [ESTADO_ORDEN.EN_DIAGNOSTICO, TIPO_GARANTIA.PROVEEDOR, 8, 6],
  [ESTADO_ORDEN.ESPERANDO_REPUESTO, TIPO_GARANTIA.PROVEEDOR, 80, 64],
  [ESTADO_ORDEN.ESPERANDO_AUTORIZACION, TIPO_GARANTIA.PARTICULAR, 48, 40],
  [ESTADO_ORDEN.ESPERANDO_REPUESTO, TIPO_GARANTIA.PARTICULAR, 160, 120],
  [ESTADO_ORDEN.EN_DIAGNOSTICO, TIPO_GARANTIA.ADICIONAL, 12, 8],
];

/**
 * Horario real del centro, confirmado por el taller:
 * lunes a viernes 07:00-20:00 y sabado 07:00-17:00. Siempre hay alguien.
 *
 * El domingo no figura: es el unico dia sin atencion. Si el taller abriera
 * los domingos, basta agregar la fila con dia_semana = 0; el calculo de
 * horas laborables lo toma de esta tabla, no del codigo.
 */
const CALENDARIO: readonly (readonly [number, string, string])[] = [
  [1, '07:00', '20:00'], [2, '07:00', '20:00'], [3, '07:00', '20:00'],
  [4, '07:00', '20:00'], [5, '07:00', '20:00'], [6, '07:00', '17:00'],
];

/** Feriados nacionales de Nicaragua mas los locales de Managua. */
const FERIADOS: readonly (readonly [string, string])[] = [
  ['2025-12-08', 'La Purisima'], ['2025-12-25', 'Navidad'],
  ['2026-01-01', 'Ano Nuevo'], ['2026-04-02', 'Jueves Santo'], ['2026-04-03', 'Viernes Santo'],
  ['2026-05-01', 'Dia del Trabajo'], ['2026-05-30', 'Dia de las Madres'],
  ['2026-07-19', 'Aniversario de la Revolucion'],
  ['2026-08-01', 'Bajada de Santo Domingo'], ['2026-08-10', 'Subida de Santo Domingo'],
  ['2026-09-14', 'Batalla de San Jacinto'], ['2026-09-15', 'Independencia'],
];

export async function sembrarParametros(cliente: PoolClient, contexto: ContextoSiembra): Promise<void> {
  const { azar } = contexto;

  await copiarFilas(
    cliente,
    'regla_plazo',
    ['id', 'estado', 'tipo', 'horas_maximas', 'horas_alerta', 'activa'],
    [
      ...PLAZOS_GENERALES.map(([estado, maximas, alerta]) => [azar.uuid(), estado, null, maximas, alerta, true]),
      ...PLAZOS_POR_TIPO.map(([estado, tipo, maximas, alerta]) => [azar.uuid(), estado, tipo, maximas, alerta, true]),
    ],
  );

  await copiarFilas(
    cliente,
    'calendario_laboral',
    ['id', 'id_centro', 'dia_semana', 'hora_inicio', 'hora_fin', 'activo'],
    CALENDARIO.map(([dia, inicio, fin]) => [azar.uuid(), contexto.idCentro, dia, inicio, fin, true]),
  );

  await copiarFilas(
    cliente,
    'dia_no_laborable',
    ['id', 'id_centro', 'fecha', 'motivo'],
    FERIADOS.map(([fecha, motivo]) => [azar.uuid(), contexto.idCentro, fecha, motivo]),
  );

  const idPorCategoria = new Map(contexto.categorias.map((c) => [c.nombre, c.id]));
  await copiarFilas(
    cliente,
    'regla_evidencia',
    ['id', 'tipo', 'id_categoria', 'id_marca', 'momento', 'clave', 'etiqueta',
      'obligatoria', 'bloquea_avance', 'activa'],
    REGLAS_EVIDENCIA.map((regla) => [
      azar.uuid(), regla.tipo,
      regla.categoria === null ? null : idPorCategoria.get(regla.categoria) ?? null,
      null, regla.momento, regla.clave, regla.etiqueta, regla.obligatoria, regla.obligatoria, true,
    ]),
  );

  // ── plantillas de diagnostico ──
  contexto.plantillas = PLANTILLAS_DIAGNOSTICO.flatMap((plantilla) => {
    const idCategoria = idPorCategoria.get(plantilla.categoria);
    if (idCategoria === undefined) return [];
    return [{
      id: azar.uuid(),
      idCategoria,
      items: plantilla.items.map((item) => ({
        id: azar.uuid(),
        etiqueta: item.etiqueta,
        tipoCampo: item.tipoCampo,
        unidad: item.unidad ?? null,
        rangoMin: item.rangoMin ?? null,
        rangoMax: item.rangoMax ?? null,
      })),
    }];
  });

  await copiarFilas(
    cliente,
    'checklist_plantilla',
    ['id', 'id_categoria', 'nombre', 'version', 'activa'],
    contexto.plantillas.map((plantilla, indice) => [
      plantilla.id, plantilla.idCategoria,
      `Diagnostico ${PLANTILLAS_DIAGNOSTICO[indice]!.categoria}`, 1, true,
    ]),
  );

  await copiarFilas(
    cliente,
    'checklist_item_plantilla',
    ['id', 'id_plantilla', 'orden', 'etiqueta', 'tipo_campo', 'unidad', 'rango_min', 'rango_max',
      'opciones', 'obligatorio'],
    contexto.plantillas.flatMap((plantilla) =>
      plantilla.items.map((item, orden) => [
        item.id, plantilla.id, orden + 1, item.etiqueta, item.tipoCampo, item.unidad,
        item.rangoMin, item.rangoMax,
        item.tipoCampo === TIPO_CAMPO_CHECKLIST.SELECCION ? ['si', 'no', 'parcial'] : null,
        true,
      ]),
    ),
  );
}

export { MOMENTO_EVIDENCIA };
