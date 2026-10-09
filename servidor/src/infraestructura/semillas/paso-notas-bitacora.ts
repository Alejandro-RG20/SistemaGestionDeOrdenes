/**
 * Paso 13: notas de correccion y bitacora.
 *
 * Antes este paso tambien sembraba pagos y expedientes de cobro. El sistema
 * dejo de gestionar dinero (ver migracion 0023): lo que queda es lo que
 * explica que paso con cada orden y quien lo hizo.
 */
import type { PoolClient } from 'pg';
import { ACCION_BITACORA, CODIGO_ROL, ESTADO_ORDEN } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { comoFecha, sumarDias } from './aleatorio.js';
import { usuariosDe, type ContextoSiembra } from './contexto.js';
import type { ResumenOrden } from './paso-ordenes.js';

const MOTIVOS_CORRECCION: readonly (readonly [string, string])[] = [
  ['Numero de serie mal digitado', 'La placa dice otra serie; se tomo de nuevo la fotografia y se corrige aqui.'],
  ['Repuesto mal atribuido', 'El repuesto consumido correspondia a otra orden del mismo cliente.'],
  ['Falla real mal descrita', 'El diagnostico consigno el componente equivocado; la reparacion efectuada fue la correcta.'],
];

export async function sembrarNotasYBitacora(
  cliente: PoolClient,
  contexto: ContextoSiembra,
  ordenes: readonly ResumenOrden[],
): Promise<void> {
  const { azar } = contexto;
  const jefaturas = usuariosDe(contexto, CODIGO_ROL.JEFE_TECNICOS);

  const filasNota: unknown[][] = [];
  const filasBitacora: unknown[][] = [];

  for (const orden of ordenes) {
    const entregada = orden.estadoFinal === ESTADO_ORDEN.ENTREGADA;
    const momentoCierre = orden.momentos.at(-1)!;

    // RN-29: una orden cerrada no se edita; se le adjunta una nota.
    if (entregada && azar.booleano(0.015)) {
      const [motivo, detalle] = azar.elegir(MOTIVOS_CORRECCION);
      filasNota.push([
        azar.uuid(), orden.id, motivo, detalle, azar.elegir(jefaturas).id,
        sumarDias(momentoCierre, azar.entero(1, 30)),
      ]);
    }

    if (orden.estadoFinal === ESTADO_ORDEN.ANULADA) {
      filasBitacora.push([
        azar.uuid(), 'orden_servicio', orden.id, ACCION_BITACORA.ANULAR, 'estado',
        orden.estados.at(-2) ?? ESTADO_ORDEN.REGISTRADA, ESTADO_ORDEN.ANULADA,
        'Anulacion registrada con motivo', azar.elegir(jefaturas).id, momentoCierre,
      ]);
    }
  }

  // RN-24: cambiar un dato sensible del articulo exige jefatura y motivo escrito.
  for (const articulo of azar.barajar(contexto.articulos).slice(0, 220)) {
    filasBitacora.push([
      azar.uuid(), 'articulo', articulo.id, ACCION_BITACORA.MODIFICAR, 'fecha_compra',
      comoFecha(sumarDias(articulo.fechaCompra ?? contexto.inicioVentana, -45)),
      comoFecha(articulo.fechaCompra ?? contexto.inicioVentana),
      'El cliente presento la factura original con la fecha correcta',
      azar.elegir(jefaturas).id,
      azar.fechaEntre(contexto.inicioVentana, contexto.finVentana),
    ]);
  }

  await copiarFilas(cliente, 'nota_correccion',
    ['id', 'id_orden', 'motivo', 'detalle', 'creado_por', 'creado_en'], filasNota as never);
  await copiarFilas(cliente, 'bitacora',
    ['id', 'tabla', 'id_registro', 'accion', 'campo', 'valor_anterior', 'valor_nuevo', 'motivo',
      'id_usuario', 'momento'], filasBitacora as never);
}
