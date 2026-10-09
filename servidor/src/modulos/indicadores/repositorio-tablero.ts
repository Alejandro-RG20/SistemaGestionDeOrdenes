/**
 * Las cifras del tablero (pliego §42), contadas sobre la base.
 *
 * UNA SOLA CONSULTA PARA TODAS LAS CIFRAS
 *
 * Veinte `SELECT count(*)` son veinte viajes a la base cada vez que alguien abre
 * el inicio, y el inicio es la pantalla que todos abren primero. Van en una
 * sola consulta con subconsultas escalares: PostgreSQL las resuelve de una
 * pasada y el tablero carga en un viaje.
 *
 * NINGUNA CIFRA SE ESTIMA
 *
 * El pliego lo pide explicito y la razon es practica: la jefatura mira estos
 * numeros para decidir si manda gente a trabajar el sabado. Cada uno es un
 * `count` sobre filas reales, y donde no hay dato, la cifra es cero, no un
 * relleno.
 *
 * EL ALCANCE POR DATOS TAMBIEN LLEGA AQUI
 *
 * Las cifras de ordenes se cercan por tienda y por tecnico con los mismos dos
 * parametros que el resto del sistema. Un tablero que le muestre al usuario de
 * Masaya el conteo de todo el pais es la misma fuga que la lista de ordenes,
 * solo que agregada.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaTablero {
  readonly registradas_30d: number;
  readonly sin_asignar: number;
  readonly en_diagnostico: number;
  readonly en_reparacion: number;
  readonly esperando_repuesto: number;
  readonly esperando_autorizacion: number;
  readonly por_entregar: number;
  readonly cerradas_30d: number;
  readonly ordenes_abiertas: number;
  readonly ordenes_atrasadas: number;
  readonly dias_promedio_reparacion: number | null;
  readonly visitas_de_hoy: number;
  readonly tecnicos_activos: number;
  readonly unidades_disponibles: number;
  readonly stock_bajo: number;
  readonly solicitudes_abiertas: number;
  readonly unidades_reservadas: number;
  readonly unidades_entregadas_30d: number;
  readonly unidades_consumidas_30d: number;
  readonly ajustes_30d: number;
  readonly compras_pendientes: number;
  readonly excepciones_pendientes: number;
}

/** Cerco por datos: los mismos dos de la lista de ordenes. */
export interface CercoDelTablero {
  readonly idTienda: string | null;
  readonly idTecnico: string | null;
  readonly idUsuario: string | null;
}

/**
 * El WHERE del cerco, reutilizado en cada subconsulta de ordenes.
 *
 * `$1` = tienda, `$2` = tecnico, `$3` = usuario que la levanto. Escrito una
 * vez porque repetirlo en seis subconsultas es garantizar que una se quede
 * sin cercar.
 */
const CERCO = `($1::uuid IS NULL OR o.id_tienda = $1)
               AND ($2::uuid IS NULL
                    OR o.id_tecnico = $2
                    OR ($3::uuid IS NOT NULL AND o.creado_por = $3))`;

const ABIERTAS = `o.estado NOT IN ('entregada', 'cerrada_sin_reparar', 'anulada')`;

export async function cifras(
  cerco: CercoDelTablero, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaTablero> {
  const { rows } = await ejecutor.query<FilaTablero>(
    `SELECT
       -- ── ordenes ──
       (SELECT count(*) FROM orden_servicio o
         WHERE o.fecha_recepcion >= now() - interval '30 days' AND ${CERCO})::int AS registradas_30d,

       -- Pendiente de asignacion: abierta y sin tecnico. Es lo que el gestor
       -- tiene que repartir.
       (SELECT count(*) FROM orden_servicio o
         WHERE ${ABIERTAS} AND o.id_tecnico IS NULL AND ${CERCO})::int AS sin_asignar,

       (SELECT count(*) FROM orden_servicio o
         WHERE o.estado = 'en_diagnostico' AND ${CERCO})::int AS en_diagnostico,

       (SELECT count(*) FROM orden_servicio o
         WHERE o.estado = 'en_reparacion' AND ${CERCO})::int AS en_reparacion,

       (SELECT count(*) FROM orden_servicio o
         WHERE o.estado = 'esperando_repuesto' AND ${CERCO})::int AS esperando_repuesto,

       (SELECT count(*) FROM orden_servicio o
         WHERE o.estado = 'esperando_autorizacion' AND ${CERCO})::int AS esperando_autorizacion,

       -- Terminadas y validadas o por validar: el articulo espera al cliente.
       (SELECT count(*) FROM orden_servicio o
         WHERE o.estado = 'finalizada' AND ${CERCO})::int AS por_entregar,

       (SELECT count(*) FROM orden_servicio o
         WHERE o.estado IN ('entregada', 'cerrada_sin_reparar')
           AND o.fecha_estado_desde >= now() - interval '30 days' AND ${CERCO})::int AS cerradas_30d,

       (SELECT count(*) FROM orden_servicio o
         WHERE ${ABIERTAS} AND ${CERCO})::int AS ordenes_abiertas,

       (SELECT count(*) FROM orden_servicio o
         WHERE ${ABIERTAS} AND o.plazo_vence_en < now() AND ${CERCO})::int AS ordenes_atrasadas,

       -- De la recepcion a la entrega, en dias, sobre lo entregado en los
       -- ultimos 90. Sin entregas, nulo: un promedio de nada no es cero.
       (SELECT round((avg(EXTRACT(EPOCH FROM (o.fecha_entrega - o.fecha_recepcion))) / 86400)::numeric, 1)
          FROM orden_servicio o
         WHERE o.estado = 'entregada' AND o.fecha_entrega IS NOT NULL
           AND o.fecha_entrega >= now() - interval '90 days' AND ${CERCO})::float8
         AS dias_promedio_reparacion,

       -- ── campo ──
       (SELECT count(*) FROM visita v
          JOIN orden_servicio o ON o.id = v.id_orden
         WHERE v.vigente AND v.fecha_programada = current_date
           AND ${CERCO})::int AS visitas_de_hoy,

       (SELECT count(*) FROM tecnico t WHERE t.activo)::int AS tecnicos_activos,

       -- ── inventario ──
       (SELECT coalesce(sum(greatest(d.disponible, 0)), 0) FROM v_disponibilidad_repuesto d)::int
         AS unidades_disponibles,

       -- Solo las bodegas que surten: la de piezas sustituidas guarda lo que
       -- se saco de los articulos y no se repone.
       (SELECT count(*) FROM v_repuesto_bajo_minimo)::int AS stock_bajo,

       -- Abierta = todavia no llego a manos del tecnico.
       (SELECT count(*) FROM solicitud_repuesto s
          JOIN orden_servicio o ON o.id = s.id_orden
         WHERE s.estado IN ('solicitada', 'en_revision', 'aprobada', 'preparada', 'rechazada')
           AND ${ABIERTAS} AND ${CERCO})::int AS solicitudes_abiertas,

       (SELECT coalesce(sum(d.reservado), 0) FROM v_disponibilidad_repuesto d)::int
         AS unidades_reservadas,

       (SELECT coalesce(sum(m.cantidad), 0) FROM movimiento_repuesto m
         WHERE m.tipo = 'despacho_a_movil' AND m.id_orden IS NOT NULL
           AND m.creado_en >= now() - interval '30 days')::int AS unidades_entregadas_30d,

       (SELECT coalesce(sum(m.cantidad), 0) FROM movimiento_repuesto m
         WHERE m.tipo = 'consumo' AND m.creado_en >= now() - interval '30 days')::int
         AS unidades_consumidas_30d,

       -- Diferencias encontradas al contar: cada una es un ajuste justificado.
       (SELECT count(*) FROM movimiento_repuesto m
         WHERE m.tipo = 'ajuste' AND m.creado_en >= now() - interval '30 days')::int AS ajustes_30d,

       -- Pendiente = pedida y todavia no completa. 'recibida_parcial' cuenta:
       -- parte de la mercaderia sigue sin llegar y alguien tiene que
       -- perseguirla.
       (SELECT count(*) FROM compra c
         WHERE c.estado IN ('borrador', 'enviada', 'confirmada', 'recibida_parcial')
        )::int AS compras_pendientes,

       (SELECT count(*) FROM excepcion_sincronizacion x
         WHERE x.estado = 'pendiente')::int AS excepciones_pendientes`,
    [cerco.idTienda, cerco.idTecnico, cerco.idUsuario],
  );
  return rows[0]!;
}

export interface FilaCarga {
  readonly id_tecnico: string;
  readonly tecnico: string;
  readonly tipo: string;
  readonly abiertas: number;
  readonly vencidas: number;
  readonly en_reparacion: number;
  readonly esperando_repuesto: number;
}

/** Ordenes abiertas por tecnico. El tecnico cercado solo se ve a si mismo. */
export async function cargaPorTecnico(
  cerco: CercoDelTablero, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaCarga[]> {
  const { rows } = await ejecutor.query<FilaCarga>(
    `SELECT t.id AS id_tecnico, trim(u.nombres) AS tecnico, t.tipo,
            count(o.id)::int AS abiertas,
            count(o.id) FILTER (WHERE o.plazo_vence_en < now())::int AS vencidas,
            count(o.id) FILTER (WHERE o.estado = 'en_reparacion')::int AS en_reparacion,
            count(o.id) FILTER (WHERE o.estado = 'esperando_repuesto')::int AS esperando_repuesto
       FROM tecnico t
       JOIN usuario u ON u.id = t.id_usuario
       LEFT JOIN orden_servicio o
              ON o.id_tecnico = t.id AND ${ABIERTAS}
             AND ($1::uuid IS NULL OR o.id_tienda = $1)
      WHERE t.activo AND ($2::uuid IS NULL OR t.id = $2)
      GROUP BY t.id, u.nombres, t.tipo
      ORDER BY count(o.id) DESC, u.nombres`,
    [cerco.idTienda, cerco.idTecnico],
  );
  return rows;
}

export interface FilaConsumido {
  readonly id_repuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly piezas: number;
}

export async function masConsumidos(
  limite: number, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaConsumido[]> {
  const { rows } = await ejecutor.query<FilaConsumido>(
    `SELECT r.id AS id_repuesto, r.codigo, r.descripcion, sum(m.cantidad)::int AS piezas
       FROM movimiento_repuesto m JOIN repuesto r ON r.id = m.id_repuesto
      WHERE m.tipo = 'consumo' AND m.creado_en >= now() - interval '90 days'
      GROUP BY r.id, r.codigo, r.descripcion
      ORDER BY sum(m.cantidad) DESC, r.codigo
      LIMIT $1`,
    [limite],
  );
  return rows;
}

export interface FilaMovimientoReciente {
  readonly id: string;
  readonly creado_en: Date;
  readonly tipo: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly id_orden: string | null;
  readonly codigo_orden: string | null;
  readonly responsable: string;
}

export async function movimientosRecientes(
  limite: number, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaMovimientoReciente[]> {
  const { rows } = await ejecutor.query<FilaMovimientoReciente>(
    `SELECT m.id, m.creado_en, m.tipo::text AS tipo, r.codigo, r.descripcion, m.cantidad,
            m.id_orden, o.codigo AS codigo_orden, trim(u.nombres) AS responsable
       FROM movimiento_repuesto m
       JOIN repuesto r ON r.id = m.id_repuesto
       JOIN usuario u ON u.id = m.id_responsable
       LEFT JOIN orden_servicio o ON o.id = m.id_orden
      ORDER BY m.creado_en DESC
      LIMIT $1`,
    [limite],
  );
  return rows;
}

export interface FilaActividad {
  readonly momento: Date;
  readonly quien: string | null;
  readonly accion: string;
  readonly detalle: string;
  readonly id_orden: string | null;
}

/**
 * La actividad reciente, de la bitacora de auditoria.
 *
 * Sale de `bitacora` y no de una tabla de «actividad» aparte: la bitacora ya
 * registra toda operacion que cambia algo, y una segunda tabla con lo mismo
 * es un segundo lugar que se desincroniza.
 */
export async function actividad(
  cerco: CercoDelTablero, limite: number, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaActividad[]> {
  const { rows } = await ejecutor.query<FilaActividad>(
    `SELECT b.momento, u.nombres AS quien, b.accion,
            b.tabla || coalesce(' ' || o.codigo, '')
              || coalesce(' · ' || b.campo, '') AS detalle,
            o.id AS id_orden
       FROM bitacora b
            LEFT JOIN usuario u ON u.id = b.id_usuario
            -- La bitacora guarda tabla + id_registro, no una referencia
            -- tipada. Se une solo cuando la fila anotada ES una orden.
            LEFT JOIN orden_servicio o
                   ON b.tabla = 'orden_servicio' AND o.id = b.id_registro
      -- Para quien NO esta cercado, toda la bitacora. Para quien si, solo las
      -- lineas de SUS ordenes: una fila de bitacora que no sea de una orden
      -- —un usuario, un repuesto, una regla— no es de su incumbencia, y
      -- mostrarsela es a la vez ruido y una fuga pequeña de lo que pasa en el
      -- centro. El cerco se reconoce por tener tienda o tecnico.
      WHERE CASE
              WHEN $1::uuid IS NULL AND $2::uuid IS NULL THEN true
              ELSE o.id IS NOT NULL AND (${CERCO})
            END
      ORDER BY b.momento DESC
      LIMIT $4`,
    [cerco.idTienda, cerco.idTecnico, cerco.idUsuario, limite],
  );
  return rows;
}
