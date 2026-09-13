/**
 * Escritura de la bitacora de auditoria (tabla `bitacora`, RF-85).
 *
 * No confundir con comun/bitacora.ts, que es el registro de actividad del
 * proceso. Esta deja constancia de quien cambio que en los datos, con
 * motivo cuando el campo es sensible (RN-24).
 *
 * Se escribe siempre con el mismo ejecutor de la operacion que la origina,
 * para que el asiento y el cambio caigan o se confirmen juntos.
 */
import type { AccionBitacora } from '@servitotal/compartido';
import type { Ejecutor } from './transacciones.js';

export interface AsientoAuditoria {
  readonly tabla: string;
  readonly idRegistro: string;
  readonly accion: AccionBitacora;
  readonly campo?: string | null;
  readonly valorAnterior?: string | null;
  readonly valorNuevo?: string | null;
  readonly motivo?: string | null;
  readonly idUsuario: string;
}

const SQL_INSERTAR = `
  INSERT INTO bitacora (tabla, id_registro, accion, campo, valor_anterior, valor_nuevo, motivo, id_usuario)
  SELECT * FROM unnest(
    $1::text[], $2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::uuid[]
  )`;

/**
 * Registra uno o varios asientos en una sola sentencia. Varios asientos por
 * operacion son lo normal —cambiar tres campos deja tres filas— y no es
 * excusa para consultar dentro de un bucle.
 */
export async function auditar(
  ejecutor: Ejecutor,
  asientos: readonly AsientoAuditoria[],
): Promise<void> {
  if (asientos.length === 0) return;
  await ejecutor.query(SQL_INSERTAR, [
    asientos.map((a) => a.tabla),
    asientos.map((a) => a.idRegistro),
    asientos.map((a) => a.accion),
    asientos.map((a) => a.campo ?? null),
    asientos.map((a) => a.valorAnterior ?? null),
    asientos.map((a) => a.valorNuevo ?? null),
    asientos.map((a) => a.motivo ?? null),
    asientos.map((a) => a.idUsuario),
  ]);
}
