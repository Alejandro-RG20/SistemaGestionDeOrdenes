/**
 * Las cifras del tablero (pliego §42), contadas sobre la base.
 *
 * UNA SOLA CONSULTA PARA LAS DOCE
 *
 * Doce `SELECT count(*)` son doce viajes a la base cada vez que alguien abre
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
  readonly ordenes_abiertas: number;
  readonly ordenes_atrasadas: number;
  readonly en_reparacion: number;
  readonly esperando_repuesto: number;
  readonly visitas_de_hoy: number;
  readonly tecnicos_activos: number;
  readonly stock_bajo: number;
  readonly solicitudes_abiertas: number;
  readonly compras_pendientes: number;
  readonly cobros_pendientes: number;
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
       (SELECT count(*) FROM orden_servicio o
         WHERE ${ABIERTAS} AND ${CERCO})::int AS ordenes_abiertas,

       (SELECT count(*) FROM orden_servicio o
         WHERE ${ABIERTAS} AND o.plazo_vence_en < now() AND ${CERCO})::int AS ordenes_atrasadas,

       (SELECT count(*) FROM orden_servicio o
         WHERE o.estado = 'en_reparacion' AND ${CERCO})::int AS en_reparacion,

       (SELECT count(*) FROM orden_servicio o
         WHERE o.estado = 'esperando_repuesto' AND ${CERCO})::int AS esperando_repuesto,

       -- Las visitas de hoy: lo que hay que salir a hacer, no el historico.
       (SELECT count(*) FROM visita v
          JOIN orden_servicio o ON o.id = v.id_orden
         WHERE v.vigente AND v.fecha_programada = current_date
           AND ${CERCO})::int AS visitas_de_hoy,

       (SELECT count(*) FROM tecnico t WHERE t.activo)::int AS tecnicos_activos,

       -- Solo las bodegas que surten: la de piezas sustituidas guarda lo que
       -- se saco de los articulos y no se repone.
       (SELECT count(*) FROM v_repuesto_bajo_minimo)::int AS stock_bajo,

       (SELECT count(*) FROM solicitud_repuesto s
          JOIN orden_servicio o ON o.id = s.id_orden
         WHERE s.estado NOT IN ('recibida', 'anulada')
           AND ${CERCO})::int AS solicitudes_abiertas,

       -- Pendiente = pedida y todavia no completa. 'recibida_parcial' cuenta:
       -- parte de la mercaderia sigue sin llegar y alguien tiene que
       -- perseguirla.
       (SELECT count(*) FROM compra c
         WHERE c.estado IN ('borrador', 'enviada', 'confirmada', 'recibida_parcial')
        )::int AS compras_pendientes,

       (SELECT count(*) FROM expediente_cobro e
         WHERE e.estado NOT IN ('pagado', 'cerrado'))::int AS cobros_pendientes,

       (SELECT count(*) FROM excepcion_sincronizacion x
         WHERE x.estado = 'pendiente')::int AS excepciones_pendientes`,
    [cerco.idTienda, cerco.idTecnico, cerco.idUsuario],
  );
  return rows[0]!;
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
