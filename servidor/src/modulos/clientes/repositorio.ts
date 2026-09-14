/**
 * Acceso a datos de clientes. Uso interno del modulo.
 *
 * La busqueda va contra nombre_busqueda, la columna generada sin acentos ni
 * mayusculas, que tiene indice trigram: por eso una busqueda incremental
 * sobre miles de clientes responde de inmediato (RNF-01).
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { FilaCliente, FilaDireccion, FilaTelefono } from './dto.js';

/**
 * El telefono vigente y la direccion principal se resuelven con
 * subconsultas laterales: una sola pasada, sin traerse el historico entero
 * ni consultar por cada fila del listado.
 */
const CAMPOS = `
  c.id, c.nombres, c.apellidos, c.identificacion, c.correo, c.activo,
  c.id_cliente_principal, c.creado_en,
  tel.numero AS telefono_vigente,
  dir.detalle AS direccion_principal`;

const LATERALES = `
  LEFT JOIN LATERAL (
    SELECT t.numero FROM cliente_telefono t
     WHERE t.id_cliente = c.id AND t.vigente ORDER BY t.desde DESC LIMIT 1
  ) tel ON true
  LEFT JOIN LATERAL (
    SELECT d.detalle FROM cliente_direccion d
     WHERE d.id_cliente = c.id AND d.vigente ORDER BY d.principal DESC, d.desde DESC LIMIT 1
  ) dir ON true`;

export interface FiltroClientes {
  readonly texto?: string | undefined;
  readonly telefono?: string | undefined;
  readonly soloActivos: boolean;
}

/**
 * $1 texto de busqueda, $2 telefono exacto, $3 solo activos.
 * La comparacion usa la misma normalizacion que la columna generada.
 */
const DONDE = `
  WHERE ($1::text IS NULL OR c.nombre_busqueda LIKE '%' || lower(inmutable_unaccent($1)) || '%')
    AND ($2::text IS NULL OR EXISTS (
          SELECT 1 FROM cliente_telefono t WHERE t.id_cliente = c.id AND t.numero = $2))
    AND ($3::boolean IS FALSE OR c.activo)`;

function parametros(filtro: FiltroClientes): unknown[] {
  return [filtro.texto ?? null, filtro.telefono ?? null, filtro.soloActivos];
}

export async function contar(filtro: FiltroClientes, ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM cliente c ${DONDE}`, parametros(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listar(
  filtro: FiltroClientes, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaCliente[]> {
  const { rows } = await ejecutor.query<FilaCliente>(
    `SELECT ${CAMPOS} FROM cliente c ${LATERALES} ${DONDE}
      ORDER BY c.nombres, c.apellidos, c.id LIMIT $4 OFFSET $5`,
    [...parametros(filtro), limite, desplazamiento],
  );
  return rows;
}

export async function buscarPorId(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaCliente | null> {
  const { rows } = await ejecutor.query<FilaCliente>(
    `SELECT ${CAMPOS} FROM cliente c ${LATERALES} WHERE c.id = $1`, [id],
  );
  return rows[0] ?? null;
}

export async function listarTelefonos(
  idCliente: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaTelefono[]> {
  const { rows } = await ejecutor.query<FilaTelefono>(
    `SELECT id, id_cliente, numero, tipo, vigente, desde, hasta FROM cliente_telefono
      WHERE id_cliente = $1 ORDER BY vigente DESC, desde DESC`, [idCliente],
  );
  return rows;
}

export async function listarDirecciones(
  idCliente: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaDireccion[]> {
  const { rows } = await ejecutor.query<FilaDireccion>(
    `SELECT d.id, d.id_cliente, d.id_zona, z.nombre AS zona, d.detalle, d.referencia,
            d.principal, d.vigente, d.desde, d.hasta
       FROM cliente_direccion d LEFT JOIN zona z ON z.id = d.id_zona
      WHERE d.id_cliente = $1 ORDER BY d.vigente DESC, d.principal DESC, d.desde DESC`,
    [idCliente],
  );
  return rows;
}

/** Cuenta articulos y ordenes del cliente en una sola consulta. */
export async function contarRelacionados(
  idCliente: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ articulos: number; ordenes: number }> {
  const { rows } = await ejecutor.query<{ articulos: string; ordenes: string }>(
    `SELECT (SELECT count(*) FROM articulo WHERE id_cliente = $1)::text AS articulos,
            (SELECT count(*) FROM orden_servicio WHERE id_cliente = $1)::text AS ordenes`,
    [idCliente],
  );
  return { articulos: Number(rows[0]?.articulos ?? 0), ordenes: Number(rows[0]?.ordenes ?? 0) };
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: {
    idCentro: string; nombres: string; apellidos: string | null;
    identificacion: string | null; correo: string | null; creadoPor: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO cliente (id_centro, nombres, apellidos, identificacion, correo, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [datos.idCentro, datos.nombres, datos.apellidos, datos.identificacion, datos.correo, datos.creadoPor],
  );
  return rows[0]!.id;
}

export async function actualizar(
  ejecutor: Ejecutor,
  idCliente: string,
  cambios: { nombres?: string; apellidos?: string | null; identificacion?: string | null; correo?: string | null },
  modificadoPor: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE cliente SET
        nombres        = coalesce($2, nombres),
        apellidos      = CASE WHEN $3::boolean THEN $4 ELSE apellidos END,
        identificacion = CASE WHEN $5::boolean THEN $6 ELSE identificacion END,
        correo         = CASE WHEN $7::boolean THEN $8 ELSE correo END,
        modificado_en  = now(), modificado_por = $9
      WHERE id = $1`,
    [idCliente, cambios.nombres ?? null,
      cambios.apellidos !== undefined, cambios.apellidos ?? null,
      cambios.identificacion !== undefined, cambios.identificacion ?? null,
      cambios.correo !== undefined, cambios.correo ?? null,
      modificadoPor],
  );
}

export async function cerrarTelefonoVigente(ejecutor: Ejecutor, idCliente: string): Promise<void> {
  await ejecutor.query(
    'UPDATE cliente_telefono SET vigente = false, hasta = current_date WHERE id_cliente = $1 AND vigente',
    [idCliente],
  );
}

export async function insertarTelefono(
  ejecutor: Ejecutor, idCliente: string, numero: string, tipo: string | null, vigente: boolean,
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO cliente_telefono (id_cliente, numero, tipo, vigente, hasta)
     VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NULL ELSE current_date END) RETURNING id`,
    [idCliente, numero, tipo, vigente],
  );
  return rows[0]!.id;
}

export async function quitarPrincipalDeDirecciones(ejecutor: Ejecutor, idCliente: string): Promise<void> {
  await ejecutor.query(
    'UPDATE cliente_direccion SET principal = false WHERE id_cliente = $1 AND principal',
    [idCliente],
  );
}

export async function insertarDireccion(
  ejecutor: Ejecutor,
  datos: { idCliente: string; idZona: string | null; detalle: string; referencia: string | null; principal: boolean },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO cliente_direccion (id_cliente, id_zona, detalle, referencia, principal, vigente)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [datos.idCliente, datos.idZona, datos.detalle, datos.referencia, datos.principal],
  );
  return rows[0]!.id;
}

export async function existeZona(idZona: string, ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<boolean> {
  const { rows } = await ejecutor.query('SELECT 1 FROM zona WHERE id = $1 AND activa', [idZona]);
  return rows.length > 0;
}

/**
 * Fusion de duplicados (RF-75).
 *
 * Traslada articulos y ordenes al cliente principal y deja el duplicado
 * desactivado, apuntando a el. Nada se elimina: la ficha absorbida queda
 * para que quien busque el registro viejo llegue al bueno.
 *
 * Los datos que la orden congelo al crearse —telefono de contacto,
 * direccion de servicio, zona, cargo por visita— NO se tocan: la fusion
 * corrige a quien pertenece la orden, no reescribe lo que paso.
 */
export async function trasladarArticulos(
  ejecutor: Ejecutor, idAbsorbido: string, idPrincipal: string, modificadoPor: string,
): Promise<number> {
  const resultado = await ejecutor.query(
    `UPDATE articulo SET id_cliente = $2, modificado_en = now(), modificado_por = $3
      WHERE id_cliente = $1`,
    [idAbsorbido, idPrincipal, modificadoPor],
  );
  return resultado.rowCount ?? 0;
}

export async function trasladarOrdenes(
  ejecutor: Ejecutor, idAbsorbido: string, idPrincipal: string, modificadoPor: string,
): Promise<number> {
  const resultado = await ejecutor.query(
    `UPDATE orden_servicio SET id_cliente = $2, modificado_en = now(), modificado_por = $3
      WHERE id_cliente = $1`,
    [idAbsorbido, idPrincipal, modificadoPor],
  );
  return resultado.rowCount ?? 0;
}

export async function trasladarCoberturas(
  ejecutor: Ejecutor, idAbsorbido: string, idPrincipal: string,
): Promise<number> {
  const resultado = await ejecutor.query(
    'UPDATE cobertura SET id_cliente_contratante = $2 WHERE id_cliente_contratante = $1',
    [idAbsorbido, idPrincipal],
  );
  return resultado.rowCount ?? 0;
}

export async function marcarComoAbsorbido(
  ejecutor: Ejecutor, idAbsorbido: string, idPrincipal: string, modificadoPor: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE cliente SET id_cliente_principal = $2, activo = false,
            modificado_en = now(), modificado_por = $3
      WHERE id = $1`,
    [idAbsorbido, idPrincipal, modificadoPor],
  );
}
