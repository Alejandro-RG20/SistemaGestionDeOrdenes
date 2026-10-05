/**
 * El kardex: los movimientos de un repuesto con su saldo corrido.
 *
 * EL SALDO SE CALCULA, NO SE GUARDA
 *
 * No hay columna de saldo en ninguna tabla y no debe haberla. El saldo es la
 * suma de los movimientos anteriores, y una columna que lo guardara seria un
 * segundo lugar donde la verdad puede quedar desfasada —exactamente el
 * problema que `existencia` ya tiene resuelto actualizandose en la misma
 * transaccion que el movimiento—. Aqui se calcula con una funcion de ventana
 * en la base, que es donde estan los datos.
 *
 * EL SIGNO DEPENDE DE LA BODEGA QUE SE CONSULTA
 *
 * El mismo movimiento es una salida para la bodega central y una entrada
 * para la movil. Por eso el signo no se deduce del tipo de movimiento sino
 * de comparar las bodegas del movimiento con la que se esta mirando. Asi la
 * regla es una sola y vale para los seis tipos, incluido el ajuste, que
 * lleva la bodega en origen si falta y en destino si sobra.
 *
 * Sin bodega, el kardex es del centro completo: entra lo que entro de
 * afuera, sale lo que se consumio, y los traslados internos no mueven el
 * saldo porque no mueven nada hacia afuera.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaKardex {
  readonly id: string;
  readonly momento: Date;
  readonly tipo: string;
  readonly bodega_origen: string | null;
  readonly bodega_destino: string | null;
  readonly entrada: number;
  readonly salida: number;
  readonly saldo: number;
  readonly precio_unitario: string;
  readonly codigo_orden: string | null;
  readonly responsable: string | null;
  readonly justificacion: string | null;
}

/**
 * Entrada y salida segun la bodega consultada.
 *
 * Con bodega ($2): entra lo que llega a ella, sale lo que la deja.
 * Sin bodega: entra lo que viene de fuera del centro —origen nulo— y sale
 * lo que se va del centro —destino nulo—; un traslado entre dos bodegas
 * propias tiene las dos y por tanto no mueve el saldo.
 */
const MOVIDO = `
  CASE
    WHEN $2::uuid IS NOT NULL THEN
      CASE WHEN m.id_bodega_destino = $2 THEN m.cantidad ELSE 0 END
    ELSE
      CASE WHEN m.id_bodega_origen IS NULL THEN m.cantidad ELSE 0 END
  END AS entrada,
  CASE
    WHEN $2::uuid IS NOT NULL THEN
      CASE WHEN m.id_bodega_origen = $2 THEN m.cantidad ELSE 0 END
    ELSE
      CASE WHEN m.id_bodega_destino IS NULL THEN m.cantidad ELSE 0 END
  END AS salida`;

export interface FiltroKardex {
  readonly idRepuesto: string;
  readonly idBodega?: string | undefined;
  readonly desde?: string | undefined;
  readonly hasta?: string | undefined;
}

function parametros(filtro: FiltroKardex): unknown[] {
  return [
    filtro.idRepuesto, filtro.idBodega ?? null,
    filtro.desde ?? null, filtro.hasta ?? null,
  ];
}

/**
 * El saldo que el repuesto tenia ANTES del rango consultado.
 *
 * Se pide aparte porque sin el la primera linea del kardex de marzo
 * arrancaria en cero, como si el repuesto hubiera nacido ese mes.
 *
 * Sin `desde` devuelve cero, y es correcto: un kardex sin fecha de inicio
 * empieza en el primer movimiento que existio, y antes de ese no habia nada.
 */
export async function saldoAnterior(
  filtro: FiltroKardex, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ saldo: string }>(
    `SELECT coalesce(sum(movido.entrada - movido.salida), 0)::text AS saldo
       FROM (SELECT ${MOVIDO}
               FROM movimiento_repuesto m
              WHERE m.id_repuesto = $1
                AND ($2::uuid IS NULL
                     OR m.id_bodega_origen = $2 OR m.id_bodega_destino = $2)
                -- Sin fecha de inicio no hay nada «antes»: la condicion es
                -- falsa para todas las filas y la suma queda en cero.
                AND $3::timestamptz IS NOT NULL
                AND m.creado_en < $3) AS movido`,
    /*
     * Solo los tres primeros: aqui no entra `hasta`. Lo que esta DESPUES del
     * rango no cambia lo que habia ANTES, y pasar un parametro que la
     * consulta no nombra hace que el servidor rechace la peticion entera.
     */
    parametros(filtro).slice(0, 3),
  );
  return Number(rows[0]?.saldo ?? 0);
}

export async function listar(
  filtro: FiltroKardex, saldoInicial: number,
  limite: number, desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaKardex[]> {
  const { rows } = await ejecutor.query<FilaKardex>(
    `WITH movido AS (
       SELECT m.id, m.creado_en AS momento, m.tipo::text AS tipo,
              bo.nombre AS bodega_origen, bd.nombre AS bodega_destino,
              m.precio_unitario, o.codigo AS codigo_orden,
              u.nombres AS responsable, m.justificacion,
              ${MOVIDO}
         FROM movimiento_repuesto m
              LEFT JOIN bodega bo ON bo.id = m.id_bodega_origen
              LEFT JOIN bodega bd ON bd.id = m.id_bodega_destino
              LEFT JOIN orden_servicio o ON o.id = m.id_orden
              LEFT JOIN usuario u ON u.id = m.id_responsable
        WHERE m.id_repuesto = $1
          AND ($2::uuid IS NULL
               OR m.id_bodega_origen = $2 OR m.id_bodega_destino = $2)
          AND ($3::timestamptz IS NULL OR m.creado_en >= $3)
          AND ($4::timestamptz IS NULL OR m.creado_en <= $4)
     )
     SELECT id, momento, tipo, bodega_origen, bodega_destino,
            entrada::int AS entrada, salida::int AS salida,
            precio_unitario::text AS precio_unitario,
            codigo_orden, responsable, justificacion,
            ($5::int + sum(entrada - salida)
               OVER (ORDER BY momento, id ROWS UNBOUNDED PRECEDING))::int AS saldo
       FROM movido
      ORDER BY momento, id
      LIMIT $6 OFFSET $7`,
    [...parametros(filtro), saldoInicial, limite, desplazamiento],
  );
  return rows;
}

export async function contar(
  filtro: FiltroKardex, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM movimiento_repuesto m
      WHERE m.id_repuesto = $1
        AND ($2::uuid IS NULL
             OR m.id_bodega_origen = $2 OR m.id_bodega_destino = $2)
        AND ($3::timestamptz IS NULL OR m.creado_en >= $3)
        AND ($4::timestamptz IS NULL OR m.creado_en <= $4)`,
    parametros(filtro),
  );
  return Number(rows[0]?.total ?? 0);
}
