/** Validacion de lo que entra al modulo de cobros. */
import { z } from 'zod';
import {
  DESTINATARIO_EXPEDIENTE, ESTADO_EXPEDIENTE,
  type DestinatarioExpediente, type EstadoExpediente,
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

export const esquemaRegistrarPago = z.object({
  monto: monto.refine((valor) => valor > 0, 'El pago tiene que ser mayor que cero.'),
  formaPago: z.string().trim().min(3, 'Indique la forma de pago.').max(40),
  referencia: z.string().trim().max(60).nullish(),
  idEvidencia: z.string().uuid('El comprobante indicado no es valido.').nullish(),
});

export const esquemaFiltroExpedientes = z.object({
  estado: z.enum(estados).optional(),
  destinatario: z.enum(destinatarios).optional(),
  idMarca: z.string().uuid('La marca indicada no es valida.').optional(),
  sinRespuestaDesdeDias: z.coerce.number().int().min(1).max(365).optional(),
});
