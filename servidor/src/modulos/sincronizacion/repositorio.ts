/**
 * Acceso a datos de sincronizacion: la clave de idempotencia y la bandeja
 * de excepciones. Uso interno del modulo.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaOperacion {
  readonly id_operacion: string;
  readonly tipo_operacion: string;
  readonly id_entidad: string | null;
  readonly resultado: Record<string, unknown>;
  readonly aceptada: boolean;
  readonly procesada_en: Date;
}

/**
 * Busca la operacion por su clave de idempotencia. Si aparece, ya llego
 * antes y lo unico correcto es devolver el resultado de entonces.
 */
export async function buscarOperacion(
  idOperacion: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaOperacion | null> {
  const { rows } = await ejecutor.query<FilaOperacion>(
    `SELECT id_operacion, tipo_operacion, id_entidad, resultado, aceptada, procesada_en
       FROM operacion_sincronizada WHERE id_operacion = $1`,
    [idOperacion],
  );
  return rows[0] ?? null;
}

export async function anotarOperacion(
  ejecutor: Ejecutor,
  datos: {
    idOperacion: string; idDispositivo: string; tipoOperacion: string;
    idEntidad: string | null; resultado: Record<string, unknown>;
    aceptada: boolean; momentoDispositivo: Date;
  },
): Promise<void> {
  await ejecutor.query(
    `INSERT INTO operacion_sincronizada
       (id_operacion, id_dispositivo, tipo_operacion, id_entidad, resultado, aceptada, momento_dispositivo)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [datos.idOperacion, datos.idDispositivo, datos.tipoOperacion, datos.idEntidad,
      JSON.stringify(datos.resultado), datos.aceptada, datos.momentoDispositivo],
  );
}

/**
 * Completa el resultado guardado con el identificador de la excepcion.
 *
 * Hace falta un segundo paso porque excepcion_sincronizacion tiene clave
 * foranea hacia operacion_sincronizada: la operacion se anota primero, la
 * excepcion despues, y solo entonces se puede enlazar en sentido contrario.
 * Todo dentro de la misma transaccion.
 */
export async function enlazarExcepcion(
  ejecutor: Ejecutor, idOperacion: string, idExcepcion: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE operacion_sincronizada
        SET resultado = resultado || jsonb_build_object('idExcepcion', $2::text)
      WHERE id_operacion = $1`,
    [idOperacion, idExcepcion],
  );
}

/** RF-64 · RN-19: la carga original se conserva integra, sin recortar nada. */
export async function anotarExcepcion(
  ejecutor: Ejecutor,
  datos: {
    idOperacion: string | null; idOrden: string | null; idTecnico: string | null;
    motivo: string; cargaOriginal: unknown;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO excepcion_sincronizacion (id_operacion, id_orden, id_tecnico, motivo, carga_original)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
    [datos.idOperacion, datos.idOrden, datos.idTecnico, datos.motivo,
      JSON.stringify(datos.cargaOriginal)],
  );
  return rows[0]!.id;
}

export interface FilaExcepcion {
  readonly id: string;
  readonly id_operacion: string | null;
  readonly id_orden: string | null;
  readonly numero_orden: number | null;
  readonly id_tecnico: string | null;
  readonly tecnico: string | null;
  readonly motivo: string;
  readonly carga_original: Record<string, unknown>;
  readonly estado: string;
  readonly resuelta_por: string | null;
  readonly resuelta_en: Date | null;
  readonly resolucion: string | null;
  readonly creado_en: Date;
}

const CAMPOS_EXCEPCION = `
  e.id, e.id_operacion, e.id_orden, o.numero AS numero_orden, e.id_tecnico,
  ut.nombres AS tecnico, e.motivo, e.carga_original, e.estado,
  ur.nombres AS resuelta_por, e.resuelta_en, e.resolucion, e.creado_en`;

const DESDE_EXCEPCION = `
  FROM excepcion_sincronizacion e
  LEFT JOIN orden_servicio o ON o.id = e.id_orden
  LEFT JOIN tecnico t ON t.id = e.id_tecnico
  LEFT JOIN usuario ut ON ut.id = t.id_usuario
  LEFT JOIN usuario ur ON ur.id = e.resuelta_por`;

export interface FiltroExcepciones {
  readonly estado?: string | undefined;
  readonly idOrden?: string | undefined;
  readonly idTecnico?: string | undefined;
}

const DONDE_EXCEPCION = `
  WHERE ($1::text IS NULL OR e.estado::text = $1)
    AND ($2::uuid IS NULL OR e.id_orden = $2)
    AND ($3::uuid IS NULL OR e.id_tecnico = $3)`;

function parametros(filtro: FiltroExcepciones): unknown[] {
  return [filtro.estado ?? null, filtro.idOrden ?? null, filtro.idTecnico ?? null];
}

export async function contarExcepciones(
  filtro: FiltroExcepciones, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM excepcion_sincronizacion e ${DONDE_EXCEPCION}`,
    parametros(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listarExcepciones(
  filtro: FiltroExcepciones, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaExcepcion[]> {
  const { rows } = await ejecutor.query<FilaExcepcion>(
    `SELECT ${CAMPOS_EXCEPCION} ${DESDE_EXCEPCION} ${DONDE_EXCEPCION}
      ORDER BY (e.estado = 'pendiente') DESC, e.creado_en DESC LIMIT $4 OFFSET $5`,
    [...parametros(filtro), limite, desplazamiento],
  );
  return rows;
}

export async function buscarExcepcion(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaExcepcion | null> {
  const { rows } = await ejecutor.query<FilaExcepcion>(
    `SELECT ${CAMPOS_EXCEPCION} ${DESDE_EXCEPCION} WHERE e.id = $1`, [id],
  );
  return rows[0] ?? null;
}

export async function cerrarExcepcion(
  ejecutor: Ejecutor,
  datos: { id: string; estado: string; resolucion: string; resueltaPor: string },
): Promise<void> {
  await ejecutor.query(
    `UPDATE excepcion_sincronizacion
        SET estado = $2::estado_excepcion, resolucion = $3, resuelta_por = $4, resuelta_en = now()
      WHERE id = $1`,
    [datos.id, datos.estado, datos.resolucion, datos.resueltaPor],
  );
}

/** Tecnico del usuario que sincroniza, para poder atribuir la excepcion. */
export async function tecnicoDeUsuario(
  idUsuario: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<string | null> {
  const { rows } = await ejecutor.query<{ id: string }>(
    'SELECT id FROM tecnico WHERE id_usuario = $1 AND activo', [idUsuario],
  );
  return rows[0]?.id ?? null;
}
