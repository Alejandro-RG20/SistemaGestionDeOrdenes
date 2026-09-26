/** Validacion de lo que entra al modulo de cobros. */
import { z } from 'zod';
import {
  DESTINATARIO_EXPEDIENTE, ESTADO_EXPEDIENTE, ESTADO_PAGO, FORMA_PAGO,
  type DestinatarioExpediente, type EstadoExpediente, type EstadoPago, type FormaPago,
} from '@servitotal/compartido';

const estados = Object.values(ESTADO_EXPEDIENTE) as [EstadoExpediente, ...EstadoExpediente[]];
const destinatarios = Object.values(DESTINATARIO_EXPEDIENTE) as
  [DestinatarioExpediente, ...DestinatarioExpediente[]];

/** Cordobas: dos decimales y un tope que atrapa el cero de mas. */
const monto = z.number()
  .min(0, 'El monto no puede ser negativo.')
  .max(2_000_000, 'El monto es demasiado alto; revise el dato.');

export const esquemaMoverExpediente = z.object({
  hacia: z.enum(estados, { errorMap: () => ({ message: 'Ese estado de expediente no existe.' }) }),
  motivoRechazo: z.string().trim().min(5, 'Explique por que lo rechazaron.').max(500).optional(),
  montoCobrado: monto.optional(),
});

const estadosPago = Object.values(ESTADO_PAGO) as [EstadoPago, ...EstadoPago[]];

export const esquemaCambiarEstadoPago = z.object({
  estado: z.enum(estadosPago, {
    errorMap: () => ({ message: 'Ese estado de pago no existe.' }),
  }),
  motivo: z.string().trim().min(5, 'Explique por que se anula el pago.').max(500).optional(),
});

export const esquemaRegistrarPago = z.object({
  monto: monto.refine((valor) => valor > 0, 'El pago tiene que ser mayor que cero.'),
  /**
   * Cerrada a las formas del pliego (RF-40). Antes era texto libre y eso
   * hacia imposible el reporte por forma de pago: «tarjeta», «Tarjeta» y
   * «tarj.» salian como tres columnas distintas. Ademas es lo que decide
   * si el pago nace confirmado.
   */
  formaPago: z.enum(
    Object.values(FORMA_PAGO) as [FormaPago, ...FormaPago[]],
    { errorMap: () => ({ message: 'Esa forma de pago no existe.' }) },
  ),
  referencia: z.string().trim().max(60).nullish(),
  idEvidencia: z.string().uuid('El comprobante indicado no es valido.').nullish(),
});

export const esquemaFiltroExpedientes = z.object({
  estado: z.enum(estados).optional(),
  destinatario: z.enum(destinatarios).optional(),
  idMarca: z.string().uuid('La marca indicada no es valida.').optional(),
  sinRespuestaDesdeDias: z.coerce.number().int().min(1).max(365).optional(),
});
