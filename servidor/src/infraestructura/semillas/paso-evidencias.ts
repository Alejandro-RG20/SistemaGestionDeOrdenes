/**
 * Paso 11: evidencias.
 *
 * La base guarda ruta, huella y metadatos; el binario nunca entra aqui
 * (AD-09). Una fraccion de las ordenes queda deliberadamente sin alguna
 * evidencia obligatoria: asi la vista v_evidencia_faltante y el bloqueo de
 * expedientes de la etapa 8 tienen casos reales que detectar.
 */
import type { PoolClient } from 'pg';
import { ESTADO_ORDEN, MOMENTO_EVIDENCIA, TIPO_EVIDENCIA } from '@servitotal/compartido';
import { createHash } from 'node:crypto';
import { copiarFilas } from './insercion.js';
import { sumarHoras } from './aleatorio.js';
import { REGLAS_EVIDENCIA } from './parametros-datos.js';
import type { ContextoSiembra } from './contexto.js';
import type { ResumenOrden } from './paso-ordenes.js';

/** Probabilidad de que una evidencia obligatoria si se haya cargado. */
const PROBABILIDAD_CARGADA = 0.93;

const TIPO_POR_PREFIJO: readonly (readonly [string, string])[] = [
  ['foto_', TIPO_EVIDENCIA.FOTO],
  ['firma_', TIPO_EVIDENCIA.FIRMA],
  ['medicion_', TIPO_EVIDENCIA.MEDICION],
];

function tipoDeEvidencia(clave: string): string {
  return TIPO_POR_PREFIJO.find(([prefijo]) => clave.startsWith(prefijo))?.[1] ?? TIPO_EVIDENCIA.DOCUMENTO;
}

/** Momentos del expediente que la orden ya recorrio. */
function momentosAlcanzados(orden: ResumenOrden): Set<string> {
  const alcanzados = new Set<string>([MOMENTO_EVIDENCIA.RECEPCION]);
  if (orden.estados.includes(ESTADO_ORDEN.ASIGNADA)) alcanzados.add(MOMENTO_EVIDENCIA.VALIDACION_GARANTIA);
  if (orden.estados.includes(ESTADO_ORDEN.EN_DIAGNOSTICO)) alcanzados.add(MOMENTO_EVIDENCIA.DIAGNOSTICO);
  if (orden.estados.includes(ESTADO_ORDEN.EN_REPARACION)) alcanzados.add(MOMENTO_EVIDENCIA.REPARACION);
  if (orden.estadoFinal === ESTADO_ORDEN.ENTREGADA) alcanzados.add(MOMENTO_EVIDENCIA.ENTREGA);
  return alcanzados;
}

export async function sembrarEvidencias(
  cliente: PoolClient,
  contexto: ContextoSiembra,
  ordenes: readonly ResumenOrden[],
): Promise<void> {
  const { azar } = contexto;
  const idPorCategoria = new Map(contexto.categorias.map((c) => [c.nombre, c.id]));

  // Reglas resueltas a id de categoria una sola vez, no dentro del bucle.
  const reglas = REGLAS_EVIDENCIA.map((regla) => ({
    ...regla,
    idCategoria: regla.categoria === null ? null : idPorCategoria.get(regla.categoria) ?? null,
  }));

  const filas: unknown[][] = [];

  for (const orden of ordenes) {
    const alcanzados = momentosAlcanzados(orden);
    const autor = orden.tecnico?.idUsuario ?? orden.idAgenteRegistro;

    for (const regla of reglas) {
      if (regla.tipo !== orden.tipoGarantia) continue;
      if (!alcanzados.has(regla.momento)) continue;
      if (regla.idCategoria !== null && regla.idCategoria !== orden.idCategoria) continue;
      if (regla.obligatoria && !azar.booleano(PROBABILIDAD_CARGADA)) continue;
      if (!regla.obligatoria && !azar.booleano(0.5)) continue;

      const momento = sumarHoras(orden.fechaRecepcion, azar.decimal(0, 48, 1));
      const ruta = `ordenes/${orden.id}/${regla.clave}-${azar.entero(1, 9)}.jpg`;
      filas.push([
        azar.uuid(), orden.id, tipoDeEvidencia(regla.clave), regla.clave, ruta,
        createHash('sha256').update(ruta).digest('hex'), autor,
        momento, momento,
        orden.nacioEnRuta ? azar.decimal(12.0, 12.2, 7) : null,
        orden.nacioEnRuta ? azar.decimal(-86.3, -86.1, 7) : null,
        azar.entero(80_000, 4_200_000), true,
      ]);
    }
  }

  await copiarFilas(
    cliente,
    'evidencia',
    ['id', 'id_orden', 'tipo', 'clave', 'ruta_archivo', 'huella_digital', 'id_autor',
      'momento_dispositivo', 'momento_servidor', 'latitud', 'longitud', 'bytes', 'sincronizada'],
    filas as never,
  );
}
