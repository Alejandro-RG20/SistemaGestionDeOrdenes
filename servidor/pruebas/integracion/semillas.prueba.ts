/**
 * Comprueba el juego de datos de la etapa 1: los volumenes pedidos y los
 * invariantes que el resto del sistema dara por ciertos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { ESTADO_ORDEN } from '@servitotal/compartido';
import { prepararBaseDePruebas } from '../apoyo/base-de-pruebas.js';
import { CANTIDAD_ORDENES, REPARTO_ESTADOS } from '../../src/infraestructura/semillas/distribucion-estados.js';
import { CANTIDAD_CLIENTES } from '../../src/infraestructura/semillas/paso-clientes.js';
import { CANTIDAD_ARTICULOS } from '../../src/infraestructura/semillas/paso-articulos.js';

let piscina: Pool;
let cerrarPiscina: () => Promise<void>;

/** Primer valor de la primera fila, que es lo que devuelven todas estas consultas. */
async function escalar(sql: string): Promise<number> {
  const { rows } = await piscina.query<Record<string, string>>(sql);
  return Number(Object.values(rows[0] ?? { valor: '0' })[0]);
}

beforeAll(async () => {
  await prepararBaseDePruebas();
  const { aplicarMigraciones } = await import('../../src/infraestructura/migraciones/ejecutor.js');
  const conexion = await import('../../src/infraestructura/conexion.js');
  const { sembrar } = await import('../../src/infraestructura/semillas/sembrador.js');

  piscina = conexion.obtenerPiscina();
  cerrarPiscina = conexion.cerrarPiscina;
  await aplicarMigraciones();
  await sembrar({ semilla: 20260913 });
});

afterAll(async () => { await cerrarPiscina(); });

describe('volumenes sembrados', () => {
  it('siembra los 37 puestos del centro mas la cuenta de administracion', async () => {
    expect(await escalar('SELECT count(*) FROM usuario')).toBe(38);
    expect(await escalar("SELECT count(*) FROM tecnico WHERE tipo = 'ruta'")).toBe(8);
    expect(await escalar("SELECT count(*) FROM tecnico WHERE tipo = 'planta'")).toBe(8);
  });

  it('siembra 3 000 clientes, 5 000 articulos y 30 000 ordenes', async () => {
    expect(await escalar('SELECT count(*) FROM cliente')).toBe(CANTIDAD_CLIENTES);
    expect(await escalar('SELECT count(*) FROM articulo')).toBe(CANTIDAD_ARTICULOS);
    expect(await escalar('SELECT count(*) FROM orden_servicio')).toBe(CANTIDAD_ORDENES);
  });

  it('reparte las ordenes en los 13 estados segun lo previsto', async () => {
    const { rows } = await piscina.query<{ estado: string; total: string }>(
      'SELECT estado, count(*)::text AS total FROM orden_servicio GROUP BY estado',
    );
    expect(rows).toHaveLength(13);
    for (const fila of rows) {
      expect(Number(fila.total)).toBe(REPARTO_ESTADOS[fila.estado as keyof typeof REPARTO_ESTADOS]);
    }
  });

  it('siembra catalogo de repuestos, reglas de cobertura, plazos y evidencia', async () => {
    expect(await escalar('SELECT count(*) FROM repuesto')).toBeGreaterThan(200);
    expect(await escalar('SELECT count(*) FROM regla_cobertura')).toBeGreaterThan(20);
    expect(await escalar('SELECT count(*) FROM regla_plazo')).toBeGreaterThan(10);
    expect(await escalar('SELECT count(*) FROM regla_evidencia')).toBeGreaterThan(20);
    expect(await escalar('SELECT count(*) FROM checklist_item_plantilla')).toBeGreaterThan(15);
  });
});

describe('invariantes de la orden', () => {
  it('el numero correlativo lo asigno el servidor: unico y sin repetir', async () => {
    expect(await escalar('SELECT count(DISTINCT numero) FROM orden_servicio')).toBe(CANTIDAD_ORDENES);
    expect(await escalar('SELECT min(numero) FROM orden_servicio')).toBe(10_000);
  });

  it('toda orden tiene bitacora y su ultimo evento coincide con su estado', async () => {
    expect(await escalar(
      'SELECT count(*) FROM orden_servicio o WHERE NOT EXISTS (SELECT 1 FROM evento_orden e WHERE e.id_orden = o.id)',
    )).toBe(0);
    expect(await escalar(`
      SELECT count(*) FROM orden_servicio o
       WHERE o.estado IS DISTINCT FROM (
         SELECT e.estado_nuevo FROM evento_orden e
          WHERE e.id_orden = o.id ORDER BY e.momento DESC, e.id LIMIT 1)`)).toBe(0);
  });

  it('las ordenes convertidas conservan numero e historial de ruta', async () => {
    const convertidas = await escalar(`
      SELECT count(*) FROM orden_servicio o
       WHERE o.modalidad = 'taller'
         AND EXISTS (SELECT 1 FROM evento_orden e WHERE e.id_orden = o.id AND e.estado_nuevo = 'en_ruta')`);
    expect(convertidas).toBeGreaterThan(0);

    // Ninguna orden de ruta paso antes por la cola del taller: la conversion
    // es de ruta a taller, nunca a la inversa.
    expect(await escalar(`
      SELECT count(*) FROM orden_servicio o
       WHERE EXISTS (
         SELECT 1 FROM evento_orden ruta, evento_orden taller
          WHERE ruta.id_orden = o.id AND ruta.estado_nuevo = 'en_ruta'
            AND taller.id_orden = o.id AND taller.estado_nuevo = 'en_cola_taller'
            AND taller.momento < ruta.momento)`)).toBe(0);

    // Una orden que sigue en ruta nunca quedo marcada como de taller.
    expect(await escalar(
      "SELECT count(*) FROM orden_servicio WHERE estado = 'en_ruta' AND modalidad <> 'ruta'",
    )).toBe(0);
  });

  it('ninguna orden anulada carece de motivo y toda orden congelo su regla de cobertura', async () => {
    expect(await escalar(
      "SELECT count(*) FROM orden_servicio WHERE estado = 'anulada' AND motivo_anulacion IS NULL",
    )).toBe(0);
    expect(await escalar('SELECT count(*) FROM orden_servicio WHERE id_regla_cobertura IS NULL')).toBe(0);
    expect(await escalar("SELECT count(*) FROM orden_servicio WHERE telefono_contacto = ''")).toBe(0);
  });

  it('deja ordenes activas vencidas para el panel de jefaturas', async () => {
    const vencidas = await escalar('SELECT count(*) FROM v_orden_plazo WHERE vencida');
    expect(vencidas).toBeGreaterThan(0);
    expect(vencidas).toBeLessThan(await escalar('SELECT count(*) FROM v_orden_plazo'));
  });
});

describe('invariantes de agenda, evidencia e inventario', () => {
  it('no hay dos visitas vigentes del mismo tecnico en la misma franja', async () => {
    expect(await escalar(`
      SELECT count(*) FROM (
        SELECT 1 FROM visita WHERE vigente
         GROUP BY id_tecnico, fecha_programada, franja_horaria HAVING count(*) > 1) AS choques`)).toBe(0);
  });

  it('deja ordenes con evidencia obligatoria faltante, que es lo que bloquea el cobro', async () => {
    expect(await escalar('SELECT count(DISTINCT id_orden) FROM v_evidencia_faltante')).toBeGreaterThan(0);
    expect(await escalar(
      "SELECT count(*) FROM expediente_cobro WHERE estado = 'bloqueado_por_evidencia'",
    )).toBeGreaterThan(0);
    // Ningun expediente marcado completo tiene evidencia faltante.
    expect(await escalar(`
      SELECT count(*) FROM expediente_cobro e
       WHERE e.evidencia_completa
         AND EXISTS (SELECT 1 FROM v_evidencia_faltante f WHERE f.id_orden = e.id_orden)`)).toBe(0);
  });

  it('la existencia se puede reconstruir desde los movimientos', async () => {
    expect(await escalar(`
      WITH proyeccion AS (
        SELECT id_bodega, id_repuesto, sum(delta)::int AS cantidad FROM (
          SELECT id_bodega_destino AS id_bodega, id_repuesto,  cantidad AS delta
            FROM movimiento_repuesto WHERE id_bodega_destino IS NOT NULL
          UNION ALL
          SELECT id_bodega_origen  AS id_bodega, id_repuesto, -cantidad AS delta
            FROM movimiento_repuesto WHERE id_bodega_origen IS NOT NULL) AS s
        GROUP BY 1, 2)
      SELECT count(*) FROM proyeccion p
        FULL JOIN existencia e USING (id_bodega, id_repuesto)
       WHERE p.cantidad IS DISTINCT FROM e.cantidad`)).toBe(0);
  });

  it('todo consumo esta atado a una orden y todo ajuste lleva justificacion', async () => {
    expect(await escalar(
      "SELECT count(*) FROM movimiento_repuesto WHERE tipo = 'consumo' AND id_orden IS NULL",
    )).toBe(0);
    expect(await escalar(
      "SELECT count(*) FROM movimiento_repuesto WHERE tipo = 'ajuste' AND justificacion IS NULL",
    )).toBe(0);
  });

  it('cada bodega movil pertenece a un unico tecnico y la central a ninguno', async () => {
    expect(await escalar(
      "SELECT count(*) FROM bodega WHERE tipo = 'movil' AND id_tecnico IS NULL",
    )).toBe(0);
    expect(await escalar(
      "SELECT count(*) FROM bodega WHERE tipo = 'central' AND id_tecnico IS NOT NULL",
    )).toBe(0);
    expect(await escalar(`
      SELECT count(*) FROM (
        SELECT 1 FROM bodega WHERE tipo = 'movil' AND activa
         GROUP BY id_tecnico HAVING count(*) > 1) AS duplicadas`)).toBe(0);
  });

  it('las ordenes que esperan repuesto tienen una solicitud sin liberar', async () => {
    expect(await escalar(`
      SELECT count(*) FROM orden_servicio o
       WHERE o.estado = '${ESTADO_ORDEN.ESPERANDO_REPUESTO}'
         AND NOT EXISTS (
           SELECT 1 FROM solicitud_repuesto s WHERE s.id_orden = o.id AND NOT s.liberada)`)).toBe(0);
  });
});

describe('historico de datos vivos', () => {
  it('conserva telefonos y direcciones anteriores en lugar de borrarlos', async () => {
    expect(await escalar('SELECT count(*) FROM cliente_telefono WHERE NOT vigente')).toBeGreaterThan(0);
    expect(await escalar('SELECT count(*) FROM cliente_direccion WHERE NOT vigente')).toBeGreaterThan(0);
    // Un solo telefono vigente por numero y cliente: lo garantiza ux_telefono_vigente.
    expect(await escalar(`
      SELECT count(*) FROM (
        SELECT 1 FROM cliente_telefono WHERE vigente
         GROUP BY id_cliente, numero HAVING count(*) > 1) AS duplicados`)).toBe(0);
  });

  it('registra en bitacora los cambios de datos sensibles del articulo', async () => {
    expect(await escalar(
      "SELECT count(*) FROM bitacora WHERE tabla = 'articulo' AND campo = 'fecha_compra' AND motivo IS NOT NULL",
    )).toBeGreaterThan(0);
  });

  it('conserva integra la carga de lo que la sincronizacion rechazo', async () => {
    expect(await escalar('SELECT count(*) FROM excepcion_sincronizacion')).toBeGreaterThan(0);
    expect(await escalar(
      "SELECT count(*) FROM excepcion_sincronizacion WHERE carga_original::text = '{}'",
    )).toBe(0);
    expect(await escalar(
      "SELECT count(*) FROM excepcion_sincronizacion WHERE estado = 'pendiente'",
    )).toBeGreaterThan(0);
  });
});
