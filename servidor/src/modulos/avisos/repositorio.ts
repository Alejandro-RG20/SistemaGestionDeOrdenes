/**
 * Consultas de la bandeja de avisos.
 *
 * Cada una responde "que hay pendiente de este tipo", y cuando corresponde,
 * acotado a la persona: las ordenes vencidas de la bandeja son LAS SUYAS,
 * no las del taller entero. Una bandeja que le muestra a cada quien los
 * problemas de los demas se vuelve ruido y se deja de mirar, que es
 * exactamente lo que no puede pasar cuando es el unico canal de aviso.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

/** Cuantos renglones se muestran por grupo antes de "ver todo". */
export const MUESTRA = 5;

export interface FilaOrdenPendiente {
  readonly id: string;
  readonly numero: string;
  readonly estado: string;
  readonly cliente: string;
  readonly articulo: string;
  readonly plazo_vence_en: Date | null;
  readonly horas_de_atraso: number | null;
}

/**
 * Ordenes vencidas o en ventana de alerta.
 *
 * `idResponsable` acota a las que esa persona tiene a su cargo; `idTecnico`
 * a las asignadas a ese tecnico. Sin ninguno de los dos —jefaturas— se ven
 * todas, que es su trabajo.
 */
export async function ordenesEnRiesgo(
  opciones: { vencidas: boolean; idResponsable?: string | undefined; idTecnico?: string | undefined },
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ total: number; muestra: FilaOrdenPendiente[] }> {
  const filtros: string[] = [];
  const valores: unknown[] = [];

  if (opciones.idResponsable !== undefined) {
    valores.push(opciones.idResponsable);
    const posResponsable = valores.length;
    if (opciones.idTecnico !== undefined) {
      valores.push(opciones.idTecnico);
      filtros.push(`(o.id_responsable_actual = $${posResponsable} OR o.id_tecnico = $${valores.length})`);
    } else {
      filtros.push(`o.id_responsable_actual = $${posResponsable}`);
    }
  }

  // Vencida: el plazo ya paso. En alerta: entra en la ventana de aviso de
  // su regla de plazo y todavia no vence.
  filtros.push(opciones.vencidas
    ? 'o.plazo_vence_en < now()'
    : `o.plazo_vence_en >= now()
       AND o.plazo_vence_en <= now() + make_interval(hours => coalesce(plazo.horas_alerta, 0))`);

  const donde = `
    FROM orden_servicio o
    JOIN cliente c  ON c.id = o.id_cliente
    JOIN articulo a ON a.id = o.id_articulo
    JOIN marca m    ON m.id = a.id_marca
    LEFT JOIN LATERAL (
      SELECT rp.horas_alerta FROM regla_plazo rp
       WHERE rp.activa AND rp.estado = o.estado
         AND (rp.tipo = o.tipo_garantia OR rp.tipo IS NULL)
       ORDER BY rp.tipo NULLS LAST LIMIT 1
    ) plazo ON true
    WHERE o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')
      AND o.plazo_vence_en IS NOT NULL
      AND ${filtros.join(' AND ')}`;

  const conteo = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total ${donde}`, valores,
  );
  const { rows } = await ejecutor.query<FilaOrdenPendiente>(
    `SELECT o.id, o.numero, o.estado::text AS estado,
            trim(c.nombres || ' ' || coalesce(c.apellidos, '')) AS cliente,
            trim(m.nombre || ' ' || coalesce(a.modelo, '')) AS articulo,
            o.plazo_vence_en,
            EXTRACT(EPOCH FROM (now() - o.plazo_vence_en))/3600 AS horas_de_atraso
     ${donde}
     ORDER BY o.plazo_vence_en
     LIMIT $${valores.length + 1}`,
    [...valores, MUESTRA],
  );

  return { total: Number(conteo.rows[0]?.total ?? 0), muestra: rows };
}

export interface FilaExcepcionPendiente {
  readonly id: string;
  readonly numero_orden: string | null;
  readonly tecnico: string | null;
  readonly motivo: string;
  readonly creado_en: Date;
  readonly dias: number;
}

export async function excepcionesPendientes(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ total: number; muestra: FilaExcepcionPendiente[] }> {
  const conteo = await ejecutor.query<{ total: string }>(
    "SELECT count(*)::text AS total FROM excepcion_sincronizacion WHERE estado = 'pendiente'",
  );
  const { rows } = await ejecutor.query<FilaExcepcionPendiente>(
    `SELECT e.id, o.numero AS numero_orden,
            trim(u.nombres) AS tecnico, e.motivo, e.creado_en,
            EXTRACT(EPOCH FROM (now() - e.creado_en))/86400 AS dias
       FROM excepcion_sincronizacion e
       LEFT JOIN orden_servicio o ON o.id = e.id_orden
       LEFT JOIN tecnico t ON t.id = e.id_tecnico
       LEFT JOIN usuario u ON u.id = t.id_usuario
      WHERE e.estado = 'pendiente'
      ORDER BY e.creado_en
      LIMIT $1`,
    [MUESTRA],
  );
  return { total: Number(conteo.rows[0]?.total ?? 0), muestra: rows };
}

export interface FilaExpedientePendiente {
  readonly id: string;
  readonly numero_orden: string;
  readonly marca: string | null;
  readonly monto_reclamado: string;
  readonly dias: number | null;
}

/** Expedientes que no pueden salir porque a su orden le falta evidencia. */
export async function expedientesBloqueados(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ total: number; muestra: FilaExpedientePendiente[] }> {
  const conteo = await ejecutor.query<{ total: string }>(
    "SELECT count(*)::text AS total FROM expediente_cobro WHERE estado = 'bloqueado_por_evidencia'",
  );
  const { rows } = await ejecutor.query<FilaExpedientePendiente>(
    `SELECT e.id, o.numero AS numero_orden, m.nombre AS marca, e.monto_reclamado,
            EXTRACT(EPOCH FROM (now() - e.creado_en))/86400 AS dias
       FROM expediente_cobro e
       JOIN orden_servicio o ON o.id = e.id_orden
       LEFT JOIN marca m ON m.id = e.id_marca
      WHERE e.estado = 'bloqueado_por_evidencia'
      ORDER BY e.monto_reclamado DESC
      LIMIT $1`,
    [MUESTRA],
  );
  return { total: Number(conteo.rows[0]?.total ?? 0), muestra: rows };
}

/** Enviados hace mas de N dias sin que el tercero conteste. */
export async function expedientesSinRespuesta(
  dias: number, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ total: number; muestra: FilaExpedientePendiente[] }> {
  const donde = `FROM expediente_cobro e
       JOIN orden_servicio o ON o.id = e.id_orden
       LEFT JOIN marca m ON m.id = e.id_marca
      WHERE e.estado = 'enviado' AND e.fecha_envio IS NOT NULL
        AND e.fecha_envio <= current_date - $1::int`;
  const conteo = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total ${donde}`, [dias],
  );
  const { rows } = await ejecutor.query<FilaExpedientePendiente>(
    `SELECT e.id, o.numero AS numero_orden, m.nombre AS marca, e.monto_reclamado,
            (current_date - e.fecha_envio)::float8 AS dias
     ${donde}
     ORDER BY e.fecha_envio
     LIMIT $2`,
    [dias, MUESTRA],
  );
  return { total: Number(conteo.rows[0]?.total ?? 0), muestra: rows };
}

export interface FilaOrdenSinExpediente {
  readonly id: string;
  readonly numero: string;
  readonly cliente: string;
  readonly tipo_garantia: string;
  readonly dias: number;
}

/**
 * Ordenes entregadas y cobrables a las que nadie les abrio expediente.
 *
 * Es plata que el taller gasto y todavia no reclamo. Cuanto mas vieja, mas
 * dificil conseguir lo que el fabricante pida.
 */
export async function ordenesCobrablesSinExpediente(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ total: number; muestra: FilaOrdenSinExpediente[] }> {
  const donde = `FROM orden_servicio o
       JOIN cliente c ON c.id = o.id_cliente
      WHERE o.estado = 'entregada'
        AND o.tipo_garantia IN ('proveedor','adicional')
        AND NOT EXISTS (SELECT 1 FROM expediente_cobro e WHERE e.id_orden = o.id)`;
  const conteo = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total ${donde}`,
  );
  const { rows } = await ejecutor.query<FilaOrdenSinExpediente>(
    `SELECT o.id, o.numero,
            trim(c.nombres || ' ' || coalesce(c.apellidos, '')) AS cliente,
            o.tipo_garantia::text AS tipo_garantia,
            EXTRACT(EPOCH FROM (now() - coalesce(o.fecha_entrega, o.fecha_estado_desde)))/86400 AS dias
     ${donde}
     ORDER BY coalesce(o.fecha_entrega, o.fecha_estado_desde)
     LIMIT $1`,
    [MUESTRA],
  );
  return { total: Number(conteo.rows[0]?.total ?? 0), muestra: rows };
}

export interface FilaRepuestoBajoMinimo {
  readonly id: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly bodega: string;
  readonly cantidad: number;
  readonly stock_minimo: number;
}

export async function repuestosBajoMinimo(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ total: number; muestra: FilaRepuestoBajoMinimo[] }> {
  // Solo la bodega central: el minimo de una bodega movil lo repone el
  // despacho diario y avisar por cada una seria ruido constante.
  const donde = `FROM v_repuesto_bajo_minimo v
       JOIN bodega b ON b.id = v.id_bodega
      WHERE b.tipo = 'central' AND b.activa`;
  const conteo = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total ${donde}`,
  );
  const { rows } = await ejecutor.query<FilaRepuestoBajoMinimo>(
    `SELECT v.id, v.codigo, v.descripcion, b.nombre AS bodega, v.cantidad, v.stock_minimo
     ${donde}
     ORDER BY (v.cantidad - v.stock_minimo), v.codigo
     LIMIT $1`,
    [MUESTRA],
  );
  return { total: Number(conteo.rows[0]?.total ?? 0), muestra: rows };
}

export interface FilaSolicitudPendiente {
  readonly id: string;
  readonly numero_orden: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly dias: number;
}

/** Repuestos pedidos que todavia no entran, con la orden detenida esperando. */
export async function solicitudesPendientes(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ total: number; muestra: FilaSolicitudPendiente[] }> {
  const donde = `FROM solicitud_repuesto s
       JOIN orden_servicio o ON o.id = s.id_orden
       JOIN repuesto r ON r.id = s.id_repuesto
      WHERE s.fecha_ingreso IS NULL`;
  const conteo = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total ${donde}`,
  );
  const { rows } = await ejecutor.query<FilaSolicitudPendiente>(
    `SELECT s.id, o.numero AS numero_orden, r.codigo, r.descripcion, s.cantidad,
            EXTRACT(EPOCH FROM (now() - s.fecha_solicitud))/86400 AS dias
     ${donde}
     ORDER BY s.fecha_solicitud
     LIMIT $1`,
    [MUESTRA],
  );
  return { total: Number(conteo.rows[0]?.total ?? 0), muestra: rows };
}

export async function tecnicoDeUsuario(
  idUsuario: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<string | null> {
  const { rows } = await ejecutor.query<{ id: string }>(
    'SELECT id FROM tecnico WHERE id_usuario = $1 AND activo', [idUsuario],
  );
  return rows[0]?.id ?? null;
}
