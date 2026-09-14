/**
 * Acceso a datos de reglas de cobertura, polizas y reevaluacion de ordenes.
 * Uso interno del modulo de garantias.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { FilaArticuloCobertura, FilaPoliza, FilaRegla } from './dto.js';

const CAMPOS_REGLA = `
  r.id, r.id_marca, m.nombre AS marca, r.id_categoria, c.nombre AS categoria,
  r.meses_cobertura, r.exige_tienda_grupo, r.fallas_excluidas, r.version,
  r.vigente_desde, r.vigente_hasta, r.activa`;

const DESDE_REGLA = `
  FROM regla_cobertura r
  LEFT JOIN marca m ON m.id = r.id_marca
  LEFT JOIN categoria_articulo c ON c.id = r.id_categoria`;

export async function contarReglas(
  soloVigentes: boolean, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM regla_cobertura r WHERE ($1::boolean IS FALSE OR r.activa)`,
    [soloVigentes],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listarReglas(
  soloVigentes: boolean, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaRegla[]> {
  const { rows } = await ejecutor.query<FilaRegla>(
    `SELECT ${CAMPOS_REGLA} ${DESDE_REGLA}
      WHERE ($1::boolean IS FALSE OR r.activa)
      ORDER BY m.nombre NULLS FIRST, c.nombre NULLS FIRST, r.version DESC
      LIMIT $2 OFFSET $3`,
    [soloVigentes, limite, desplazamiento],
  );
  return rows;
}

/**
 * Todas las reglas vigentes de una vez. El motor elige la mas especifica en
 * memoria: es una regla de negocio y no baja a la base (regla 4).
 */
export async function listarReglasVigentes(ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<FilaRegla[]> {
  const { rows } = await ejecutor.query<FilaRegla>(
    `SELECT ${CAMPOS_REGLA} ${DESDE_REGLA}
      WHERE r.activa
        AND r.vigente_desde <= current_date
        AND (r.vigente_hasta IS NULL OR r.vigente_hasta >= current_date)
      ORDER BY r.version DESC`,
  );
  return rows;
}

export async function buscarReglaPorId(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaRegla | null> {
  const { rows } = await ejecutor.query<FilaRegla>(`SELECT ${CAMPOS_REGLA} ${DESDE_REGLA} WHERE r.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function buscarArticuloParaCobertura(
  idArticulo: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaArticuloCobertura | null> {
  const { rows } = await ejecutor.query<FilaArticuloCobertura>(
    `SELECT a.id, a.id_cliente, a.id_marca, a.id_categoria, a.id_tienda_origen,
            t.pertenece_al_grupo AS tienda_pertenece_al_grupo, a.fecha_compra
       FROM articulo a JOIN tienda_origen t ON t.id = a.id_tienda_origen
      WHERE a.id = $1`,
    [idArticulo],
  );
  return rows[0] ?? null;
}

export async function listarPolizas(
  idArticulo: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaPoliza[]> {
  const { rows } = await ejecutor.query<FilaPoliza>(
    `SELECT id, tipo, vigente_desde, vigente_hasta, id_cliente_contratante, activa
       FROM cobertura WHERE id_articulo = $1 ORDER BY vigente_hasta DESC`,
    [idArticulo],
  );
  return rows;
}

/** Cierra la version anterior de una regla al abrir la siguiente (RF-86). */
export async function cerrarVersionesAnteriores(
  ejecutor: Ejecutor, idMarca: string | null, idCategoria: string | null,
): Promise<number> {
  const { rows } = await ejecutor.query<{ version: number }>(
    `UPDATE regla_cobertura
        SET activa = false, vigente_hasta = current_date
      WHERE activa
        AND id_marca IS NOT DISTINCT FROM $1
        AND id_categoria IS NOT DISTINCT FROM $2
      RETURNING version`,
    [idMarca, idCategoria],
  );
  return rows.reduce((mayor, fila) => Math.max(mayor, fila.version), 0);
}

export async function insertarRegla(
  ejecutor: Ejecutor,
  datos: {
    idMarca: string | null; idCategoria: string | null; mesesCobertura: number;
    exigeTiendaGrupo: boolean; fallasExcluidas: readonly string[]; version: number; creadoPor: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO regla_cobertura
       (id_marca, id_categoria, meses_cobertura, exige_tienda_grupo, fallas_excluidas,
        version, vigente_desde, activa, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, current_date, true, $7) RETURNING id`,
    [datos.idMarca, datos.idCategoria, datos.mesesCobertura, datos.exigeTiendaGrupo,
      [...datos.fallasExcluidas], datos.version, datos.creadoPor],
  );
  return rows[0]!.id;
}

export interface FilaOrdenAbierta {
  readonly id: string;
  readonly numero: number;
  readonly id_cliente: string;
  readonly tipo_garantia: string;
  readonly estado: string;
}

/**
 * Ordenes del articulo que siguen abiertas. Solo estas se reevaluan: una
 * orden entregada o cerrada no cambia de garantia hacia atras.
 */
export async function listarOrdenesAbiertasDeArticulo(
  idArticulo: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaOrdenAbierta[]> {
  const { rows } = await ejecutor.query<FilaOrdenAbierta>(
    `SELECT id, numero, id_cliente, tipo_garantia::text AS tipo_garantia, estado::text AS estado
       FROM orden_servicio
      WHERE id_articulo = $1
        AND estado NOT IN ('entregada', 'cerrada_sin_reparar', 'anulada')
      ORDER BY numero`,
    [idArticulo],
  );
  return rows;
}

export interface CambioDeGarantia {
  readonly idOrden: string;
  readonly estado: string;
  readonly tipoGarantia: string;
  readonly idReglaCobertura: string;
  readonly observacion: string;
}

/**
 * Aplica todos los cambios de garantia en UNA sentencia.
 *
 * Reevaluar suele tocar una o dos ordenes, pero escribir dentro del bucle
 * seria un UPDATE por orden: el problema no se nota en desarrollo y si en
 * produccion, cuando una correccion de marca alcanza a docenas de ordenes.
 */
export async function aplicarCambiosDeGarantia(
  ejecutor: Ejecutor,
  cambios: readonly CambioDeGarantia[],
  modificadoPor: string,
): Promise<void> {
  if (cambios.length === 0) return;

  await ejecutor.query(
    `UPDATE orden_servicio o
        SET tipo_garantia = c.tipo::tipo_garantia,
            id_regla_cobertura = c.id_regla,
            modificado_en = now(), modificado_por = $4
       FROM unnest($1::uuid[], $2::text[], $3::uuid[]) AS c(id_orden, tipo, id_regla)
      WHERE o.id = c.id_orden`,
    [
      cambios.map((cambio) => cambio.idOrden),
      cambios.map((cambio) => cambio.tipoGarantia),
      cambios.map((cambio) => cambio.idReglaCobertura),
      modificadoPor,
    ],
  );
}

/** La reevaluacion queda en la bitacora inmutable de la orden (RN-18). */
export async function anotarEventosDeReevaluacion(
  ejecutor: Ejecutor,
  cambios: readonly CambioDeGarantia[],
  idResponsable: string,
): Promise<void> {
  if (cambios.length === 0) return;

  await ejecutor.query(
    `INSERT INTO evento_orden (id_orden, estado_anterior, estado_nuevo, id_responsable, observacion)
     SELECT c.id_orden, c.estado::estado_orden, c.estado::estado_orden, $4, c.observacion
       FROM unnest($1::uuid[], $2::text[], $3::text[]) AS c(id_orden, estado, observacion)`,
    [
      cambios.map((cambio) => cambio.idOrden),
      cambios.map((cambio) => cambio.estado),
      cambios.map((cambio) => cambio.observacion),
      idResponsable,
    ],
  );
}
