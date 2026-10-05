/** Validacion de lo que entra al modulo de inventario. */
import { z } from 'zod';
import {
  ESTADO_SOLICITUD, TIPO_MOVIMIENTO, VIA_ABASTECIMIENTO,
  type EstadoSolicitud, type TipoMovimiento, type ViaAbastecimiento,
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

const estadosSolicitud = Object.values(ESTADO_SOLICITUD) as [EstadoSolicitud, ...EstadoSolicitud[]];

/**
 * Un paso del recorrido de la solicitud (pliego §26).
 *
 * `hacia` se valida contra el enumerado y NO contra la lista de pasos
 * posibles desde el estado actual: eso depende de la fila, no del cuerpo de
 * la peticion, y lo decide la maquina de estados en el servicio. Confundir
 * las dos cosas haria que un paso valido en general pero imposible aqui
 * respondiera 400 en vez de explicar por que.
 */
export const esquemaPasoSolicitud = z.object({
  hacia: z.enum(estadosSolicitud, { errorMap: () => ({ message: 'Ese paso de la solicitud no existe.' }) }),
  motivo: z.string().trim().max(500).nullish(),
  idBodegaOrigen: z.string().uuid('La bodega de origen no es valida.').nullish(),
});

/** El rango del kardex. Las dos fechas son opcionales y se validan sueltas. */
export const esquemaRangoKardex = z.object({
  desde: z.string().datetime({ message: 'La fecha de inicio no es valida.' }).optional(),
  hasta: z.string().datetime({ message: 'La fecha de fin no es valida.' }).optional(),
});
