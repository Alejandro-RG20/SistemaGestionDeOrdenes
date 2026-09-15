/** Acceso a datos de ordenes. Uso interno del modulo. */
import type { EstadoOrden } from '@servitotal/compartido';
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { FilaEvento, FilaNota, FilaOrden, FilaOrdenCompleta } from './dto.js';

/**
 * El plazo del estado sale de regla_plazo: primero la regla especifica del
 * tipo de garantia y, si no hay, la general. El NULLS LAST es lo que da esa
 * precedencia.
 */
const PLAZO_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT rp.horas_alerta FROM regla_plazo rp
     WHERE rp.activa AND rp.estado = o.estado
       AND (rp.tipo = o.tipo_garantia OR rp.tipo IS NULL)
     ORDER BY rp.tipo NULLS LAST LIMIT 1
  ) plazo ON true`;

const CAMPOS = `
  o.id, o.numero, o.estado, o.modalidad, o.tipo_garantia,
  o.id_cliente, trim(cli.nombres || ' ' || coalesce(cli.apellidos, '')) AS cliente,
  o.id_articulo, trim(m.nombre || ' ' || coalesce(a.modelo, '')) AS articulo,
  o.id_tecnico, ut.nombres AS tecnico,
  ur.nombres AS responsable_actual,
  o.falla_reportada, o.fecha_recepcion, o.fecha_estado_desde, o.plazo_vence_en,
  plazo.horas_alerta, o.total`;

const DESDE = `
  FROM orden_servicio o
  JOIN cliente cli ON cli.id = o.id_cliente
  JOIN articulo a ON a.id = o.id_articulo
  JOIN marca m ON m.id = a.id_marca
  LEFT JOIN tecnico t ON t.id = o.id_tecnico
  LEFT JOIN usuario ut ON ut.id = t.id_usuario
  LEFT JOIN usuario ur ON ur.id = o.id_responsable_actual
  ${PLAZO_LATERAL}`;

export interface FiltroOrdenes {
  readonly estado?: string | undefined;
  readonly idTecnico?: string | undefined;
  readonly idCliente?: string | undefined;
  readonly numero?: number | undefined;
  readonly soloActivas: boolean;
  readonly soloVencidas: boolean;
}

const DONDE = `
  WHERE ($1::text IS NULL OR o.estado::text = $1)
    AND ($2::uuid IS NULL OR o.id_tecnico = $2)
    AND ($3::uuid IS NULL OR o.id_cliente = $3)
    AND ($4::bigint IS NULL OR o.numero = $4)
    AND ($5::boolean IS FALSE OR o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada'))
    AND ($6::boolean IS FALSE OR (o.plazo_vence_en < now()
         AND o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')))`;

function parametros(filtro: FiltroOrdenes): unknown[] {
  return [
    filtro.estado ?? null, filtro.idTecnico ?? null, filtro.idCliente ?? null,
    filtro.numero ?? null, filtro.soloActivas, filtro.soloVencidas,
  ];
}

export async function contar(filtro: FiltroOrdenes, ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM orden_servicio o ${DONDE}`, parametros(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listar(
  filtro: FiltroOrdenes, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaOrden[]> {
  const { rows } = await ejecutor.query<FilaOrden>(
    `SELECT ${CAMPOS} ${DESDE} ${DONDE}
      ORDER BY o.plazo_vence_en NULLS LAST, o.numero LIMIT $7 OFFSET $8`,
    [...parametros(filtro), limite, desplazamiento],
  );
  return rows;
}

export async function buscarPorId(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaOrdenCompleta | null> {
  const { rows } = await ejecutor.query<FilaOrdenCompleta>(
    `SELECT ${CAMPOS}, o.telefono_contacto, o.direccion_servicio, o.referencia_ubicacion,
            o.id_zona, z.nombre AS zona, o.cargo_visita, o.id_regla_cobertura,
            o.levantada_en_campo, o.motivo_anulacion, o.fecha_entrega
       ${DESDE} LEFT JOIN zona z ON z.id = o.id_zona
      WHERE o.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listarEventos(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaEvento[]> {
  const { rows } = await ejecutor.query<FilaEvento>(
    `SELECT e.id, e.estado_anterior, e.estado_nuevo, u.nombres AS responsable,
            e.momento, e.momento_dispositivo, e.registrado_sin_conexion, e.observacion
       FROM evento_orden e LEFT JOIN usuario u ON u.id = e.id_responsable
      WHERE e.id_orden = $1 ORDER BY e.momento, e.id`,
    [idOrden],
  );
  return rows;
}

export async function listarNotas(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaNota[]> {
  const { rows } = await ejecutor.query<FilaNota>(
    `SELECT n.id, n.motivo, n.detalle, u.nombres AS autor, n.creado_en
       FROM nota_correccion n JOIN usuario u ON u.id = n.creado_por
      WHERE n.id_orden = $1 ORDER BY n.creado_en DESC`,
    [idOrden],
  );
  return rows;
}

export interface FilaContextoTransicion {
  readonly id: string;
  readonly numero: number;
  readonly estado: EstadoOrden;
  readonly modalidad: string;
  readonly tipo_garantia: string;
  readonly id_tecnico: string | null;
  readonly id_responsable_actual: string | null;
  readonly id_centro: string;
  readonly tiene_visita: boolean;
  readonly tiene_diagnostico: boolean;
  readonly tiene_cotizacion: boolean;
  readonly cotizacion_aceptada: boolean;
  readonly solicitudes_sin_liberar: number;
}

/** Todo lo que la maquina de estados necesita, en un solo viaje. */
export async function buscarContextoTransicion(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaContextoTransicion | null> {
  const { rows } = await ejecutor.query<FilaContextoTransicion>(
    `SELECT o.id, o.numero, o.estado, o.modalidad::text AS modalidad,
            o.tipo_garantia::text AS tipo_garantia, o.id_tecnico,
            o.id_responsable_actual, o.id_centro,
            EXISTS (SELECT 1 FROM visita v WHERE v.id_orden = o.id AND v.vigente) AS tiene_visita,
            EXISTS (SELECT 1 FROM diagnostico d WHERE d.id_orden = o.id) AS tiene_diagnostico,
            EXISTS (SELECT 1 FROM cotizacion c WHERE c.id_orden = o.id) AS tiene_cotizacion,
            EXISTS (SELECT 1 FROM cotizacion c WHERE c.id_orden = o.id AND c.aceptada) AS cotizacion_aceptada,
            (SELECT count(*) FROM solicitud_repuesto s
              WHERE s.id_orden = o.id AND NOT s.liberada)::int AS solicitudes_sin_liberar
       FROM orden_servicio o WHERE o.id = $1
       FOR UPDATE OF o`,
    [idOrden],
  );
  return rows[0] ?? null;
}

/**
 * Evidencia obligatoria que bloquea el avance y todavia no se cargo, para
 * el momento que corresponde al estado actual. Es la misma logica de la
 * vista v_evidencia_faltante, acotada al momento.
 */
export async function evidenciasFaltantes(
  idOrden: string, momento: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ clave: string; etiqueta: string }[]> {
  const { rows } = await ejecutor.query<{ clave: string; etiqueta: string }>(
    `SELECT re.clave, re.etiqueta
       FROM orden_servicio o
       JOIN articulo a ON a.id = o.id_articulo
       JOIN regla_evidencia re
         ON re.tipo = o.tipo_garantia AND re.activa AND re.obligatoria AND re.bloquea_avance
        AND re.momento = $2::momento_evidencia
        AND (re.id_categoria IS NULL OR re.id_categoria = a.id_categoria)
        AND (re.id_marca IS NULL OR re.id_marca = a.id_marca)
      WHERE o.id = $1
        AND NOT EXISTS (
          SELECT 1 FROM evidencia ev WHERE ev.id_orden = o.id AND ev.clave = re.clave)
      ORDER BY re.clave`,
    [idOrden, momento],
  );
  return rows;
}

export async function buscarPlazo(
  estado: string, tipoGarantia: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ horas_maximas: number; horas_alerta: number } | null> {
  const { rows } = await ejecutor.query<{ horas_maximas: number; horas_alerta: number }>(
    `SELECT horas_maximas, horas_alerta FROM regla_plazo
      WHERE activa AND estado = $1::estado_orden AND (tipo = $2::tipo_garantia OR tipo IS NULL)
      ORDER BY tipo NULLS LAST LIMIT 1`,
    [estado, tipoGarantia],
  );
  return rows[0] ?? null;
}

export async function buscarTecnicoDeUsuario(
  idUsuario: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ id: string; tipo: string } | null> {
  const { rows } = await ejecutor.query<{ id: string; tipo: string }>(
    'SELECT id, tipo FROM tecnico WHERE id_usuario = $1 AND activo', [idUsuario],
  );
  return rows[0] ?? null;
}

export async function insertarOrden(
  ejecutor: Ejecutor,
  datos: {
    id: string | null; idCentro: string; idCliente: string; idArticulo: string;
    modalidad: string; tipoGarantia: string; idReglaCobertura: string | null;
    idResponsableActual: string; telefonoContacto: string; direccionServicio: string | null;
    referenciaUbicacion: string | null; idZona: string | null; cargoVisita: number;
    fallaReportada: string; plazoVenceEn: Date | null; levantadaEnCampo: boolean; creadoPor: string;
  },
): Promise<{ id: string; numero: number }> {
  // El numero NO se envia: lo asigna la secuencia del servidor.
  const { rows } = await ejecutor.query<{ id: string; numero: number }>(
    `INSERT INTO orden_servicio
       (id, id_centro, id_cliente, id_articulo, modalidad, estado, tipo_garantia,
        id_regla_cobertura, id_responsable_actual, telefono_contacto, direccion_servicio,
        referencia_ubicacion, id_zona, cargo_visita, falla_reportada, plazo_vence_en,
        levantada_en_campo, creado_por)
     VALUES (coalesce($1::uuid, uuid_generate_v4()), $2, $3, $4, $5::modalidad_servicio,
             'registrada', $6::tipo_garantia, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id, numero`,
    [datos.id, datos.idCentro, datos.idCliente, datos.idArticulo, datos.modalidad,
      datos.tipoGarantia, datos.idReglaCobertura, datos.idResponsableActual,
      datos.telefonoContacto, datos.direccionServicio, datos.referenciaUbicacion,
      datos.idZona, datos.cargoVisita, datos.fallaReportada, datos.plazoVenceEn,
      datos.levantadaEnCampo, datos.creadoPor],
  );
  return rows[0]!;
}

export async function asignarTecnico(
  ejecutor: Ejecutor, idOrden: string, idTecnico: string, modificadoPor: string,
): Promise<void> {
  await ejecutor.query(
    `UPDATE orden_servicio SET id_tecnico = $2, modificado_en = now(), modificado_por = $3
      WHERE id = $1`,
    [idOrden, idTecnico, modificadoPor],
  );
}

export async function aplicarTransicion(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; estadoNuevo: string; plazoVenceEn: Date | null;
    idResponsableActual: string | null; modalidadNueva: string | null;
    motivoAnulacion: string | null; marcaEntrega: boolean; modificadoPor: string;
  },
): Promise<void> {
  await ejecutor.query(
    `UPDATE orden_servicio SET
        estado = $2::estado_orden,
        fecha_estado_desde = now(),
        plazo_vence_en = $3,
        id_responsable_actual = $4,
        modalidad = coalesce($5::modalidad_servicio, modalidad),
        motivo_anulacion = coalesce($6, motivo_anulacion),
        fecha_entrega = CASE WHEN $7::boolean THEN now() ELSE fecha_entrega END,
        modificado_en = now(), modificado_por = $8
      WHERE id = $1`,
    [datos.idOrden, datos.estadoNuevo, datos.plazoVenceEn, datos.idResponsableActual,
      datos.modalidadNueva, datos.motivoAnulacion, datos.marcaEntrega, datos.modificadoPor],
  );
}

export async function insertarEvento(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; estadoAnterior: string | null; estadoNuevo: string;
    idResponsable: string; observacion: string | null;
  },
): Promise<void> {
  await ejecutor.query(
    `INSERT INTO evento_orden
       (id_orden, estado_anterior, estado_nuevo, id_responsable, observacion)
     VALUES ($1, $2::estado_orden, $3::estado_orden, $4, $5)`,
    [datos.idOrden, datos.estadoAnterior, datos.estadoNuevo, datos.idResponsable, datos.observacion],
  );
}

export async function insertarNota(
  ejecutor: Ejecutor,
  datos: { idOrden: string; motivo: string; detalle: string; creadoPor: string },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    'INSERT INTO nota_correccion (id_orden, motivo, detalle, creado_por) VALUES ($1, $2, $3, $4) RETURNING id',
    [datos.idOrden, datos.motivo, datos.detalle, datos.creadoPor],
  );
  return rows[0]!.id;
}

/** Datos vivos del cliente que la orden va a CONGELAR al crearse. */
export async function datosParaCongelar(
  idCliente: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{
  telefono: string | null; detalle: string | null; referencia: string | null;
  id_zona: string | null; cargo_visita: number | null;
} | null> {
  const { rows } = await ejecutor.query<{
    telefono: string | null; detalle: string | null; referencia: string | null;
    id_zona: string | null; cargo_visita: number | null;
  }>(
    `SELECT tel.numero AS telefono, dir.detalle, dir.referencia, dir.id_zona, z.cargo_visita
       FROM cliente c
       LEFT JOIN LATERAL (
         SELECT t.numero FROM cliente_telefono t
          WHERE t.id_cliente = c.id AND t.vigente ORDER BY t.desde DESC LIMIT 1) tel ON true
       LEFT JOIN LATERAL (
         SELECT d.detalle, d.referencia, d.id_zona FROM cliente_direccion d
          WHERE d.id_cliente = c.id AND d.vigente
          ORDER BY d.principal DESC, d.desde DESC LIMIT 1) dir ON true
       LEFT JOIN zona z ON z.id = dir.id_zona
      WHERE c.id = $1`,
    [idCliente],
  );
  return rows[0] ?? null;
}

export async function articuloPerteneceA(
  idArticulo: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ id_cliente: string } | null> {
  const { rows } = await ejecutor.query<{ id_cliente: string }>(
    'SELECT id_cliente FROM articulo WHERE id = $1 AND activo', [idArticulo],
  );
  return rows[0] ?? null;
}

export async function existeOrden(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<boolean> {
  const { rows } = await ejecutor.query('SELECT 1 FROM orden_servicio WHERE id = $1', [id]);
  return rows.length > 0;
}

export interface FilaOrdenAbierta {
  readonly id: string;
  readonly numero: number;
  readonly id_cliente: string;
  readonly tipo_garantia: string;
  readonly estado: string;
}

/**
 * Ordenes del articulo que siguen abiertas. Solo estas se reevaluan cuando
 * cambia un dato del que depende la cobertura: una orden entregada o
 * cerrada no cambia de garantia hacia atras.
 */
export async function listarAbiertasDeArticulo(
  idArticulo: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaOrdenAbierta[]> {
  const { rows } = await ejecutor.query<FilaOrdenAbierta>(
    `SELECT id, numero, id_cliente, tipo_garantia::text AS tipo_garantia, estado::text AS estado
       FROM orden_servicio
      WHERE id_articulo = $1
        AND estado NOT IN ('entregada', 'cerrada_sin_reparar', 'anulada')
      ORDER BY numero`,
    [idArticulo],
  );
  return rows;
}

export interface CambioDeGarantia {
  readonly idOrden: string;
  readonly estado: string;
  readonly tipoGarantia: string;
  readonly idReglaCobertura: string;
  readonly observacion: string;
}

/**
 * Aplica todos los cambios de cobertura en UNA sentencia.
 *
 * Reevaluar suele tocar una o dos ordenes, pero escribir dentro del bucle
 * seria un UPDATE por orden: el problema no se nota en desarrollo y si en
 * produccion, cuando una correccion de marca alcanza a docenas de ordenes.
 */
export async function aplicarCambiosDeGarantia(
  ejecutor: Ejecutor, cambios: readonly CambioDeGarantia[], modificadoPor: string,
): Promise<void> {
  if (cambios.length === 0) return;
  await ejecutor.query(
    `UPDATE orden_servicio o
        SET tipo_garantia = c.tipo::tipo_garantia,
            id_regla_cobertura = c.id_regla,
            modificado_en = now(), modificado_por = $4
       FROM unnest($1::uuid[], $2::text[], $3::uuid[]) AS c(id_orden, tipo, id_regla)
      WHERE o.id = c.id_orden`,
    [cambios.map((c) => c.idOrden), cambios.map((c) => c.tipoGarantia),
      cambios.map((c) => c.idReglaCobertura), modificadoPor],
  );
}

/** La reevaluacion queda en la bitacora inmutable de la orden (RN-18). */
export async function anotarEventosDeReevaluacion(
  ejecutor: Ejecutor, cambios: readonly CambioDeGarantia[], idResponsable: string,
): Promise<void> {
  if (cambios.length === 0) return;
  await ejecutor.query(
    `INSERT INTO evento_orden (id_orden, estado_anterior, estado_nuevo, id_responsable, observacion)
     SELECT c.id_orden, c.estado::estado_orden, c.estado::estado_orden, $4, c.observacion
       FROM unnest($1::uuid[], $2::text[], $3::text[]) AS c(id_orden, estado, observacion)`,
    [cambios.map((c) => c.idOrden), cambios.map((c) => c.estado),
      cambios.map((c) => c.observacion), idResponsable],
  );
}

export interface EventoDeAviso {
  readonly idOrden: string;
  readonly estado: string;
  readonly observacion: string;
}

/**
 * Anota varios avisos en la bitacora de otras tantas ordenes, en una sola
 * sentencia. El estado no cambia: es una nota sobre lo que paso, no una
 * transicion.
 */
export async function anotarAvisosEnBitacora(
  ejecutor: Ejecutor, avisos: readonly EventoDeAviso[], idResponsable: string,
): Promise<void> {
  if (avisos.length === 0) return;
  await ejecutor.query(
    `INSERT INTO evento_orden (id_orden, estado_anterior, estado_nuevo, id_responsable, observacion)
     SELECT a.id_orden, a.estado::estado_orden, a.estado::estado_orden, $4, a.observacion
       FROM unnest($1::uuid[], $2::text[], $3::text[]) AS a(id_orden, estado, observacion)`,
    [avisos.map((a) => a.idOrden), avisos.map((a) => a.estado),
      avisos.map((a) => a.observacion), idResponsable],
  );
}
