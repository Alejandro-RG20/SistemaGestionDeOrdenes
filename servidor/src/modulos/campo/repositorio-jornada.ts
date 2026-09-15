/**
 * Consultas de la descarga de jornada.
 *
 * Son cinco consultas que se resuelven en una sola peticion HTTP. La
 * alternativa —que el dispositivo llame a /ordenes, /repuestos,
 * /existencias y /coberturas por separado— multiplica por cinco la
 * probabilidad de quedarse a medias con mala senal.
 */
import { ESTADOS_FINALES } from '@servitotal/compartido';
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaTecnicoDeJornada {
  readonly id_tecnico: string;
  readonly tecnico: string;
  readonly id_bodega: string | null;
  readonly bodega: string | null;
}

export async function tecnicoDelUsuario(
  idUsuario: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaTecnicoDeJornada | null> {
  const { rows } = await ejecutor.query<FilaTecnicoDeJornada>(
    `SELECT t.id AS id_tecnico,
            u.nombres AS tecnico,
            b.id   AS id_bodega,
            b.nombre AS bodega
       FROM tecnico t
       JOIN usuario u ON u.id = t.id_usuario
       LEFT JOIN bodega b ON b.id_tecnico = t.id AND b.tipo = 'movil' AND b.activa
      WHERE t.id_usuario = $1 AND t.activo`,
    [idUsuario],
  );
  return rows[0] ?? null;
}

export interface FilaOrdenDeJornada {
  readonly id: string;
  readonly numero: string;
  readonly estado: string;
  readonly modalidad: string;
  readonly tipo_garantia: string;
  readonly id_cliente: string;
  readonly cliente: string;
  readonly id_articulo: string;
  readonly articulo: string;
  readonly falla_reportada: string;
  readonly telefono_contacto: string;
  readonly direccion_servicio: string | null;
  readonly referencia_ubicacion: string | null;
  readonly zona: string | null;
  readonly plazo_vence_en: Date | null;
}

/** Las ordenes vivas del tecnico. Las cerradas no se bajan: no hay nada que hacerles. */
export async function ordenesDelTecnico(
  idTecnico: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaOrdenDeJornada[]> {
  const { rows } = await ejecutor.query<FilaOrdenDeJornada>(
    `SELECT o.id, o.numero, o.estado::text AS estado, o.modalidad::text AS modalidad,
            o.tipo_garantia::text AS tipo_garantia,
            o.id_cliente, trim(c.nombres || ' ' || coalesce(c.apellidos, '')) AS cliente,
            o.id_articulo, trim(m.nombre || ' ' || coalesce(a.modelo, '')) AS articulo,
            o.falla_reportada, o.telefono_contacto, o.direccion_servicio,
            o.referencia_ubicacion, z.nombre AS zona, o.plazo_vence_en
       FROM orden_servicio o
       JOIN cliente c  ON c.id = o.id_cliente
       JOIN articulo a ON a.id = o.id_articulo
       JOIN marca m ON m.id = a.id_marca
       LEFT JOIN zona z  ON z.id = o.id_zona
      WHERE o.id_tecnico = $1
        AND NOT (o.estado = ANY ($2::estado_orden[]))
      ORDER BY o.plazo_vence_en NULLS LAST, o.numero`,
    [idTecnico, ESTADOS_FINALES],
  );
  return rows;
}

export interface FilaRepuestoDeJornada {
  readonly id: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly precio: string;
}

export async function catalogoDeRepuestos(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaRepuestoDeJornada[]> {
  const { rows } = await ejecutor.query<FilaRepuestoDeJornada>(
    `SELECT id, codigo, descripcion, precio
       FROM repuesto WHERE activo ORDER BY codigo`,
  );
  return rows;
}

export interface FilaExistenciaDeJornada {
  readonly id_repuesto: string;
  readonly cantidad: number;
}

export async function existenciasDeBodega(
  idBodega: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaExistenciaDeJornada[]> {
  const { rows } = await ejecutor.query<FilaExistenciaDeJornada>(
    'SELECT id_repuesto, cantidad FROM existencia WHERE id_bodega = $1 AND cantidad > 0',
    [idBodega],
  );
  return rows;
}

export interface FilaReglaEvidencia {
  readonly clave: string;
  readonly etiqueta: string;
  readonly tipo: string;
  readonly momento: string;
  readonly tipo_archivo: string;
  readonly bloquea_avance: boolean;
}

/**
 * Las reglas generales, sin distinguir categoria ni marca.
 *
 * Bajar la matriz completa por categoria seria pesado y, sobre todo,
 * inutil: lo que el dispositivo necesita es poder avisar "le falta la foto
 * del articulo". La verificacion que BLOQUEA de verdad la hace el servidor
 * con la vista v_evidencia_faltante, que si conoce la categoria exacta.
 */
export async function reglasDeEvidencia(
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaReglaEvidencia[]> {
  const { rows } = await ejecutor.query<FilaReglaEvidencia>(
    `SELECT DISTINCT ON (re.clave, re.tipo, re.momento)
            re.clave, re.etiqueta, re.tipo::text AS tipo, re.momento::text AS momento,
            CASE WHEN re.clave LIKE 'firma%'   THEN 'firma'
                 WHEN re.clave LIKE 'factura%' THEN 'documento'
                 WHEN re.clave LIKE 'medicion%' THEN 'medicion'
                 ELSE 'foto' END AS tipo_archivo,
            re.bloquea_avance
       FROM regla_evidencia re
      WHERE re.activa AND re.obligatoria
      ORDER BY re.clave, re.tipo, re.momento`,
  );
  return rows;
}
