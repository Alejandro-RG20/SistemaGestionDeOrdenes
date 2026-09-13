/**
 * Paso 10: diagnosticos con sus mediciones tipificadas y cotizaciones.
 *
 * Las mediciones son datos, no fotografias: por eso se marca fuera_de_rango
 * comparando contra el rango de la plantilla (RF-23).
 */
import type { PoolClient } from 'pg';
import { ESTADO_ORDEN, FORMA_ACEPTACION, TIPO_CAMPO_CHECKLIST, TIPO_GARANTIA } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { sumarHoras } from './aleatorio.js';
import { COMPONENTES, FALLAS_REALES } from './nombres.js';
import type { ContextoSiembra, ReferenciaPlantilla } from './contexto.js';
import type { ResumenOrden } from './paso-ordenes.js';

export async function sembrarDiagnosticos(
  cliente: PoolClient,
  contexto: ContextoSiembra,
  ordenes: readonly ResumenOrden[],
): Promise<void> {
  const { azar } = contexto;
  const plantillaPorCategoria = new Map<string, ReferenciaPlantilla>(
    contexto.plantillas.map((plantilla) => [plantilla.idCategoria, plantilla]),
  );

  const filasDiagnostico: unknown[][] = [];
  const filasItem: unknown[][] = [];
  const filasCotizacion: unknown[][] = [];

  for (const orden of ordenes) {
    const posicion = orden.estados.indexOf(ESTADO_ORDEN.EN_DIAGNOSTICO);
    if (posicion < 0 || orden.tecnico === null) continue;

    const momento = orden.momentos[posicion]!;
    const idDiagnostico = azar.uuid();
    const plantilla = plantillaPorCategoria.get(orden.idCategoria);
    const sinConexion = orden.nacioEnRuta && !orden.convertida && azar.booleano(0.55);

    filasDiagnostico.push([
      idDiagnostico, orden.id, orden.tecnico.id, plantilla?.id ?? null,
      azar.elegir(FALLAS_REALES), azar.elegir(COMPONENTES),
      sinConexion ? sumarHoras(momento, -azar.decimal(0.5, 5, 1)) : momento,
      sinConexion, momento,
    ]);

    for (const item of plantilla?.items ?? []) {
      const fila = medirItem(contexto, idDiagnostico, item);
      filasItem.push(fila);
    }

    const posicionCotizacion = orden.estados.indexOf(ESTADO_ORDEN.COTIZADA);
    if (posicionCotizacion < 0) continue;

    const momentoCotizacion = orden.momentos[posicionCotizacion]!;
    const manoObra = azar.decimal(250, 2_600);
    const totalRepuestos = azar.decimal(0, 9_000);
    const total = Number((manoObra + totalRepuestos + orden.cargoVisita).toFixed(2));
    const esperoAutorizacion = orden.estados.includes(ESTADO_ORDEN.ESPERANDO_AUTORIZACION);
    const avanzoDespues = orden.estados.includes(ESTADO_ORDEN.EN_REPARACION);

    // aceptada = null mientras el cliente no responde; el CHECK de la tabla
    // exige forma_aceptacion en cuanto se marca aceptada.
    const aceptada = avanzoDespues ? true : esperoAutorizacion && orden.estadoFinal === ESTADO_ORDEN.ESPERANDO_AUTORIZACION
      ? null
      : orden.estadoFinal === ESTADO_ORDEN.CERRADA_SIN_REPARAR ? false : true;
    const forma = aceptada === true
      ? orden.nacioEnRuta ? FORMA_ACEPTACION.FIRMA_PRESENCIAL : azar.elegir([FORMA_ACEPTACION.LLAMADA, FORMA_ACEPTACION.MENSAJE, FORMA_ACEPTACION.CORREO])
      : null;

    filasCotizacion.push([
      azar.uuid(), orden.id, manoObra,
      orden.tipoGarantia === TIPO_GARANTIA.PARTICULAR ? totalRepuestos : 0,
      orden.cargoVisita, orden.tipoGarantia === TIPO_GARANTIA.PARTICULAR ? total : orden.cargoVisita,
      aceptada, forma, aceptada === true ? sumarHoras(momentoCotizacion, azar.decimal(1, 30, 1)) : null,
      orden.tecnico.idUsuario, momentoCotizacion,
    ]);
  }

  await copiarFilas(
    cliente,
    'diagnostico',
    ['id', 'id_orden', 'id_tecnico', 'id_plantilla', 'falla_real', 'componente',
      'momento_dispositivo', 'registrado_sin_conexion', 'creado_en'],
    filasDiagnostico as never,
  );
  await copiarFilas(
    cliente,
    'diagnostico_item',
    ['id', 'id_diagnostico', 'id_item_plantilla', 'etiqueta', 'tipo_campo', 'valor_numerico',
      'valor_texto', 'valor_booleano', 'unidad', 'rango_min', 'rango_max', 'fuera_de_rango'],
    filasItem as never,
  );
  await copiarFilas(
    cliente,
    'cotizacion',
    ['id', 'id_orden', 'mano_obra', 'total_repuestos', 'cargo_visita', 'total', 'aceptada',
      'forma_aceptacion', 'momento_aceptacion', 'registrado_por', 'creado_en'],
    filasCotizacion as never,
  );
}

/** Genera un valor para el item, fuera de rango una de cada cinco veces. */
function medirItem(
  contexto: ContextoSiembra,
  idDiagnostico: string,
  item: ReferenciaPlantilla['items'][number],
): unknown[] {
  const { azar } = contexto;
  const base = [azar.uuid(), idDiagnostico, item.id, item.etiqueta, item.tipoCampo];

  if (item.tipoCampo === TIPO_CAMPO_CHECKLIST.NUMERICO && item.rangoMin !== null && item.rangoMax !== null) {
    const amplitud = item.rangoMax - item.rangoMin;
    const fuera = azar.booleano(0.2);
    const valor = fuera
      ? azar.decimal(item.rangoMax + amplitud * 0.05, item.rangoMax + amplitud * 0.6, 3)
      : azar.decimal(item.rangoMin, item.rangoMax, 3);
    return [...base, valor, null, null, item.unidad, item.rangoMin, item.rangoMax, fuera];
  }

  if (item.tipoCampo === TIPO_CAMPO_CHECKLIST.BOOLEANO) {
    return [...base, null, null, azar.booleano(0.7), null, null, null, false];
  }

  if (item.tipoCampo === TIPO_CAMPO_CHECKLIST.SELECCION) {
    return [...base, null, azar.elegir(['si', 'no', 'parcial']), null, null, null, null, false];
  }

  return [...base, null, azar.elegir(FALLAS_REALES), null, null, null, null, false];
}
