/** Consultas de la entrega del articulo. */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaEntrega {
  readonly id: string;
  readonly id_orden: string;
  readonly recibido_por: string;
  readonly documento_receptor: string | null;
  readonly es_el_cliente: boolean;
  readonly observacion: string | null;
  readonly responsable: string;
  readonly momento: Date;
}

export async function deOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaEntrega | null> {
  const { rows } = await ejecutor.query<FilaEntrega>(
    `SELECT e.id, e.id_orden, e.recibido_por, e.documento_receptor, e.es_el_cliente,
            e.observacion, u.nombres AS responsable, e.momento
       FROM entrega e JOIN usuario u ON u.id = e.id_responsable
      WHERE e.id_orden = $1`,
    [idOrden],
  );
  return rows[0] ?? null;
}

export interface FilaEstadoDeOrden {
  readonly id: string;
  readonly codigo: string;
  readonly estado: string;
  readonly tipo_garantia: string;
  readonly total: string;
  readonly cotizacion_aceptada: boolean | null;
  readonly tiene_cotizacion: boolean;
}

/**
 * Todo lo que decide si el articulo puede salir, en una sola consulta.
 *
 * Se resuelve junto y no en cinco viajes porque el mostrador tiene al
 * cliente delante: la pantalla tiene que contestar de una vez que falta,
 * no ir descubriendolo de a poco.
 */
export async function estadoParaEntrega(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaEstadoDeOrden | null> {
  const { rows } = await ejecutor.query<FilaEstadoDeOrden>(
    `SELECT o.id, o.codigo, o.estado::text AS estado, o.tipo_garantia::text AS tipo_garantia,
            o.total,
            c.aceptada AS cotizacion_aceptada,
            (c.id IS NOT NULL) AS tiene_cotizacion
       FROM orden_servicio o
       LEFT JOIN LATERAL (
         SELECT id, aceptada FROM cotizacion
          WHERE id_orden = o.id ORDER BY creado_en DESC LIMIT 1
       ) c ON true
      WHERE o.id = $1`,
    [idOrden],
  );
  return rows[0] ?? null;
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; recibidoPor: string; documentoReceptor: string | null;
    esElCliente: boolean; observacion: string | null; idResponsable: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO entrega
       (id_orden, recibido_por, documento_receptor, es_el_cliente, observacion, id_responsable)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [datos.idOrden, datos.recibidoPor, datos.documentoReceptor, datos.esElCliente,
      datos.observacion, datos.idResponsable],
  );
  return rows[0]!.id;
}
