/** Acceso a datos de visitas y calendario laboral. Uso interno del modulo. */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { FilaDiaNoLaborable, FilaJornada, FilaVisita } from './dto.js';

const CAMPOS = `
  v.id, v.id_orden, o.numero AS numero_orden, o.codigo AS codigo_orden, v.id_tecnico,
  u.nombres AS tecnico, v.fecha_programada, v.franja_horaria, v.orden_recorrido,
  v.hora_llegada, v.hora_salida, v.resultado, v.vigente, v.motivo,
  o.direccion_servicio, z.nombre AS zona`;

const DESDE = `
  FROM visita v
  JOIN orden_servicio o ON o.id = v.id_orden
  JOIN tecnico t ON t.id = v.id_tecnico
  JOIN usuario u ON u.id = t.id_usuario
  LEFT JOIN zona z ON z.id = o.id_zona`;

export async function listarJornadas(
  idCentro: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaJornada[]> {
  const { rows } = await ejecutor.query<FilaJornada>(
    `SELECT dia_semana, hora_inicio::text AS hora_inicio, hora_fin::text AS hora_fin
       FROM calendario_laboral WHERE id_centro = $1 AND activo ORDER BY dia_semana`,
    [idCentro],
  );
  return rows;
}

export async function listarDiasNoLaborables(
  idCentro: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaDiaNoLaborable[]> {
  const { rows } = await ejecutor.query<FilaDiaNoLaborable>(
    'SELECT fecha, motivo FROM dia_no_laborable WHERE id_centro = $1 ORDER BY fecha',
    [idCentro],
  );
  return rows;
}

export async function buscarPorId(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaVisita | null> {
  const { rows } = await ejecutor.query<FilaVisita>(`SELECT ${CAMPOS} ${DESDE} WHERE v.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaVisita[]> {
  const { rows } = await ejecutor.query<FilaVisita>(
    `SELECT ${CAMPOS} ${DESDE} WHERE v.id_orden = $1 ORDER BY v.vigente DESC, v.fecha_programada DESC`,
    [idOrden],
  );
  return rows;
}

export interface FiltroAgenda {
  readonly idTecnico?: string | undefined;
  readonly desde?: string | undefined;
  readonly hasta?: string | undefined;
  readonly soloVigentes: boolean;
}

const DONDE = `
  WHERE ($1::uuid IS NULL OR v.id_tecnico = $1)
    AND ($2::date IS NULL OR v.fecha_programada >= $2)
    AND ($3::date IS NULL OR v.fecha_programada <= $3)
    AND ($4::boolean IS FALSE OR v.vigente)`;

function parametros(filtro: FiltroAgenda): unknown[] {
  return [filtro.idTecnico ?? null, filtro.desde ?? null, filtro.hasta ?? null, filtro.soloVigentes];
}

export async function contar(filtro: FiltroAgenda, ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM visita v ${DONDE}`, parametros(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listar(
  filtro: FiltroAgenda, limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaVisita[]> {
  const { rows } = await ejecutor.query<FilaVisita>(
    `SELECT ${CAMPOS} ${DESDE} ${DONDE}
      ORDER BY v.fecha_programada, v.franja_horaria, v.orden_recorrido NULLS LAST
      LIMIT $5 OFFSET $6`,
    [...parametros(filtro), limite, desplazamiento],
  );
  return rows;
}

export async function hayVisitaVigente(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<boolean> {
  const { rows } = await ejecutor.query('SELECT 1 FROM visita WHERE id_orden = $1 AND vigente LIMIT 1', [idOrden]);
  return rows.length > 0;
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; idTecnico: string; fechaProgramada: string; franjaHoraria: string;
    ordenRecorrido: number | null; creadoPor: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO visita (id_orden, id_tecnico, fecha_programada, franja_horaria, orden_recorrido, creado_por)
     VALUES ($1, $2, $3::date, $4, $5, $6) RETURNING id`,
    [datos.idOrden, datos.idTecnico, datos.fechaProgramada, datos.franjaHoraria,
      datos.ordenRecorrido, datos.creadoPor],
  );
  return rows[0]!.id;
}

/** Al reprogramar, la visita anterior deja de ser vigente y libera su franja. */
export async function dejarSinVigencia(
  ejecutor: Ejecutor, idVisita: string, motivo: string,
): Promise<void> {
  await ejecutor.query(
    'UPDATE visita SET vigente = false, motivo = $2 WHERE id = $1',
    [idVisita, motivo],
  );
}

export async function buscarVigenteDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaVisita | null> {
  const { rows } = await ejecutor.query<FilaVisita>(
    `SELECT ${CAMPOS} ${DESDE} WHERE v.id_orden = $1 AND v.vigente
      ORDER BY (v.resultado = 'programada') DESC, v.fecha_programada DESC LIMIT 1`, [idOrden],
  );
  return rows[0] ?? null;
}

/**
 * La visita de la orden que todavia no se hizo: vigente y sin resultado.
 *
 * Una visita ya realizada sigue «vigente» (solo deja de serlo al
 * reprogramarla), asi que «vigente» no basta para saber si hay una visita
 * por hacer. Sin esta distincion, despues de una primera visita no se
 * podia programar otra: el servidor decia que ya habia una.
 */
export async function buscarPendienteDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(), bloquear = false,
): Promise<FilaVisita | null> {
  const { rows } = await ejecutor.query<FilaVisita>(
    `SELECT ${CAMPOS} ${DESDE} WHERE v.id_orden = $1 AND v.vigente AND v.resultado = 'programada'
      ORDER BY v.fecha_programada LIMIT 1 ${bloquear ? 'FOR UPDATE OF v' : ''}`, [idOrden],
  );
  return rows[0] ?? null;
}

export async function buscarParaRegistrar(
  idVisita: string, ejecutor: Ejecutor,
): Promise<(FilaVisita & { estado_orden: string; id_tienda: string | null; creado_por_orden: string | null; id_tecnico_orden: string | null }) | null> {
  const { rows } = await ejecutor.query<FilaVisita & {
    estado_orden: string; id_tienda: string | null; creado_por_orden: string | null; id_tecnico_orden: string | null;
  }>(
    `SELECT ${CAMPOS}, o.estado::text AS estado_orden, o.id_tienda, o.creado_por AS creado_por_orden,
            o.id_tecnico AS id_tecnico_orden
       ${DESDE} WHERE v.id = $1 FOR UPDATE OF v`,
    [idVisita],
  );
  return rows[0] ?? null;
}

/** Hora real de llegada: la pone el reloj del servidor. */
export async function anotarLlegada(ejecutor: Ejecutor, idVisita: string): Promise<void> {
  await ejecutor.query(
    'UPDATE visita SET hora_llegada = now() WHERE id = $1 AND hora_llegada IS NULL', [idVisita],
  );
}

/** Hora real de salida, resultado y observaciones del tecnico. */
export async function anotarSalida(
  ejecutor: Ejecutor, datos: { idVisita: string; resultado: string; observaciones: string | null },
): Promise<void> {
  await ejecutor.query(
    `UPDATE visita SET hora_salida = now(), resultado = $2::resultado_visita,
            motivo = coalesce($3, motivo)
      WHERE id = $1 AND resultado = 'programada'`,
    [datos.idVisita, datos.resultado, datos.observaciones],
  );
}

export interface ResumenDeAgenda {
  readonly programadas: number; readonly en_curso: number; readonly realizadas: number;
  readonly resueltas_en_sitio: number; readonly requiere_traslado_taller: number;
  readonly cliente_ausente: number; readonly no_autorizada: number;
}

/** Conteos de las visitas vigentes del filtro (las reprogramadas no cuentan dos veces). */
export async function resumir(filtro: FiltroAgenda, ejecutor: Ejecutor = ejecutorPorDefecto()): Promise<ResumenDeAgenda> {
  const { rows } = await ejecutor.query<ResumenDeAgenda>(
    `SELECT count(*) FILTER (WHERE v.resultado = 'programada' AND v.hora_llegada IS NULL)::int AS programadas,
            count(*) FILTER (WHERE v.resultado = 'programada' AND v.hora_llegada IS NOT NULL)::int AS en_curso,
            count(*) FILTER (WHERE v.resultado <> 'programada')::int AS realizadas,
            count(*) FILTER (WHERE v.resultado = 'resuelta_en_sitio')::int AS resueltas_en_sitio,
            count(*) FILTER (WHERE v.resultado = 'requiere_traslado_taller')::int AS requiere_traslado_taller,
            count(*) FILTER (WHERE v.resultado = 'cliente_ausente')::int AS cliente_ausente,
            count(*) FILTER (WHERE v.resultado = 'no_autorizada')::int AS no_autorizada
       FROM visita v ${DONDE.replace('($4::boolean IS FALSE OR v.vigente)', 'v.vigente')}`,
    parametros(filtro).slice(0, 3),
  );
  return rows[0]!;
}

export async function tecnicoExiste(
  idTecnico: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ id: string; tipo: string } | null> {
  const { rows } = await ejecutor.query<{ id: string; tipo: string }>(
    'SELECT id, tipo FROM tecnico WHERE id = $1 AND activo',
    [idTecnico],
  );
  return rows[0] ?? null;
}

export async function registrarResultado(
  ejecutor: Ejecutor,
  datos: {
    id: string; resultado: string; horaLlegada: Date;
    horaSalida: Date | null; motivo: string | null;
  },
): Promise<void> {
  await ejecutor.query(
    // Si la llegada ya se marco en linea, se respeta: es la hora real.
    `UPDATE visita
        SET resultado = $2::resultado_visita, hora_llegada = coalesce(hora_llegada, $3), hora_salida = $4,
            motivo = coalesce($5, motivo)
      WHERE id = $1`,
    [datos.id, datos.resultado, datos.horaLlegada, datos.horaSalida, datos.motivo],
  );
}

/** El tecnico activo de un usuario, o null si el usuario no es tecnico. */
export async function tecnicoDeUsuario(
  idUsuario: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<string | null> {
  const { rows } = await ejecutor.query<{ id: string }>(
    'SELECT id FROM tecnico WHERE id_usuario = $1 AND activo', [idUsuario],
  );
  return rows[0]?.id ?? null;
}

export async function ordenParaVisita(
  idOrden: string, ejecutor: Ejecutor,
): Promise<{ estado: string; modalidad: string } | null> {
  const { rows } = await ejecutor.query<{ estado: string; modalidad: string }>(
    'SELECT estado::text AS estado, modalidad::text AS modalidad FROM orden_servicio WHERE id = $1', [idOrden],
  );
  return rows[0] ?? null;
}
