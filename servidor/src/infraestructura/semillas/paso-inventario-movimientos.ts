/**
 * Paso 12: movimientos de repuesto, solicitudes y proyeccion de existencias.
 *
 * Los movimientos son la fuente de verdad; `existencia` se reconstruye a
 * partir de ellos al final del paso, con la misma cuenta que usara el
 * modulo de inventario: +cantidad a la bodega destino, -cantidad a la
 * bodega origen.
 *
 * La siembra genera primero los consumos y despues el abastecimiento que
 * los cubre. Asi ninguna existencia queda negativa, que es lo que exige el
 * CHECK de la tabla.
 */
import type { PoolClient } from 'pg';
import { CODIGO_ROL, ESTADO_ORDEN, TIPO_BODEGA, TIPO_MOVIMIENTO, TIPO_GARANTIA } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { comoFecha, sumarDias, sumarHoras } from './aleatorio.js';
import { usuariosDe, type ContextoSiembra } from './contexto.js';
import type { ResumenOrden } from './paso-ordenes.js';

const PROBABILIDAD_CONSUMO = 0.62;
const COLCHON_MINIMO = 2;
const COLCHON_MAXIMO = 14;

const JUSTIFICACIONES = [
  'Conteo fisico: se encontraron unidades no registradas',
  'Conteo fisico: faltante detectado en el inventario trimestral',
  'Correccion de un ingreso digitado con cantidad equivocada',
] as const;

export async function sembrarMovimientos(
  cliente: PoolClient,
  contexto: ContextoSiembra,
  ordenes: readonly ResumenOrden[],
): Promise<void> {
  const { azar } = contexto;
  const bodegueros = usuariosDe(contexto, CODIGO_ROL.BODEGUERO);
  const bodegaPorTecnico = new Map(
    contexto.bodegas.filter((b) => b.tipo === TIPO_BODEGA.MOVIL).map((b) => [b.idTecnico!, b.id]),
  );

  const movimientos: unknown[][] = [];
  const solicitudes: unknown[][] = [];
  /** Unidades que hay que reponer, por bodega y repuesto. */
  const necesidad = new Map<string, number>();
  const anotar = (idBodega: string, idRepuesto: string, cantidad: number): void => {
    const llave = `${idBodega}|${idRepuesto}`;
    necesidad.set(llave, (necesidad.get(llave) ?? 0) + cantidad);
  };

  // ── 1. Consumos: cada uno queda atado a la orden que lo consumio (RN-12) ──
  for (const orden of ordenes) {
    const posicionReparacion = orden.estados.indexOf(ESTADO_ORDEN.EN_REPARACION);
    const esperoRepuesto = orden.estados.includes(ESTADO_ORDEN.ESPERANDO_REPUESTO);

    if (posicionReparacion >= 0 && orden.tecnico !== null && azar.booleano(PROBABILIDAD_CONSUMO)) {
      const momento = orden.momentos[posicionReparacion]!;
      const enRuta = orden.nacioEnRuta && !orden.convertida && orden.tecnico.tipo === 'ruta';
      const idBodega = enRuta
        ? bodegaPorTecnico.get(orden.tecnico.id) ?? contexto.idBodegaCentral
        : contexto.idBodegaCentral;

      for (const repuesto of azar.barajar(contexto.repuestos).slice(0, azar.entero(1, 3))) {
        const cantidad = azar.entero(1, 2);
        anotar(idBodega, repuesto.id, cantidad);
        movimientos.push([
          azar.uuid(), repuesto.id, TIPO_MOVIMIENTO.CONSUMO, idBodega, null, cantidad,
          // Precio congelado en el momento del consumo, no el de hoy.
          azar.decimal(repuesto.precio * 0.85, repuesto.precio, 2),
          orden.id, orden.tecnico.idUsuario, null,
          enRuta ? sumarHoras(momento, -azar.decimal(0.5, 4, 1)) : null, enRuta, momento,
        ]);
      }

      // H7: la pieza retirada del articulo vuelve al centro, a su propia bodega.
      if (orden.tipoGarantia !== TIPO_GARANTIA.PARTICULAR && azar.booleano(0.4)) {
        const repuesto = azar.elegir(contexto.repuestos);
        movimientos.push([
          azar.uuid(), repuesto.id, TIPO_MOVIMIENTO.DEVOLUCION_PIEZA_SUSTITUIDA,
          null, contexto.idBodegaPiezasSustituidas, 1, 0, orden.id,
          orden.tecnico.idUsuario, 'Pieza retirada del articulo, resguardada para el fabricante',
          null, false, sumarHoras(momento, 1),
        ]);
      }
    }

    // ── solicitudes de repuesto: sostienen el estado esperando_repuesto ──
    if (!esperoRepuesto) continue;
    const posicionEspera = orden.estados.indexOf(ESTADO_ORDEN.ESPERANDO_REPUESTO);
    const momentoEspera = orden.momentos[posicionEspera]!;
    const pendiente = orden.estadoFinal === ESTADO_ORDEN.ESPERANDO_REPUESTO;
    const repuesto = azar.elegir(contexto.repuestos);
    solicitudes.push([
      azar.uuid(), orden.id, repuesto.id, azar.entero(1, 2), repuesto.viaAbastecimiento,
      comoFecha(momentoEspera), comoFecha(sumarDias(momentoEspera, azar.entero(3, 21))),
      pendiente ? null : comoFecha(sumarDias(momentoEspera, azar.entero(2, 18))),
      !pendiente, azar.elegir(bodegueros).id,
    ]);
  }

  // ── 2. Devoluciones de bodega movil a central ──
  for (const bodega of contexto.bodegas.filter((b) => b.tipo === TIPO_BODEGA.MOVIL)) {
    for (const repuesto of azar.barajar(contexto.repuestos).slice(0, 6)) {
      const cantidad = azar.entero(1, 3);
      anotar(bodega.id, repuesto.id, cantidad);
      movimientos.push([
        azar.uuid(), repuesto.id, TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL, bodega.id,
        contexto.idBodegaCentral, cantidad, repuesto.precio, null,
        azar.elegir(bodegueros).id, 'Repuesto no utilizado en la ruta', null, false,
        azar.fechaEntre(contexto.inicioVentana, contexto.finVentana),
      ]);
    }
  }

  // ── 3. Despachos a las bodegas moviles que cubren lo consumido y devuelto ──
  const necesidadCentral = new Map<string, number>();
  for (const [llave, cantidad] of necesidad) {
    const [idBodega, idRepuesto] = llave.split('|') as [string, string];
    if (idBodega === contexto.idBodegaCentral) {
      necesidadCentral.set(idRepuesto, (necesidadCentral.get(idRepuesto) ?? 0) + cantidad);
      continue;
    }
    const despachado = cantidad + azar.entero(COLCHON_MINIMO, COLCHON_MAXIMO);
    necesidadCentral.set(idRepuesto, (necesidadCentral.get(idRepuesto) ?? 0) + despachado);
    const repuesto = contexto.repuestos.find((r) => r.id === idRepuesto)!;
    movimientos.push([
      azar.uuid(), idRepuesto, TIPO_MOVIMIENTO.DESPACHO_A_MOVIL, contexto.idBodegaCentral,
      idBodega, despachado, repuesto.precio, null, azar.elegir(bodegueros).id,
      null, null, false, azar.fechaEntre(contexto.inicioVentana, contexto.finVentana),
    ]);
  }

  // ── 4. Ingresos a la central que cubren consumos y despachos ──
  for (const repuesto of contexto.repuestos) {
    const requerido = necesidadCentral.get(repuesto.id) ?? 0;
    const ingresado = requerido + azar.entero(COLCHON_MINIMO, COLCHON_MAXIMO);
    movimientos.push([
      azar.uuid(), repuesto.id, TIPO_MOVIMIENTO.INGRESO, null, contexto.idBodegaCentral,
      ingresado, repuesto.precio, null, azar.elegir(bodegueros).id, null, null, false,
      sumarDias(contexto.inicioVentana, -azar.entero(1, 30)),
    ]);

    // H8: un movimiento no se edita, se corrige con un ajuste justificado.
    if (azar.booleano(0.1)) {
      movimientos.push([
        azar.uuid(), repuesto.id, TIPO_MOVIMIENTO.AJUSTE, null, contexto.idBodegaCentral,
        azar.entero(1, 3), repuesto.precio, null, azar.elegir(bodegueros).id,
        azar.elegir(JUSTIFICACIONES), null, false,
        azar.fechaEntre(contexto.inicioVentana, contexto.finVentana),
      ]);
    }
  }

  await copiarFilas(
    cliente,
    'movimiento_repuesto',
    ['id', 'id_repuesto', 'tipo', 'id_bodega_origen', 'id_bodega_destino', 'cantidad',
      'precio_unitario', 'id_orden', 'id_responsable', 'justificacion', 'momento_dispositivo',
      'registrado_sin_conexion', 'creado_en'],
    movimientos as never,
  );
  await copiarFilas(
    cliente,
    'solicitud_repuesto',
    ['id', 'id_orden', 'id_repuesto', 'cantidad', 'via', 'fecha_solicitud', 'fecha_estimada',
      'fecha_ingreso', 'liberada', 'creado_por'],
    solicitudes as never,
  );

  await proyectarExistencias(cliente);
}

/**
 * Reconstruye `existencia` desde `movimiento_repuesto`. Es exactamente la
 * operacion que debe poder repetirse en cualquier momento para auditar la
 * proyeccion (H8).
 */
export async function proyectarExistencias(cliente: PoolClient): Promise<void> {
  await cliente.query('DELETE FROM existencia');
  await cliente.query(`
    INSERT INTO existencia (id_bodega, id_repuesto, cantidad, actualizado_en)
    SELECT id_bodega, id_repuesto, SUM(delta)::integer, now()
    FROM (
      SELECT id_bodega_destino AS id_bodega, id_repuesto,  cantidad AS delta
        FROM movimiento_repuesto WHERE id_bodega_destino IS NOT NULL
      UNION ALL
      SELECT id_bodega_origen  AS id_bodega, id_repuesto, -cantidad AS delta
        FROM movimiento_repuesto WHERE id_bodega_origen IS NOT NULL
    ) AS saldo
    GROUP BY id_bodega, id_repuesto`);
}
