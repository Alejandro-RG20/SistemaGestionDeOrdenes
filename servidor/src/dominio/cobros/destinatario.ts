/**
 * A quien se le cobra una reparacion.
 *
 * Tres tipos de garantia, tres bolsillos distintos, y el sistema no puede
 * confundirlos porque de eso vive el taller:
 *
 *  - `proveedor`  -> LA MARCA. El fabricante responde por el defecto.
 *  - `adicional`  -> LA POLIZA. La aseguradora de la garantia extendida.
 *  - `particular` -> EL CLIENTE. No hay expediente que conformar: se cobra
 *    en el mostrador y se registra un pago.
 *  - `por_validar` -> todavia nadie. Mientras la garantia no se resuelva no
 *    se sabe a quien reclamarle, y abrir el expediente antes solo garantiza
 *    tener que rehacerlo.
 */
import {
  DESTINATARIO_EXPEDIENTE, TIPO_GARANTIA,
  type DestinatarioExpediente, type TipoGarantia,
} from '@servitotal/compartido';

export interface VeredictoDestinatario {
  readonly reclamable: boolean;
  readonly destinatario?: DestinatarioExpediente;
  readonly motivo?: string;
}

export function destinatarioDe(tipoGarantia: TipoGarantia): VeredictoDestinatario {
  switch (tipoGarantia) {
    case TIPO_GARANTIA.PROVEEDOR:
      return { reclamable: true, destinatario: DESTINATARIO_EXPEDIENTE.PROVEEDOR };
    case TIPO_GARANTIA.ADICIONAL:
      return { reclamable: true, destinatario: DESTINATARIO_EXPEDIENTE.POLIZA };
    case TIPO_GARANTIA.PARTICULAR:
      return {
        reclamable: false,
        motivo: 'Esta reparacion la paga el cliente: no hay a quien reclamarle. ' +
          'Registre el pago en la orden.',
      };
    default:
      return {
        reclamable: false,
        motivo: 'La garantia de esta orden todavia esta por validar. Resuelvala primero: ' +
          'hasta entonces no se sabe si responde la marca, la poliza o el cliente.',
      };
  }
}
