/** Filas de orden y su traduccion a los contratos publicos. */
import { esEstadoFinal } from '@servitotal/compartido';
import type {
  EstadoOrden, EventoDeOrden, ModalidadServicio, NotaDeCorreccion, ResumenOrden, TipoGarantia,
} from '@servitotal/compartido';

export interface FilaOrden {
  readonly id: string;
  readonly numero: number;
  readonly estado: EstadoOrden;
  readonly modalidad: ModalidadServicio;
  readonly tipo_garantia: TipoGarantia;
  readonly id_cliente: string;
  readonly cliente: string;
  readonly id_articulo: string;
  readonly articulo: string;
  readonly id_tecnico: string | null;
  readonly tecnico: string | null;
  readonly responsable_actual: string | null;
  readonly falla_reportada: string;
  readonly fecha_recepcion: Date;
  readonly fecha_estado_desde: Date;
  readonly plazo_vence_en: Date | null;
  readonly horas_alerta: number | null;
  readonly total: number;
}

export interface FilaOrdenCompleta extends FilaOrden {
  readonly telefono_contacto: string;
  readonly direccion_servicio: string | null;
  readonly referencia_ubicacion: string | null;
  readonly id_zona: string | null;
  readonly zona: string | null;
  readonly cargo_visita: number;
  readonly id_regla_cobertura: string | null;
  readonly levantada_en_campo: boolean;
  readonly motivo_anulacion: string | null;
  readonly fecha_entrega: Date | null;
}

export interface FilaEvento {
  readonly id: string;
  readonly estado_anterior: EstadoOrden | null;
  readonly estado_nuevo: EstadoOrden;
  readonly responsable: string | null;
  readonly momento: Date;
  readonly momento_dispositivo: Date | null;
  readonly registrado_sin_conexion: boolean;
  readonly observacion: string | null;
}

export interface FilaNota {
  readonly id: string;
  readonly motivo: string;
  readonly detalle: string;
  readonly autor: string;
  readonly creado_en: Date;
}

/**
 * `horasParaVencer` y las banderas las calcula el servicio con el
 * calendario laboral, porque son horas laborables y eso es una regla de
 * negocio que no baja a la base.
 */
export function aResumenOrden(
  fila: FilaOrden,
  horasParaVencer: number | null,
): ResumenOrden {
  return {
    id: fila.id,
    numero: fila.numero,
    estado: fila.estado,
    modalidad: fila.modalidad,
    tipoGarantia: fila.tipo_garantia,
    idCliente: fila.id_cliente,
    cliente: fila.cliente,
    idArticulo: fila.id_articulo,
    articulo: fila.articulo,
    idTecnico: fila.id_tecnico,
    tecnico: fila.tecnico,
    responsableActual: fila.responsable_actual,
    fallaReportada: fila.falla_reportada,
    fechaRecepcion: fila.fecha_recepcion.toISOString(),
    fechaEstadoDesde: fila.fecha_estado_desde.toISOString(),
    plazoVenceEn: fila.plazo_vence_en?.toISOString() ?? null,
    horasParaVencer,
    // Una orden cerrada conserva el plazo que estaba vigente al cerrarse
    // —es el registro de lo prometido, y contra el se mide el
    // cumplimiento—, pero NO esta vencida: ya no corre nada. Sin esta
    // condicion, cada orden entregada hace un ano figuraria en rojo.
    vencida: !esEstadoFinal(fila.estado) && horasParaVencer !== null && horasParaVencer < 0,
    enAlerta: !esEstadoFinal(fila.estado)
      && horasParaVencer !== null && horasParaVencer >= 0
      && fila.horas_alerta !== null && horasParaVencer <= fila.horas_alerta,
    total: Number(fila.total),
  };
}

export function aEvento(fila: FilaEvento): EventoDeOrden {
  return {
    id: fila.id,
    estadoAnterior: fila.estado_anterior,
    estadoNuevo: fila.estado_nuevo,
    responsable: fila.responsable,
    momento: fila.momento.toISOString(),
    momentoDispositivo: fila.momento_dispositivo?.toISOString() ?? null,
    registradoSinConexion: fila.registrado_sin_conexion,
    observacion: fila.observacion,
  };
}

export function aNota(fila: FilaNota): NotaDeCorreccion {
  return {
    id: fila.id, motivo: fila.motivo, detalle: fila.detalle,
    autor: fila.autor, creadoEn: fila.creado_en.toISOString(),
  };
}
