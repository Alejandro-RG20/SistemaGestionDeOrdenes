/**
 * Paso 13: pagos, expedientes de cobro, notas de correccion y bitacora.
 *
 * `evidencia_completa` no se inventa: se calcula con la misma vista
 * v_evidencia_faltante que usara el modulo de cobros, de modo que los
 * expedientes bloqueados de la siembra lo esten por una razon verificable.
 */
import type { PoolClient } from 'pg';
import {
  ACCION_BITACORA, CODIGO_ROL, DESTINATARIO_EXPEDIENTE, ESTADO_EXPEDIENTE,
  ESTADO_ORDEN, TIPO_GARANTIA,
} from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { comoFecha, sumarDias } from './aleatorio.js';
import { usuariosDe, type ContextoSiembra } from './contexto.js';
import type { ResumenOrden } from './paso-ordenes.js';

const FORMAS_PAGO = ['efectivo', 'tarjeta', 'transferencia'] as const;

/** Estados del expediente que implican que ya salio del centro. */
const ESTADOS_YA_ENVIADOS: readonly string[] = [
  ESTADO_EXPEDIENTE.ENVIADO, ESTADO_EXPEDIENTE.ACEPTADO,
  ESTADO_EXPEDIENTE.RECHAZADO, ESTADO_EXPEDIENTE.PAGADO,
];

const MOTIVOS_CORRECCION: readonly (readonly [string, string])[] = [
  ['Error de digitacion en el total', 'El total se registro con un cero de mas; el monto cobrado fue el de la cotizacion firmada.'],
  ['Repuesto mal atribuido', 'El repuesto consumido correspondia a otra orden del mismo cliente.'],
  ['Falla real mal descrita', 'El diagnostico consigno el componente equivocado; la reparacion efectuada fue la correcta.'],
];

export async function sembrarCobros(
  cliente: PoolClient,
  contexto: ContextoSiembra,
  ordenes: readonly ResumenOrden[],
): Promise<void> {
  const { azar } = contexto;
  const gestores = usuariosDe(contexto, CODIGO_ROL.GESTOR_COBROS);
  const jefaturas = usuariosDe(contexto, CODIGO_ROL.JEFE_TECNICOS);

  const filasPago: unknown[][] = [];
  const filasExpediente: unknown[][] = [];
  const filasNota: unknown[][] = [];
  const filasBitacora: unknown[][] = [];

  for (const orden of ordenes) {
    const entregada = orden.estadoFinal === ESTADO_ORDEN.ENTREGADA;
    const momentoCierre = orden.momentos.at(-1)!;

    if (entregada && orden.tipoGarantia === TIPO_GARANTIA.PARTICULAR) {
      filasPago.push([
        azar.uuid(), orden.id, azar.decimal(400, 12_000), azar.elegir(FORMAS_PAGO),
        `REC-${azar.entero(100_000, 999_999)}`, null, azar.elegir(gestores).id, momentoCierre,
      ]);
    }

    const cobrable = orden.tipoGarantia === TIPO_GARANTIA.PROVEEDOR || orden.tipoGarantia === TIPO_GARANTIA.ADICIONAL;
    if (entregada && cobrable) {
      const esProveedor = orden.tipoGarantia === TIPO_GARANTIA.PROVEEDOR;
      const estado = azar.elegirPonderado([
        [ESTADO_EXPEDIENTE.PAGADO, 46], [ESTADO_EXPEDIENTE.ACEPTADO, 14],
        [ESTADO_EXPEDIENTE.ENVIADO, 14], [ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR, 8],
        [ESTADO_EXPEDIENTE.EN_CONFORMACION, 12], [ESTADO_EXPEDIENTE.RECHAZADO, 6],
      ]);
      const enviado = ESTADOS_YA_ENVIADOS.includes(estado);
      const reclamado = azar.decimal(600, 14_000);
      const fechaEnvio = enviado ? sumarDias(momentoCierre, azar.entero(1, 15)) : null;

      filasExpediente.push([
        azar.uuid(), orden.id,
        esProveedor ? DESTINATARIO_EXPEDIENTE.PROVEEDOR : DESTINATARIO_EXPEDIENTE.POLIZA,
        esProveedor ? orden.idMarca : null,
        reclamado,
        estado === ESTADO_EXPEDIENTE.PAGADO ? azar.decimal(reclamado * 0.7, reclamado) : null,
        estado, false,
        fechaEnvio === null ? null : comoFecha(fechaEnvio),
        fechaEnvio === null ? null : comoFecha(sumarDias(fechaEnvio, azar.entero(5, 40))),
        estado === ESTADO_EXPEDIENTE.RECHAZADO ? 'Evidencia fotografica insuficiente segun el fabricante' : null,
        momentoCierre, azar.elegir(gestores).id,
      ]);
    }

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

  await copiarFilas(cliente, 'pago',
    ['id', 'id_orden', 'monto', 'forma_pago', 'referencia', 'id_evidencia', 'creado_por', 'creado_en'],
    filasPago as never);
  await copiarFilas(cliente, 'expediente_cobro',
    ['id', 'id_orden', 'destinatario', 'id_marca', 'monto_reclamado', 'monto_cobrado', 'estado',
      'evidencia_completa', 'fecha_envio', 'fecha_resultado', 'motivo_rechazo', 'creado_en', 'modificado_por'],
    filasExpediente as never);
  await copiarFilas(cliente, 'nota_correccion',
    ['id', 'id_orden', 'motivo', 'detalle', 'creado_por', 'creado_en'], filasNota as never);
  await copiarFilas(cliente, 'bitacora',
    ['id', 'tabla', 'id_registro', 'accion', 'campo', 'valor_anterior', 'valor_nuevo', 'motivo',
      'id_usuario', 'momento'], filasBitacora as never);

  await marcarEvidenciaCompleta(cliente);
}

/**
 * RF-57: el expediente solo esta completo si a su orden no le falta ninguna
 * evidencia obligatoria. Los que quedan incompletos pasan a bloqueado.
 */
async function marcarEvidenciaCompleta(cliente: PoolClient): Promise<void> {
  await cliente.query(`
    UPDATE expediente_cobro e
       SET evidencia_completa = NOT EXISTS (
             SELECT 1 FROM v_evidencia_faltante f WHERE f.id_orden = e.id_orden
           ),
           modificado_en = now()`);
  await cliente.query(`
    UPDATE expediente_cobro
       SET estado = '${ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA}'
     WHERE NOT evidencia_completa
       AND estado IN ('${ESTADO_EXPEDIENTE.EN_CONFORMACION}', '${ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR}')`);
}
