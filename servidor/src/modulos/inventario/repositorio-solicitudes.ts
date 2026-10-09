/**
 * Acceso a datos del recorrido de la solicitud de repuesto.
 *
 * Aparte de `repositorio-movimientos`, que ya tenia el alta y el listado:
 * el recorrido del §26 agrego nueve columnas y cuatro consultas, y meterlas
 * en un archivo que ya hacia otras dos cosas lo volvia ilegible.
 */
import type { EstadoSolicitud } from '@servitotal/compartido';
import { ESTADO_SOLICITUD } from '@servitotal/compartido';
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaSolicitudDetallada {
  readonly id: string;
  readonly id_orden: string;
  readonly codigo_orden: string | null;
  readonly numero_orden: number;
  readonly id_repuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly via: string;
  readonly estado: EstadoSolicitud;
  readonly motivo: string | null;
  readonly liberada: boolean;
  readonly fecha_solicitud: Date;
  readonly fecha_estimada: Date | null;
  readonly fecha_ingreso: Date | null;
  readonly solicitada_por: string | null;
  readonly revisada_por: string | null;
  readonly revisada_en: Date | null;
  readonly preparada_por: string | null;
  readonly preparada_en: Date | null;
  readonly entregada_por: string | null;
  readonly entregada_en: Date | null;
  readonly recibida_en: Date | null;
  readonly tecnico: string | null;
  /** Lo que hay sin reservar en bodega para este repuesto, ahora. */
  readonly disponible: number;
}

const CAMPOS = `
  s.id, s.id_orden, o.codigo AS codigo_orden, o.numero AS numero_orden,
  s.id_repuesto, r.codigo, r.descripcion, s.cantidad, s.via::text AS via,
  s.estado::text AS estado, s.motivo, s.liberada,
  s.fecha_solicitud, s.fecha_estimada, s.fecha_ingreso,
  quien.nombres AS solicitada_por,
  revisor.nombres AS revisada_por, s.revisada_en,
  preparador.nombres AS preparada_por, s.preparada_en,
  entregador.nombres AS entregada_por, s.entregada_en,
  s.recibida_en, ut.nombres AS tecnico, coalesce(dp.disponible, 0) AS disponible`;

const DESDE = `
  FROM solicitud_repuesto s
  JOIN orden_servicio o ON o.id = s.id_orden
  JOIN repuesto r ON r.id = s.id_repuesto
  LEFT JOIN usuario quien ON quien.id = s.creado_por
  LEFT JOIN usuario revisor ON revisor.id = s.revisada_por
  LEFT JOIN usuario preparador ON preparador.id = s.preparada_por
  LEFT JOIN usuario entregador ON entregador.id = s.entregada_por
  LEFT JOIN tecnico t ON t.id = o.id_tecnico
  LEFT JOIN usuario ut ON ut.id = t.id_usuario
  LEFT JOIN v_disponibilidad_repuesto dp ON dp.id_repuesto = s.id_repuesto`;

export async function buscarDetallada(
  idSolicitud: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaSolicitudDetallada | null> {
  const { rows } = await ejecutor.query<FilaSolicitudDetallada>(
    `SELECT ${CAMPOS} ${DESDE} WHERE s.id = $1`, [idSolicitud],
  );
  return rows[0] ?? null;
}

/**
 * Bloquea la solicitud antes de moverla.
 *
 * Sin el bloqueo, dos bodegueros que aprieten «entregar» a la vez descuentan
 * la existencia dos veces por una sola pieza.
 */
export async function bloquear(
  ejecutor: Ejecutor, idSolicitud: string,
): Promise<{ estado: EstadoSolicitud; id_repuesto: string; id_orden: string; cantidad: number } | null> {
  const { rows } = await ejecutor.query<{
    estado: EstadoSolicitud; id_repuesto: string; id_orden: string; cantidad: number;
  }>(
    `SELECT estado::text AS estado, id_repuesto, id_orden, cantidad
       FROM solicitud_repuesto WHERE id = $1 FOR UPDATE`,
    [idSolicitud],
  );
  return rows[0] ?? null;
}

/** Si la solicitud pertenece a una orden asignada a ese usuario. */
export async function esDelTecnico(
  ejecutor: Ejecutor, idSolicitud: string, idUsuario: string,
): Promise<boolean> {
  const { rows } = await ejecutor.query<{ suya: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM solicitud_repuesto s
         JOIN orden_servicio o ON o.id = s.id_orden
         JOIN tecnico t ON t.id = o.id_tecnico
        WHERE s.id = $1 AND t.id_usuario = $2
     ) AS suya`,
    [idSolicitud, idUsuario],
  );
  return rows[0]?.suya ?? false;
}

/**
 * Escribe el paso y, con el, quien lo dio y cuando.
 *
 * Las columnas de autoria se llenan segun el paso y no todas de golpe: saber
 * que Juan aprobo y Maria entrego es justamente lo que hace auditable el
 * tramite.
 *
 * `liberada` se toca en UN solo caso: al recibir. Es el punto donde las dos
 * columnas tienen que coincidir —si el tecnico tiene la pieza en la mano, la
 * orden dejo de esperarla— y dejarlas discrepar ahi significaba una orden
 * detenida para siempre en 'esperando_repuesto' por un repuesto que ya
 * estaba instalandose. En los demas pasos no se toca: la entrada del
 * repuesto es la que la pone, y eso contesta otra pregunta (migracion 0022).
 */
export async function registrarPaso(
  ejecutor: Ejecutor,
  datos: {
    idSolicitud: string; hacia: EstadoSolicitud; motivo: string | null; actor: string;
  },
): Promise<void> {
  const esRevision = datos.hacia === ESTADO_SOLICITUD.EN_REVISION
    || datos.hacia === ESTADO_SOLICITUD.APROBADA
    || datos.hacia === ESTADO_SOLICITUD.RECHAZADA;

  await ejecutor.query(
    `UPDATE solicitud_repuesto
        SET estado = $2::estado_solicitud_repuesto,
            motivo = coalesce($3, motivo),
            revisada_por  = CASE WHEN $4 THEN $5::uuid ELSE revisada_por END,
            revisada_en   = CASE WHEN $4 THEN now() ELSE revisada_en END,
            preparada_por = CASE WHEN $2 = 'preparada' THEN $5::uuid ELSE preparada_por END,
            preparada_en  = CASE WHEN $2 = 'preparada' THEN now() ELSE preparada_en END,
            entregada_por = CASE WHEN $2 = 'entregada' THEN $5::uuid ELSE entregada_por END,
            entregada_en  = CASE WHEN $2 = 'entregada' THEN now() ELSE entregada_en END,
            recibida_en   = CASE WHEN $2 = 'recibida'  THEN now() ELSE recibida_en END,
            liberada      = CASE WHEN $2 = 'recibida'  THEN true  ELSE liberada    END
      WHERE id = $1`,
    [datos.idSolicitud, datos.hacia, datos.motivo, esRevision, datos.actor],
  );
}

export interface FiltroRecorrido {
  readonly estado?: string | undefined;
  readonly idOrden?: string | undefined;
  /** Solo las solicitudes de las ordenes de ese tecnico. */
  readonly idTecnico?: string | undefined;
  readonly soloAbiertas: boolean;
}

const DONDE = `
  WHERE ($1::text IS NULL OR s.estado::text = $1)
    AND ($2::uuid IS NULL OR s.id_orden = $2)
    AND ($3::uuid IS NULL OR o.id_tecnico = $3)
    AND ($4::boolean IS FALSE OR s.estado NOT IN ('recibida', 'anulada'))`;

function parametros(filtro: FiltroRecorrido): unknown[] {
  return [
    filtro.estado ?? null, filtro.idOrden ?? null,
    filtro.idTecnico ?? null, filtro.soloAbiertas,
  ];
}

export async function contar(
  filtro: FiltroRecorrido, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total ${DESDE} ${DONDE}`, parametros(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listar(
  filtro: FiltroRecorrido, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaSolicitudDetallada[]> {
  const { rows } = await ejecutor.query<FilaSolicitudDetallada>(
    `SELECT ${CAMPOS} ${DESDE} ${DONDE}
      ORDER BY s.fecha_solicitud, s.id LIMIT $5 OFFSET $6`,
    [...parametros(filtro), limite, desplazamiento],
  );
  return rows;
}
