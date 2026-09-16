/** Filas de cobros y su traduccion a los contratos publicos. */
import type {
  DestinatarioExpediente, EstadoExpediente, EvidenciaPendiente, ModalidadServicio,
  RecuperacionPorMarca, RenglonDeReclamo, ResumenExpediente, ResumenPago, TipoGarantia,
} from '@servitotal/compartido';

export interface FilaExpediente {
  readonly id: string;
  readonly id_orden: string;
  readonly numero_orden: string;
  readonly destinatario: DestinatarioExpediente;
  readonly id_marca: string | null;
  readonly marca: string | null;
  readonly cliente: string;
  readonly articulo: string;
  readonly tipo_garantia: TipoGarantia;
  readonly monto_reclamado: string;
  readonly monto_cobrado: string | null;
  readonly estado: EstadoExpediente;
  readonly evidencia_completa: boolean;
  readonly fecha_envio: Date | null;
  readonly fecha_resultado: Date | null;
  readonly motivo_rechazo: string | null;
  readonly creado_en: Date;
}

export interface FilaDesgloseOrden {
  readonly id: string;
  readonly numero: string;
  readonly estado: string;
  readonly modalidad: ModalidadServicio;
  readonly tipo_garantia: TipoGarantia;
  readonly cargo_visita: string;
  readonly falla_reportada: string;
  readonly fecha_recepcion: Date;
  readonly fecha_entrega: Date | null;
  readonly id_marca: string;
  readonly mano_obra: string;
}

export interface FilaRenglon {
  readonly id_repuesto: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly cantidad: number;
  readonly precio_unitario: string;
  readonly importe: string;
}

export interface FilaEvidenciaFaltante {
  readonly clave: string;
  readonly etiqueta: string;
  readonly momento: string;
}

export interface FilaPago {
  readonly id: string;
  readonly id_orden: string;
  readonly numero_orden: string;
  readonly cliente: string;
  readonly monto: string;
  readonly forma_pago: string;
  readonly referencia: string | null;
  readonly registrado_por: string | null;
  readonly creado_en: Date;
}

export interface FilaRecuperacionMarca {
  readonly id_marca: string | null;
  readonly marca: string;
  readonly expedientes: string;
  readonly reclamado: string;
  readonly cobrado: string;
  readonly rechazados: string;
  readonly dias_promedio_respuesta: number | null;
}

/** Dias corridos desde el envio sin respuesta. Null si todavia no salio. */
function diasSinRespuesta(fila: FilaExpediente): number | null {
  if (fila.fecha_envio === null || fila.fecha_resultado !== null) return null;
  const transcurridos = (Date.now() - fila.fecha_envio.getTime()) / 86_400_000;
  return Math.max(0, Math.floor(transcurridos));
}

export function comoResumenExpediente(fila: FilaExpediente): ResumenExpediente {
  return {
    id: fila.id,
    idOrden: fila.id_orden,
    numeroOrden: Number(fila.numero_orden),
    destinatario: fila.destinatario,
    idMarca: fila.id_marca,
    marca: fila.marca,
    cliente: fila.cliente,
    articulo: fila.articulo,
    tipoGarantia: fila.tipo_garantia,
    montoReclamado: Number(fila.monto_reclamado),
    montoCobrado: fila.monto_cobrado === null ? null : Number(fila.monto_cobrado),
    estado: fila.estado,
    evidenciaCompleta: fila.evidencia_completa,
    fechaEnvio: fila.fecha_envio?.toISOString() ?? null,
    fechaResultado: fila.fecha_resultado?.toISOString() ?? null,
    motivoRechazo: fila.motivo_rechazo,
    diasSinRespuesta: diasSinRespuesta(fila),
    creadoEn: fila.creado_en.toISOString(),
  };
}

export function comoRenglon(fila: FilaRenglon): RenglonDeReclamo {
  return {
    idRepuesto: fila.id_repuesto,
    codigo: fila.codigo,
    descripcion: fila.descripcion,
    cantidad: fila.cantidad,
    precioUnitario: Number(fila.precio_unitario),
    importe: Number(fila.importe),
  };
}

export function comoEvidenciaPendiente(fila: FilaEvidenciaFaltante): EvidenciaPendiente {
  return { clave: fila.clave, etiqueta: fila.etiqueta, momento: fila.momento };
}

export function comoResumenPago(fila: FilaPago): ResumenPago {
  return {
    id: fila.id,
    idOrden: fila.id_orden,
    numeroOrden: Number(fila.numero_orden),
    cliente: fila.cliente,
    monto: Number(fila.monto),
    formaPago: fila.forma_pago,
    referencia: fila.referencia,
    registradoPor: fila.registrado_por,
    creadoEn: fila.creado_en.toISOString(),
  };
}

export function comoRecuperacion(fila: FilaRecuperacionMarca): RecuperacionPorMarca {
  const reclamado = Number(fila.reclamado);
  const cobrado = Number(fila.cobrado);
  return {
    idMarca: fila.id_marca,
    marca: fila.marca,
    expedientes: Number(fila.expedientes),
    reclamado,
    cobrado,
    // Sin nada reclamado la tasa es cero, no una division por cero.
    tasaRecuperacion: reclamado === 0 ? 0 : Math.round((cobrado / reclamado) * 1000) / 10,
    rechazados: Number(fila.rechazados),
    diasPromedioRespuesta: fila.dias_promedio_respuesta === null
      ? null
      : Math.round(fila.dias_promedio_respuesta * 10) / 10,
  };
}
