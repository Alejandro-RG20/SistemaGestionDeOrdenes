/** Acceso a datos de ordenes. Uso interno del modulo. */
import type {
  CotizacionDeOrden, DiagnosticoDeOrden, EntradaBitacora, EstadoOrden,
} from '@servitotal/compartido';
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
  o.id, o.codigo, o.numero, o.estado, o.modalidad, o.tipo_garantia,
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
  /** El codigo completo, tal como lo dicta el cliente: OS-2026-000123. */
  readonly codigo?: string | undefined;
  readonly soloActivas: boolean;
  readonly soloVencidas: boolean;
  /**
   * Alcance por sucursal. NO es un filtro que elija quien consulta: lo
   * impone el servicio para el usuario de tienda, que solo ve lo suyo.
   * Por eso va en el mismo WHERE y no como una condicion opcional que
   * alguien pueda olvidar poner.
   */
  readonly idTienda?: string | undefined;
  /**
   * Alcance por tecnico. Tampoco lo elige quien consulta: lo impone el
   * servicio para el tecnico, que solo ve las ordenes que tiene asignadas.
   *
   * Va aparte de `idTecnico` a proposito. `idTecnico` es el filtro que un
   * jefe usa para mirar la carga de alguien; este es el cerco. Si fueran el
   * mismo campo, un tecnico que pidiera `?idTecnico=<otro>` lo
   * sobreescribiria y se saldria del cerco. Separados, los dos se cumplen a
   * la vez: el cerco no se puede ensanchar desde la peticion.
   */
  readonly idTecnicoAlcance?: string | undefined;
  /**
   * Parte del mismo cerco del tecnico: las ordenes que EL levanto.
   *
   * Va junto con `idTecnicoAlcance` y en OR con el, no en AND: una orden
   * cuenta como suya si se la asignaron o si la creo el. Sin esto, la orden
   * que acaba de levantar en campo —que todavia no tiene tecnico— le
   * quedaba invisible.
   */
  readonly idCreadorAlcance?: string | undefined;
}

const DONDE = `
  WHERE ($1::text IS NULL OR o.estado::text = $1)
    AND ($2::uuid IS NULL OR o.id_tecnico = $2)
    AND ($3::uuid IS NULL OR o.id_cliente = $3)
    AND ($4::bigint IS NULL OR o.numero = $4)
    AND ($5::boolean IS FALSE OR o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada'))
    AND ($6::boolean IS FALSE OR (o.plazo_vence_en < now()
         AND o.estado NOT IN ('entregada','cerrada_sin_reparar','anulada')))
    AND ($7::uuid IS NULL OR o.id_tienda = $7)
    AND ($8::text IS NULL OR o.codigo = $8)
    AND ($9::uuid IS NULL
         OR o.id_tecnico = $9
         OR ($10::uuid IS NOT NULL AND o.creado_por = $10))`;

/**
 * Los parametros del filtro, en el orden del WHERE.
 *
 * `LIMITE` y `DESPLAZAMIENTO` se nombran a partir de esta longitud y no
 * con un numero escrito a mano: agregar una condicion al filtro y olvidar
 * correr el `$7` de abajo es un error que compila, pasa el arranque y solo
 * aparece cuando alguien lista ordenes.
 */
function parametros(filtro: FiltroOrdenes): unknown[] {
  return [
    filtro.estado ?? null, filtro.idTecnico ?? null, filtro.idCliente ?? null,
    filtro.numero ?? null, filtro.soloActivas, filtro.soloVencidas,
    filtro.idTienda ?? null, filtro.codigo ?? null,
    filtro.idTecnicoAlcance ?? null, filtro.idCreadorAlcance ?? null,
  ];
}

/** Cuantos parametros ocupa el filtro. La paginacion va despues de estos. */
const PARAMETROS_DEL_FILTRO = 10;
const LIMITE = `$${PARAMETROS_DEL_FILTRO + 1}`;
const DESPLAZAMIENTO = `$${PARAMETROS_DEL_FILTRO + 2}`;

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
      ORDER BY o.plazo_vence_en NULLS LAST, o.numero
      LIMIT ${LIMITE} OFFSET ${DESPLAZAMIENTO}`,
    [...parametros(filtro), limite, desplazamiento],
  );
  return rows;
}

export async function buscarPorId(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaOrdenCompleta | null> {
  const { rows } = await ejecutor.query<FilaOrdenCompleta>(
    `SELECT ${CAMPOS}, o.telefono_contacto, o.direccion_servicio, o.referencia_ubicacion,
            o.id_zona, z.nombre AS zona, o.id_tienda, ti.nombre AS tienda,
            o.cargo_visita, o.id_regla_cobertura,
            o.levantada_en_campo, o.motivo_anulacion, o.fecha_entrega, o.creado_por
       ${DESDE} LEFT JOIN zona z ON z.id = o.id_zona
                LEFT JOIN tienda_origen ti ON ti.id = o.id_tienda
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
  /** Los necesita el cerco por datos antes de dejar mover la orden. */
  readonly id_tienda: string | null;
  readonly creado_por: string | null;
  readonly tiene_visita: boolean;
  readonly tiene_diagnostico: boolean;
  readonly tiene_cotizacion: boolean;
  readonly cotizacion_aceptada: boolean;
  readonly solicitudes_sin_liberar: number;
  readonly solicitudes_abiertas: number;
  readonly piezas_sin_conciliar: number;
  readonly tiene_entrega: boolean;
  readonly cargo_visita: number;
  readonly pago_registrado: boolean;
  readonly pago_confirmado_por_otra: boolean;
}

/**
 * Todo lo que la maquina de estados necesita, en un solo viaje.
 *
 * `bloquear` toma la fila con FOR UPDATE para mover la orden. Para solo
 * evaluar que acciones se ofrecen (la ficha), se lee sin bloquear.
 */
export async function buscarContextoTransicion(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(), bloquear = true,
): Promise<FilaContextoTransicion | null> {
  const { rows } = await ejecutor.query<FilaContextoTransicion>(
    `SELECT o.id, o.codigo, o.numero, o.estado, o.modalidad::text AS modalidad,
            o.tipo_garantia::text AS tipo_garantia, o.id_tecnico,
            o.id_responsable_actual, o.id_centro, o.id_tienda, o.creado_por,
            EXISTS (SELECT 1 FROM visita v WHERE v.id_orden = o.id AND v.vigente) AS tiene_visita,
            EXISTS (SELECT 1 FROM diagnostico d WHERE d.id_orden = o.id) AS tiene_diagnostico,
            EXISTS (SELECT 1 FROM cotizacion c WHERE c.id_orden = o.id) AS tiene_cotizacion,
            EXISTS (SELECT 1 FROM cotizacion c WHERE c.id_orden = o.id AND c.aceptada) AS cotizacion_aceptada,
            -- Una solicitud anulada o rechazada ya no se espera: contarla
            -- dejaba la orden detenida para siempre en 'esperando_repuesto'.
            (SELECT count(*) FROM solicitud_repuesto s
              WHERE s.id_orden = o.id AND NOT s.liberada
                AND s.estado NOT IN ('anulada', 'rechazada'))::int AS solicitudes_sin_liberar,
            (SELECT count(*) FROM solicitud_repuesto s
              WHERE s.id_orden = o.id
                AND s.estado IN ('solicitada', 'en_revision', 'aprobada', 'preparada', 'entregada')
            )::int AS solicitudes_abiertas,
            -- Piezas entregadas al tecnico PARA esta orden que no se
            -- instalaron ni se devolvieron. Por repuesto, y nunca negativo:
            -- el tecnico de ruta puede instalar de su stock general.
            (SELECT coalesce(sum(greatest(pendiente, 0)), 0) FROM (
               SELECT sum(CASE m.tipo WHEN 'despacho_a_movil' THEN m.cantidad
                                      WHEN 'consumo' THEN -m.cantidad
                                      WHEN 'devolucion_a_central' THEN -m.cantidad
                                      ELSE 0 END) AS pendiente
                 FROM movimiento_repuesto m
                WHERE m.id_orden = o.id
                GROUP BY m.id_repuesto) p)::int AS piezas_sin_conciliar,
            EXISTS (SELECT 1 FROM entrega en WHERE en.id_orden = o.id) AS tiene_entrega,
            o.cargo_visita::float AS cargo_visita,
            -- Pago de la visita: entradas de bitacora MARCADAS como pago al
            -- escribirlas (ver servicio-bitacora.ts), no comentarios sueltos.
            EXISTS (SELECT 1 FROM bitacora r
                     WHERE r.tabla = 'orden_servicio' AND r.id_registro = o.id
                       AND r.campo = 'bitacora.pago_registrado') AS pago_registrado,
            EXISTS (SELECT 1 FROM bitacora r JOIN bitacora c
                         ON c.tabla = 'orden_servicio' AND c.id_registro = r.id_registro
                        AND c.campo = 'bitacora.pago_confirmado'
                        AND c.id_usuario <> r.id_usuario AND c.momento >= r.momento
                     WHERE r.tabla = 'orden_servicio' AND r.id_registro = o.id
                       AND r.campo = 'bitacora.pago_registrado') AS pago_confirmado_por_otra
       FROM orden_servicio o WHERE o.id = $1
       ${bloquear ? 'FOR UPDATE OF o' : ''}`,
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

/**
 * Las dos columnas que el cerco por datos necesita, y nada mas.
 *
 * Existe aparte de `buscarPorId` porque el cerco se comprueba tambien desde
 * modulos que no van a armar la ficha entera —evidencias, transiciones— y
 * traer veinte columnas para mirar dos es trabajo que la base no tiene por
 * que hacer en cada peticion.
 */
export async function buscarCerco(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<{ id_tienda: string | null; id_tecnico: string | null; creado_por: string | null } | null> {
  const { rows } = await ejecutor.query<{
    id_tienda: string | null; id_tecnico: string | null; creado_por: string | null;
  }>(
    'SELECT id_tienda, id_tecnico, creado_por FROM orden_servicio WHERE id = $1', [idOrden],
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
    /**
     * El instante desde el que se cuenta el plazo. Se sella explicitamente,
     * en vez de dejar el `DEFAULT now()` de la tabla, porque el plazo se
     * calculo con el reloj de la aplicacion: si el inicio lo pusiera
     * PostgreSQL medio segundo despues, `plazo_vence_en` no seria
     * exactamente las horas laborables prometidas desde `fecha_estado_desde`,
     * y ese desfase se arrastraria a cada informe de cumplimiento.
     */
    momentoRecepcion: Date;
    /** Sucursal desde la que entra la solicitud. Puede no haberla. */
    idTienda: string | null;
  },
): Promise<{ id: string; numero: number; codigo: string }> {
  // El numero NO se envia: lo asigna la secuencia del servidor.
  const { rows } = await ejecutor.query<{ id: string; numero: number; codigo: string }>(
    `INSERT INTO orden_servicio
       (id, id_centro, id_cliente, id_articulo, modalidad, estado, tipo_garantia,
        id_regla_cobertura, id_responsable_actual, telefono_contacto, direccion_servicio,
        referencia_ubicacion, id_zona, id_tienda, cargo_visita, falla_reportada, plazo_vence_en,
        levantada_en_campo, creado_por, fecha_recepcion, fecha_estado_desde)
     VALUES (coalesce($1::uuid, uuid_generate_v4()), $2, $3, $4, $5::modalidad_servicio,
             'registrada', $6::tipo_garantia, $7, $8, $9, $10, $11, $12, $19, $13, $14, $15, $16,
             $17, $18, $18)
     RETURNING id, numero, codigo`,
    [datos.id, datos.idCentro, datos.idCliente, datos.idArticulo, datos.modalidad,
      datos.tipoGarantia, datos.idReglaCobertura, datos.idResponsableActual,
      datos.telefonoContacto, datos.direccionServicio, datos.referenciaUbicacion,
      datos.idZona, datos.cargoVisita, datos.fallaReportada, datos.plazoVenceEn,
      datos.levantadaEnCampo, datos.creadoPor, datos.momentoRecepcion, datos.idTienda],
  );
  return rows[0]!;
}

/** Una tienda desactivada no recibe ordenes nuevas, pero conserva las viejas. */
export async function tiendaActiva(
  idTienda: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<boolean> {
  const { rows } = await ejecutor.query<{ activa: boolean }>(
    'SELECT activa FROM tienda_origen WHERE id = $1',
    [idTienda],
  );
  return rows[0]?.activa === true;
}

/** El tecnico que tiene la orden ahora, con su nombre. Bloquea la orden. */
export async function tecnicoDeLaOrden(
  ejecutor: Ejecutor, idOrden: string,
): Promise<{ id: string; nombre: string } | null> {
  const { rows } = await ejecutor.query<{ id: string | null; nombre: string | null }>(
    `SELECT t.id, trim(u.nombres) AS nombre
       FROM orden_servicio o
       LEFT JOIN tecnico t ON t.id = o.id_tecnico
       LEFT JOIN usuario u ON u.id = t.id_usuario
      WHERE o.id = $1 FOR UPDATE OF o`,
    [idOrden],
  );
  const fila = rows[0];
  return fila === undefined || fila.id === null ? null : { id: fila.id, nombre: fila.nombre ?? '' };
}

export async function tecnicoActivo(
  ejecutor: Ejecutor, idTecnico: string,
): Promise<{ id: string; nombre: string } | null> {
  const { rows } = await ejecutor.query<{ id: string; nombre: string }>(
    `SELECT t.id, trim(u.nombres) AS nombre
       FROM tecnico t JOIN usuario u ON u.id = t.id_usuario
      WHERE t.id = $1 AND t.activo AND u.activo`,
    [idTecnico],
  );
  return rows[0] ?? null;
}

export async function asignarTecnico(
  ejecutor: Ejecutor, idOrden: string, idTecnico: string, modificadoPor: string,
  responsableEsElTecnico = false,
): Promise<void> {
  // Si el estado actual lo atiende el tecnico asignado, el responsable de
  // turno pasa a ser el nuevo tecnico. Antes quedaba el anterior, y el
  // tecnico al que se le quito la orden la seguia pudiendo mover.
  await ejecutor.query(
    `UPDATE orden_servicio
        SET id_tecnico = $2, modificado_en = now(), modificado_por = $3,
            id_responsable_actual = CASE WHEN $4::boolean
              THEN (SELECT id_usuario FROM tecnico WHERE id = $2) ELSE id_responsable_actual END
      WHERE id = $1`,
    [idOrden, idTecnico, modificadoPor, responsableEsElTecnico],
  );
}

export async function aplicarTransicion(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; estadoNuevo: string; plazoVenceEn: Date | null;
    idResponsableActual: string | null; modalidadNueva: string | null;
    motivoAnulacion: string | null; marcaEntrega: boolean; modificadoPor: string;
    /** El mismo instante con el que se calculo el plazo nuevo. */
    momentoCambio: Date;
    /**
     * Al cerrar, el plazo NO se borra: se conserva el ultimo vigente.
     *
     * Borrarlo perdia el unico registro de lo que se le prometio al cliente,
     * y sin el no habia forma de medir si el taller cumplio: el indicador de
     * cumplimiento salia 0 de 0 siempre. Conservarlo es inocuo porque todo
     * lo que pregunta "¿esta vencida?" ya excluye los estados finales.
     */
    conservarPlazo: boolean;
  },
): Promise<void> {
  await ejecutor.query(
    `UPDATE orden_servicio SET
        estado = $2::estado_orden,
        fecha_estado_desde = $9,
        plazo_vence_en = CASE WHEN $10::boolean THEN plazo_vence_en ELSE $3 END,
        id_responsable_actual = $4,
        modalidad = coalesce($5::modalidad_servicio, modalidad),
        motivo_anulacion = coalesce($6, motivo_anulacion),
        fecha_entrega = CASE WHEN $7::boolean THEN $9 ELSE fecha_entrega END,
        modificado_en = now(), modificado_por = $8
      WHERE id = $1`,
    [datos.idOrden, datos.estadoNuevo, datos.plazoVenceEn, datos.idResponsableActual,
      datos.modalidadNueva, datos.motivoAnulacion, datos.marcaEntrega, datos.modificadoPor,
      datos.momentoCambio, datos.conservarPlazo],
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
  activo: boolean; id_cliente_principal: string | null;
} | null> {
  const { rows } = await ejecutor.query<{
    telefono: string | null; detalle: string | null; referencia: string | null;
    id_zona: string | null; cargo_visita: number | null;
    activo: boolean; id_cliente_principal: string | null;
  }>(
    `SELECT c.activo, c.id_cliente_principal, tel.numero AS telefono, dir.detalle, dir.referencia, dir.id_zona, z.cargo_visita
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

// ── bitacora de la orden (asientos de la tabla bitacora) ─────────────────

interface FilaEntradaBitacora {
  readonly id: string; readonly id_registro: string; readonly campo: string;
  readonly valor_nuevo: string; readonly valor_anterior: string | null;
  readonly momento: Date; readonly id_usuario: string; readonly autor: string;
}

const TIPO_DE_CAMPO: Readonly<Record<string, EntradaBitacora['tipo']>> = {
  bitacora: 'comentario',
  'bitacora.pago_registrado': 'pago_registrado',
  'bitacora.pago_confirmado': 'pago_confirmado',
  'bitacora.correccion': 'correccion',
};

export async function insertarEntradaBitacora(
  ejecutor: Ejecutor,
  datos: { idOrden: string; campo: string; texto: string; referencia: string | null; idUsuario: string },
): Promise<string> {
  // El momento lo pone la base (DEFAULT now()); el autor, la sesion.
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO bitacora (tabla, id_registro, accion, campo, valor_anterior, valor_nuevo, id_usuario)
     VALUES ('orden_servicio', $1, 'crear', $2, $3, $4, $5) RETURNING id`,
    [datos.idOrden, datos.campo, datos.referencia, datos.texto, datos.idUsuario],
  );
  return rows[0]!.id;
}

export async function buscarEntradaBitacora(ejecutor: Ejecutor, id: string): Promise<EntradaBitacora | null> {
  const { rows } = await ejecutor.query<FilaEntradaBitacora>(
    `SELECT b.id, b.id_registro, b.campo, b.valor_nuevo, b.valor_anterior, b.momento, b.id_usuario,
            u.nombres AS autor
       FROM bitacora b JOIN usuario u ON u.id = b.id_usuario
      WHERE b.id = $1 AND b.tabla = 'orden_servicio' AND b.campo LIKE 'bitacora%'`,
    [id],
  );
  const fila = rows[0];
  if (fila === undefined) return null;
  return {
    id: fila.id,
    idOrden: fila.id_registro,
    tipo: TIPO_DE_CAMPO[fila.campo] ?? 'comentario',
    texto: fila.valor_nuevo,
    momento: fila.momento.toISOString(),
    idAutor: fila.id_usuario,
    autor: fila.autor.trim(),
    idEntradaCorregida: fila.campo === 'bitacora.correccion' ? fila.valor_anterior : null,
  };
}

/** Id de una entrada de bitacora de ESTA orden, o null. */
export async function entradaDeBitacora(
  ejecutor: Ejecutor, idOrden: string, idEntrada: string,
): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(idEntrada)) return null;
  const { rows } = await ejecutor.query<{ id: string }>(
    `SELECT id FROM bitacora
      WHERE id = $1 AND tabla = 'orden_servicio' AND id_registro = $2 AND campo LIKE 'bitacora%'`,
    [idEntrada, idOrden],
  );
  return rows[0]?.id ?? null;
}

export async function autoresDePagoRegistrado(ejecutor: Ejecutor, idOrden: string): Promise<string[]> {
  const { rows } = await ejecutor.query<{ id_usuario: string }>(
    `SELECT id_usuario FROM bitacora
      WHERE tabla = 'orden_servicio' AND id_registro = $1 AND campo = 'bitacora.pago_registrado'`,
    [idOrden],
  );
  return rows.map((fila) => fila.id_usuario);
}

// ── diagnostico y cotizacion desde el panel ─────────────────────────────

export interface FilaDatosDeTaller {
  readonly id: string; readonly estado: EstadoOrden; readonly tipo_garantia: string;
  readonly id_articulo: string; readonly id_cliente: string;
  readonly id_tecnico: string | null; readonly id_tienda: string | null; readonly creado_por: string | null;
  readonly tiene_diagnostico: boolean;
}

export async function datosDeTaller(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaDatosDeTaller | null> {
  const { rows } = await ejecutor.query<FilaDatosDeTaller>(
    `SELECT o.id, o.estado, o.tipo_garantia::text AS tipo_garantia, o.id_articulo, o.id_cliente,
            o.id_tecnico, o.id_tienda, o.creado_por,
            EXISTS (SELECT 1 FROM diagnostico d WHERE d.id_orden = o.id) AS tiene_diagnostico
       FROM orden_servicio o WHERE o.id = $1`,
    [idOrden],
  );
  return rows[0] ?? null;
}

export async function insertarDiagnosticoDelPanel(
  ejecutor: Ejecutor,
  datos: { idOrden: string; idTecnico: string; fallaReal: string; componente: string | null },
): Promise<string> {
  // Registrado en linea: momento del servidor y sin_conexion = false.
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO diagnostico (id_orden, id_tecnico, falla_real, componente, momento_dispositivo, registrado_sin_conexion)
     VALUES ($1, $2, $3, $4, now(), false) RETURNING id`,
    [datos.idOrden, datos.idTecnico, datos.fallaReal, datos.componente],
  );
  return rows[0]!.id;
}

export async function diagnosticosDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<DiagnosticoDeOrden[]> {
  const { rows } = await ejecutor.query<{
    id: string; falla_real: string; componente: string | null; momento: Date; tecnico: string;
  }>(
    `SELECT d.id, d.falla_real, d.componente, d.momento_dispositivo AS momento, u.nombres AS tecnico
       FROM diagnostico d JOIN tecnico t ON t.id = d.id_tecnico JOIN usuario u ON u.id = t.id_usuario
      WHERE d.id_orden = $1 ORDER BY d.momento_dispositivo`,
    [idOrden],
  );
  return rows.map((f) => ({
    id: f.id, fallaReal: f.falla_real, componente: f.componente,
    momento: f.momento.toISOString(), tecnico: f.tecnico.trim(),
  }));
}

export async function cotizacionesDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<CotizacionDeOrden[]> {
  const { rows } = await ejecutor.query<{
    id: string; mano_obra: string; total_repuestos: string; cargo_visita: string; total: string;
    aceptada: boolean | null; forma_aceptacion: string | null; momento_aceptacion: Date | null;
    creado_en: Date; registrado_por: string | null;
  }>(
    `SELECT c.id, c.mano_obra, c.total_repuestos, c.cargo_visita, c.total, c.aceptada,
            c.forma_aceptacion::text AS forma_aceptacion, c.momento_aceptacion, c.creado_en,
            u.nombres AS registrado_por
       FROM cotizacion c LEFT JOIN usuario u ON u.id = c.registrado_por
      WHERE c.id_orden = $1 ORDER BY c.creado_en`,
    [idOrden],
  );
  return rows.map((f) => ({
    id: f.id, manoObra: Number(f.mano_obra), totalRepuestos: Number(f.total_repuestos),
    cargoVisita: Number(f.cargo_visita), total: Number(f.total), aceptada: f.aceptada,
    formaAceptacion: f.forma_aceptacion, momentoAceptacion: f.momento_aceptacion?.toISOString() ?? null,
    creadoEn: f.creado_en.toISOString(), registradoPor: f.registrado_por?.trim() ?? null,
  }));
}

export async function cotizacionSinDecision(ejecutor: Ejecutor, idOrden: string): Promise<string | null> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `SELECT id FROM cotizacion WHERE id_orden = $1 AND aceptada IS NULL
      ORDER BY creado_en DESC LIMIT 1 FOR UPDATE`,
    [idOrden],
  );
  return rows[0]?.id ?? null;
}

export async function insertarCotizacion(
  ejecutor: Ejecutor,
  datos: { idOrden: string; manoObra: number; totalRepuestos: number; cargoVisita: number; total: number; registradoPor: string },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO cotizacion (id_orden, mano_obra, total_repuestos, cargo_visita, total, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [datos.idOrden, datos.manoObra, datos.totalRepuestos, datos.cargoVisita, datos.total, datos.registradoPor],
  );
  return rows[0]!.id;
}

export async function anotarDecisionDeCotizacion(
  ejecutor: Ejecutor, datos: { idCotizacion: string; aceptada: boolean; forma: string },
): Promise<void> {
  await ejecutor.query(
    `UPDATE cotizacion
        SET aceptada = $2, forma_aceptacion = $3::forma_aceptacion, momento_aceptacion = now()
      WHERE id = $1 AND aceptada IS NULL`,
    [datos.idCotizacion, datos.aceptada, datos.forma],
  );
}
