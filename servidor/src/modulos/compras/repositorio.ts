/** Consultas de proveedores y compras. */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

// ── proveedores ───────────────────────────────────────────────────────

export interface FilaProveedor {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly contacto: string | null;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly direccion: string | null;
  readonly atiende_garantias: boolean;
  readonly activo: boolean;
}

export async function listarProveedores(
  soloActivos: boolean, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaProveedor[]> {
  const { rows } = await ejecutor.query<FilaProveedor>(
    `SELECT id, codigo, nombre, contacto, telefono, correo, direccion,
            atiende_garantias, activo
       FROM proveedor
      WHERE ($1::boolean IS NOT TRUE OR activo)
      ORDER BY nombre`,
    [soloActivos],
  );
  return rows;
}

export async function buscarProveedor(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaProveedor | null> {
  const { rows } = await ejecutor.query<FilaProveedor>(
    `SELECT id, codigo, nombre, contacto, telefono, correo, direccion,
            atiende_garantias, activo FROM proveedor WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function insertarProveedor(
  ejecutor: Ejecutor,
  datos: {
    codigo: string; nombre: string; contacto: string | null; telefono: string | null;
    correo: string | null; direccion: string | null; atiendeGarantias: boolean; idUsuario: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO proveedor
       (codigo, nombre, contacto, telefono, correo, direccion, atiende_garantias, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [datos.codigo, datos.nombre, datos.contacto, datos.telefono, datos.correo,
      datos.direccion, datos.atiendeGarantias, datos.idUsuario],
  );
  return rows[0]!.id;
}

export async function actualizarProveedor(
  ejecutor: Ejecutor,
  id: string,
  datos: {
    nombre: string; contacto: string | null; telefono: string | null;
    correo: string | null; direccion: string | null; atiendeGarantias: boolean; idUsuario: string;
  },
): Promise<void> {
  await ejecutor.query(
    `UPDATE proveedor
        SET nombre = $2, contacto = $3, telefono = $4, correo = $5, direccion = $6,
            atiende_garantias = $7, modificado_en = now(), modificado_por = $8
      WHERE id = $1`,
    [id, datos.nombre, datos.contacto, datos.telefono, datos.correo,
      datos.direccion, datos.atiendeGarantias, datos.idUsuario],
  );
}

export async function cambiarActivoProveedor(
  ejecutor: Ejecutor, id: string, activo: boolean, idUsuario: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE proveedor SET activo = $2, modificado_en = now(), modificado_por = $3 WHERE id = $1`,
    [id, activo, idUsuario],
  );
}

// ── compras ───────────────────────────────────────────────────────────

export interface FilaCompra {
  readonly id: string;
  readonly numero: string;
  readonly id_proveedor: string;
  readonly proveedor: string;
  readonly estado: string;
  readonly fecha_pedido: Date;
  readonly fecha_estimada: Date | null;
  readonly total: string;
  readonly observacion: string | null;
  readonly motivo_cancelacion: string | null;
  readonly lineas: number;
  readonly pedido: string;
  readonly recibido: string;
}

const SELECCION_COMPRA = `
  SELECT c.id, c.numero::text AS numero, c.id_proveedor, p.nombre AS proveedor,
         c.estado::text AS estado, c.fecha_pedido, c.fecha_estimada, c.total,
         c.observacion, c.motivo_cancelacion,
         coalesce(d.lineas, 0) AS lineas,
         coalesce(d.pedido, 0)::text AS pedido,
         coalesce(d.recibido, 0)::text AS recibido
    FROM compra c
    JOIN proveedor p ON p.id = c.id_proveedor
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS lineas,
             sum(cantidad) AS pedido,
             sum(cantidad_recibida) AS recibido
        FROM compra_detalle WHERE id_compra = c.id
    ) d ON true`;

export interface FiltroCompras {
  readonly estado?: string | undefined;
  readonly idProveedor?: string | undefined;
}

export async function listarCompras(
  filtro: FiltroCompras, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaCompra[]> {
  const { rows } = await ejecutor.query<FilaCompra>(
    `${SELECCION_COMPRA}
      WHERE ($1::text IS NULL OR c.estado::text = $1)
        AND ($2::uuid IS NULL OR c.id_proveedor = $2)
      ORDER BY c.fecha_pedido DESC, c.numero DESC
      LIMIT $3 OFFSET $4`,
    [filtro.estado ?? null, filtro.idProveedor ?? null, limite, desplazamiento],
  );
  return rows;
}

export async function contarCompras(
  filtro: FiltroCompras, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM compra c
      WHERE ($1::text IS NULL OR c.estado::text = $1)
        AND ($2::uuid IS NULL OR c.id_proveedor = $2)`,
    [filtro.estado ?? null, filtro.idProveedor ?? null],
  );
  return Number(rows[0]!.total);
}

export async function buscarCompra(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaCompra | null> {
  const { rows } = await ejecutor.query<FilaCompra>(`${SELECCION_COMPRA} WHERE c.id = $1`, [id]);
  return rows[0] ?? null;
}

export interface FilaLinea {
  readonly id: string;
  readonly id_repuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly cantidad_recibida: number;
  readonly precio_unitario: string;
}

export async function lineasDeCompra(
  idCompra: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaLinea[]> {
  const { rows } = await ejecutor.query<FilaLinea>(
    `SELECT d.id, d.id_repuesto, r.codigo, r.descripcion,
            d.cantidad, d.cantidad_recibida, d.precio_unitario
       FROM compra_detalle d JOIN repuesto r ON r.id = d.id_repuesto
      WHERE d.id_compra = $1
      ORDER BY r.codigo`,
    [idCompra],
  );
  return rows;
}

export async function insertarCompra(
  ejecutor: Ejecutor,
  datos: {
    idProveedor: string; fechaEstimada: string | null; observacion: string | null;
    total: number; idUsuario: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO compra (id_proveedor, fecha_estimada, observacion, total, creado_por)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [datos.idProveedor, datos.fechaEstimada, datos.observacion, datos.total, datos.idUsuario],
  );
  return rows[0]!.id;
}

export async function insertarLinea(
  ejecutor: Ejecutor,
  datos: { idCompra: string; idRepuesto: string; cantidad: number; precioUnitario: number },
): Promise<void> {
  await ejecutor.query(
    `INSERT INTO compra_detalle (id_compra, id_repuesto, cantidad, precio_unitario)
     VALUES ($1, $2, $3, $4)`,
    [datos.idCompra, datos.idRepuesto, datos.cantidad, datos.precioUnitario],
  );
}

/** Bloquea la compra para que dos recepciones simultaneas no se pisen. */
export async function bloquearCompra(
  ejecutor: Ejecutor, id: string,
): Promise<{ estado: string } | null> {
  const { rows } = await ejecutor.query<{ estado: string }>(
    'SELECT estado::text AS estado FROM compra WHERE id = $1 FOR UPDATE',
    [id],
  );
  return rows[0] ?? null;
}

export async function cambiarEstadoCompra(
  ejecutor: Ejecutor, id: string, estado: string, motivo: string | null, idUsuario: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE compra
        SET estado = $2::estado_compra, motivo_cancelacion = coalesce($3, motivo_cancelacion),
            modificado_en = now(), modificado_por = $4
      WHERE id = $1`,
    [id, estado, motivo, idUsuario],
  );
}

export async function sumarRecibido(
  ejecutor: Ejecutor, idLinea: string, cantidad: number,
): Promise<void> {
  await ejecutor.query(
    'UPDATE compra_detalle SET cantidad_recibida = cantidad_recibida + $2 WHERE id = $1',
    [idLinea, cantidad],
  );
}
