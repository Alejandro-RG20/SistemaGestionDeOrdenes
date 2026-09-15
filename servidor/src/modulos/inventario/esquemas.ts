/** Validacion de lo que entra al modulo de inventario. */
import { z } from 'zod';
import {
  TIPO_MOVIMIENTO, VIA_ABASTECIMIENTO, type TipoMovimiento, type ViaAbastecimiento,
} from '@servitotal/compartido';

const tipos = Object.values(TIPO_MOVIMIENTO) as [TipoMovimiento, ...TipoMovimiento[]];
const vias = Object.values(VIA_ABASTECIMIENTO) as [ViaAbastecimiento, ...ViaAbastecimiento[]];

const cantidad = z.number()
  .int('La cantidad debe ser un numero entero.')
  .min(1, 'La cantidad debe ser mayor que cero.')
  .max(10_000, 'La cantidad es demasiado alta; revise el dato.');

export const esquemaMovimiento = z.object({
  idRepuesto: z.string().uuid('El repuesto indicado no es valido.'),
  tipo: z.enum(tipos, { errorMap: () => ({ message: 'El tipo de movimiento no existe.' }) }),
  idBodegaOrigen: z.string().uuid('La bodega de origen no es valida.').nullish(),
  idBodegaDestino: z.string().uuid('La bodega de destino no es valida.').nullish(),
  cantidad,
  precioUnitario: z.number().min(0).max(1_000_000).optional(),
  idOrden: z.string().uuid('La orden indicada no es valida.').nullish(),
  justificacion: z.string().trim().max(500).nullish(),
  momentoDispositivo: z.string().datetime({ message: 'El momento del dispositivo no es una fecha valida.' }).nullish(),
  registradoSinConexion: z.boolean().default(false),
});

export const esquemaConsumosDeOrden = z.object({
  consumos: z.array(z.object({
    idRepuesto: z.string().uuid('El repuesto indicado no es valido.'),
    cantidad,
    idBodegaOrigen: z.string().uuid('La bodega de origen no es valida.'),
    precioUnitario: z.number().min(0).max(1_000_000).optional(),
  })).min(1, 'Indique al menos un repuesto consumido.').max(50),
});

export const esquemaSolicitudRepuesto = z.object({
  idRepuesto: z.string().uuid('El repuesto indicado no es valido.'),
  cantidad,
  via: z.enum(vias, { errorMap: () => ({ message: 'La via de abastecimiento no es valida.' }) }).optional(),
  fechaEstimada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe venir como AAAA-MM-DD.').nullish(),
});
