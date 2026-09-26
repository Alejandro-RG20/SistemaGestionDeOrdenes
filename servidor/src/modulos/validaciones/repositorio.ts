/** Consultas de la validacion tecnica. */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaValidacion {
  readonly id: string;
  readonly id_orden: string;
  readonly resultado: string;
  readonly observacion: string;
  readonly reviso_diagnostico: boolean;
  readonly reviso_reparacion: boolean;
  readonly reviso_evidencias: boolean;
  readonly reviso_repuestos: boolean;
  readonly validador: string;
  readonly momento: Date;
}

export async function listarDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaValidacion[]> {
  const { rows } = await ejecutor.query<FilaValidacion>(
    `SELECT v.id, v.id_orden, v.resultado::text AS resultado, v.observacion,
            v.reviso_diagnostico, v.reviso_reparacion, v.reviso_evidencias, v.reviso_repuestos,
            u.nombres AS validador, v.momento
       FROM validacion_tecnica v
       JOIN usuario u ON u.id = v.id_validador
      WHERE v.id_orden = $1
      ORDER BY v.momento DESC`,
    [idOrden],
  );
  return rows;
}

export interface FilaExpedienteRevision {
  readonly id: string;
  readonly codigo: string;
  readonly numero: string;
  readonly estado: string;
  readonly cliente: string;
  readonly articulo: string;
  readonly tipo_garantia: string;
  readonly tecnico: string | null;
  readonly id_usuario_tecnico: string | null;
  readonly falla_reportada: string;
  readonly falla_real: string | null;
  readonly componente: string | null;
}

export async function expedienteDeRevision(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaExpedienteRevision | null> {
  const { rows } = await ejecutor.query<FilaExpedienteRevision>(
    `SELECT o.id, o.codigo, o.numero::text AS numero, o.estado::text AS estado,
            trim(c.nombres || ' ' || coalesce(c.apellidos, '')) AS cliente,
            trim(m.nombre || ' ' || coalesce(a.modelo, '')) AS articulo,
            o.tipo_garantia::text AS tipo_garantia,
            ut.nombres AS tecnico, t.id_usuario AS id_usuario_tecnico,
            o.falla_reportada,
            d.falla_real, d.componente
       FROM orden_servicio o
       JOIN cliente c  ON c.id = o.id_cliente
       JOIN articulo a ON a.id = o.id_articulo
       JOIN marca m    ON m.id = a.id_marca
       LEFT JOIN tecnico t ON t.id = o.id_tecnico
       LEFT JOIN usuario ut ON ut.id = t.id_usuario
       -- El ultimo diagnostico: si hubo correccion, es el que vale.
       LEFT JOIN LATERAL (
         SELECT falla_real, componente FROM diagnostico
          WHERE id_orden = o.id ORDER BY creado_en DESC LIMIT 1
       ) d ON true
      WHERE o.id = $1`,
    [idOrden],
  );
  return rows[0] ?? null;
}

export async function evidenciasPresentes(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<string[]> {
  const { rows } = await ejecutor.query<{ clave: string }>(
    'SELECT DISTINCT clave FROM evidencia WHERE id_orden = $1 ORDER BY clave',
    [idOrden],
  );
  return rows.map((fila) => fila.clave);
}

/**
 * Lo que falta Y YA SE PODIA HABER TOMADO.
 *
 * Se parte de la misma vista que usa cobros —para que las dos pantallas no
 * digan cosas distintas de la misma orden— pero se acota a los momentos
 * que corresponden al estado actual.
 *
 * Sin ese recorte hay un bloqueo circular: `firma_cliente` se toma en la
 * ENTREGA, asi que una orden terminada siempre la tendria «faltando»; sin
 * aprobacion no se entrega, y sin entregar no hay firma. Ninguna orden
 * pasaria jamas la validacion.
 */
export async function evidenciasFaltantes(
  idOrden: string, momentos: readonly string[], ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<string[]> {
  const { rows } = await ejecutor.query<{ clave: string }>(
    `SELECT clave FROM v_evidencia_faltante
      WHERE id_orden = $1 AND momento::text = ANY($2::text[])
      ORDER BY clave`,
    [idOrden, momentos],
  );
  return rows.map((fila) => fila.clave);
}

export interface FilaRepuestoUsado {
  readonly descripcion: string;
  readonly cantidad: number;
  readonly precio_unitario: string;
}

export async function repuestosDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaRepuestoUsado[]> {
  const { rows } = await ejecutor.query<FilaRepuestoUsado>(
    `SELECT r.descripcion, m.cantidad, m.precio_unitario
       FROM movimiento_repuesto m
       JOIN repuesto r ON r.id = m.id_repuesto
      WHERE m.id_orden = $1 AND m.tipo = 'consumo'
      ORDER BY r.descripcion`,
    [idOrden],
  );
  return rows;
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; resultado: string; observacion: string;
    revisoDiagnostico: boolean; revisoReparacion: boolean;
    revisoEvidencias: boolean; revisoRepuestos: boolean; idValidador: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO validacion_tecnica
       (id_orden, resultado, observacion, reviso_diagnostico, reviso_reparacion,
        reviso_evidencias, reviso_repuestos, id_validador)
     VALUES ($1, $2::resultado_validacion, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [datos.idOrden, datos.resultado, datos.observacion, datos.revisoDiagnostico,
      datos.revisoReparacion, datos.revisoEvidencias, datos.revisoRepuestos, datos.idValidador],
  );
  return rows[0]!.id;
}

/** La ultima palabra sobre una orden. Null si nadie la ha revisado. */
export async function ultimaDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ resultado: string } | null> {
  const { rows } = await ejecutor.query<{ resultado: string }>(
    `SELECT resultado::text AS resultado FROM validacion_tecnica
      WHERE id_orden = $1 ORDER BY momento DESC LIMIT 1`,
    [idOrden],
  );
  return rows[0] ?? null;
}

/** Ordenes terminadas que ningun jefe ha aprobado todavia. */
export async function pendientesDeRevision(
  limite: number, desplazamiento: number, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ filas: FilaExpedienteRevision[]; total: number }> {
  const condicion = `
    o.estado IN ('finalizada', 'en_reparacion')
    AND NOT EXISTS (
      SELECT 1 FROM validacion_tecnica v
       WHERE v.id_orden = o.id AND v.resultado = 'aprobada'
    )`;

  const { rows } = await ejecutor.query<FilaExpedienteRevision>(
    `SELECT o.id, o.codigo, o.numero::text AS numero, o.estado::text AS estado,
            trim(c.nombres || ' ' || coalesce(c.apellidos, '')) AS cliente,
            trim(m.nombre || ' ' || coalesce(a.modelo, '')) AS articulo,
            o.tipo_garantia::text AS tipo_garantia,
            ut.nombres AS tecnico, t.id_usuario AS id_usuario_tecnico,
            o.falla_reportada, NULL::text AS falla_real, NULL::text AS componente
       FROM orden_servicio o
       JOIN cliente c  ON c.id = o.id_cliente
       JOIN articulo a ON a.id = o.id_articulo
       JOIN marca m    ON m.id = a.id_marca
       LEFT JOIN tecnico t ON t.id = o.id_tecnico
       LEFT JOIN usuario ut ON ut.id = t.id_usuario
      WHERE ${condicion}
      ORDER BY o.plazo_vence_en NULLS LAST, o.numero
      LIMIT $1 OFFSET $2`,
    [limite, desplazamiento],
  );

  const { rows: conteo } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM orden_servicio o WHERE ${condicion}`,
  );
  return { filas: rows, total: Number(conteo[0]!.total) };
}
