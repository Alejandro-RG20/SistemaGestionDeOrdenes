/** Acceso a datos de articulos y sus coberturas. Uso interno del modulo. */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { FilaArticulo, FilaCobertura, FilaOrdenHistorial } from './dto.js';

const CAMPOS = `
  a.id, a.numero_serie, a.sin_serie_legible, a.modelo,
  a.id_marca, m.nombre AS marca,
  a.id_categoria, cat.nombre AS categoria,
  a.id_tienda_origen, t.nombre AS tienda_origen, t.pertenece_al_grupo AS tienda_pertenece_al_grupo,
  a.fecha_compra, a.factura_referencia,
  a.id_cliente, trim(cli.nombres || ' ' || coalesce(cli.apellidos, '')) AS cliente,
  a.activo`;

const DESDE = `
  FROM articulo a
  JOIN marca m ON m.id = a.id_marca
  JOIN categoria_articulo cat ON cat.id = a.id_categoria
  JOIN tienda_origen t ON t.id = a.id_tienda_origen
  JOIN cliente cli ON cli.id = a.id_cliente`;

export interface FiltroArticulos {
  readonly idCliente?: string | undefined;
  readonly numeroSerie?: string | undefined;
  readonly texto?: string | undefined;
  readonly soloActivos: boolean;
}

const DONDE = `
  WHERE ($1::uuid IS NULL OR a.id_cliente = $1)
    AND ($2::text IS NULL OR a.numero_serie = $2)
    AND ($3::text IS NULL OR
         lower(inmutable_unaccent(coalesce(a.modelo, '') || ' ' || m.nombre || ' ' || cat.nombre))
           LIKE '%' || lower(inmutable_unaccent($3)) || '%')
    AND ($4::boolean IS FALSE OR a.activo)`;

function parametros(filtro: FiltroArticulos): unknown[] {
  return [filtro.idCliente ?? null, filtro.numeroSerie ?? null, filtro.texto ?? null, filtro.soloActivos];
}

export async function contar(filtro: FiltroArticulos, ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total ${DESDE} ${DONDE}`, parametros(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listar(
  filtro: FiltroArticulos, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaArticulo[]> {
  const { rows } = await ejecutor.query<FilaArticulo>(
    `SELECT ${CAMPOS} ${DESDE} ${DONDE} ORDER BY m.nombre, a.modelo, a.id LIMIT $5 OFFSET $6`,
    [...parametros(filtro), limite, desplazamiento],
  );
  return rows;
}

export async function buscarPorId(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaArticulo | null> {
  const { rows } = await ejecutor.query<FilaArticulo>(`SELECT ${CAMPOS} ${DESDE} WHERE a.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function buscarPorSerie(
  numeroSerie: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaArticulo | null> {
  const { rows } = await ejecutor.query<FilaArticulo>(
    `SELECT ${CAMPOS} ${DESDE} WHERE a.numero_serie = $1`, [numeroSerie],
  );
  return rows[0] ?? null;
}

export async function listarCoberturas(
  idArticulo: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaCobertura[]> {
  const { rows } = await ejecutor.query<FilaCobertura>(
    `SELECT id, tipo, vigente_desde, vigente_hasta, documento_respaldo,
            id_cliente_contratante, activa
       FROM cobertura WHERE id_articulo = $1 ORDER BY vigente_hasta DESC`,
    [idArticulo],
  );
  return rows;
}

/**
 * RN-27: el historial es del articulo, no del dueno. Se devuelve entero
 * aunque el aparato haya cambiado de manos, y acotado a las ultimas
 * ordenes para no traer una lista sin fin.
 */
export async function listarHistorial(
  idArticulo: string, limite: number, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaOrdenHistorial[]> {
  const { rows } = await ejecutor.query<FilaOrdenHistorial>(
    `SELECT id, numero, estado::text AS estado, tipo_garantia, falla_reportada,
            fecha_recepcion, fecha_entrega
       FROM orden_servicio WHERE id_articulo = $1
      ORDER BY fecha_recepcion DESC LIMIT $2`,
    [idArticulo, limite],
  );
  return rows;
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: {
    idCliente: string; idMarca: string; idCategoria: string; idTiendaOrigen: string;
    modelo: string | null; numeroSerie: string | null; sinSerieLegible: boolean;
    fechaCompra: string | null; facturaReferencia: string | null; creadoPor: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO articulo
       (id_cliente, id_marca, id_categoria, id_tienda_origen, modelo, numero_serie,
        sin_serie_legible, fecha_compra, factura_referencia, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [datos.idCliente, datos.idMarca, datos.idCategoria, datos.idTiendaOrigen, datos.modelo,
      datos.numeroSerie, datos.sinSerieLegible, datos.fechaCompra, datos.facturaReferencia, datos.creadoPor],
  );
  return rows[0]!.id;
}

export async function actualizar(
  ejecutor: Ejecutor,
  idArticulo: string,
  cambios: {
    modelo?: string | null; numeroSerie?: string | null;
    sinSerieLegible?: boolean; facturaReferencia?: string | null;
  },
  modificadoPor: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE articulo SET
        modelo             = CASE WHEN $2::boolean THEN $3 ELSE modelo END,
        numero_serie       = CASE WHEN $4::boolean THEN $5 ELSE numero_serie END,
        sin_serie_legible  = coalesce($6, sin_serie_legible),
        factura_referencia = CASE WHEN $7::boolean THEN $8 ELSE factura_referencia END,
        modificado_en = now(), modificado_por = $9
      WHERE id = $1`,
    [idArticulo,
      cambios.modelo !== undefined, cambios.modelo ?? null,
      cambios.numeroSerie !== undefined, cambios.numeroSerie ?? null,
      cambios.sinSerieLegible ?? null,
      cambios.facturaReferencia !== undefined, cambios.facturaReferencia ?? null,
      modificadoPor],
  );
}

/** Datos de los que depende la cobertura. Cambiarlos exige jefatura. */
export async function actualizarDatosSensibles(
  ejecutor: Ejecutor,
  idArticulo: string,
  cambios: { fechaCompra?: string | null; idTiendaOrigen?: string; idMarca?: string },
  modificadoPor: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE articulo SET
        fecha_compra     = CASE WHEN $2::boolean THEN $3::date ELSE fecha_compra END,
        id_tienda_origen = coalesce($4, id_tienda_origen),
        id_marca         = coalesce($5, id_marca),
        modificado_en = now(), modificado_por = $6
      WHERE id = $1`,
    [idArticulo, cambios.fechaCompra !== undefined, cambios.fechaCompra ?? null,
      cambios.idTiendaOrigen ?? null, cambios.idMarca ?? null, modificadoPor],
  );
}

export async function cambiarDuenio(
  ejecutor: Ejecutor, idArticulo: string, idClienteNuevo: string, modificadoPor: string,
): Promise<void> {
  await ejecutor.query(
    'UPDATE articulo SET id_cliente = $2, modificado_en = now(), modificado_por = $3 WHERE id = $1',
    [idArticulo, idClienteNuevo, modificadoPor],
  );
}

export async function insertarCobertura(
  ejecutor: Ejecutor,
  datos: {
    idArticulo: string; tipo: string; vigenteDesde: string; vigenteHasta: string;
    documentoRespaldo: string | null; idClienteContratante: string | null; creadoPor: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO cobertura
       (id_articulo, tipo, vigente_desde, vigente_hasta, documento_respaldo,
        id_cliente_contratante, creado_por)
     VALUES ($1, $2::tipo_garantia, $3::date, $4::date, $5, $6, $7) RETURNING id`,
    [datos.idArticulo, datos.tipo, datos.vigenteDesde, datos.vigenteHasta,
      datos.documentoRespaldo, datos.idClienteContratante, datos.creadoPor],
  );
  return rows[0]!.id;
}

/** Comprueba de una sola vez que existan cliente, marca, categoria y tienda. */
export async function verificarReferencias(
  ejecutor: Ejecutor,
  referencias: { idCliente?: string; idMarca?: string; idCategoria?: string; idTiendaOrigen?: string },
): Promise<{ cliente: boolean; marca: boolean; categoria: boolean; tienda: boolean }> {
  const { rows } = await ejecutor.query<{
    cliente: boolean; marca: boolean; categoria: boolean; tienda: boolean;
  }>(
    `SELECT
       ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM cliente WHERE id = $1 AND activo)) AS cliente,
       ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM marca WHERE id = $2 AND activa)) AS marca,
       ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM categoria_articulo WHERE id = $3 AND activa)) AS categoria,
       ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM tienda_origen WHERE id = $4 AND activa)) AS tienda`,
    [referencias.idCliente ?? null, referencias.idMarca ?? null,
      referencias.idCategoria ?? null, referencias.idTiendaOrigen ?? null],
  );
  return rows[0]!;
}
