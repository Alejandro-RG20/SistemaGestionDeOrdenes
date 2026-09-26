/** Validacion de lo que entra al modulo de compras. */
import { z } from 'zod';
import { ESTADO_COMPRA, type EstadoCompra } from '@servitotal/compartido';

const estados = Object.values(ESTADO_COMPRA) as [EstadoCompra, ...EstadoCompra[]];

export const esquemaProveedor = z.object({
  codigo: z.string().trim().min(3, 'El codigo del proveedor es obligatorio.').max(30),
  nombre: z.string().trim().min(3, 'El nombre del proveedor es obligatorio.').max(160),
  contacto: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(40).optional(),
  correo: z.string().trim().email('El correo no tiene un formato valido.').max(160).optional(),
  direccion: z.string().trim().max(240).optional(),
  atiendeGarantias: z.boolean(),
});

export const esquemaFiltroCompras = z.object({
  estado: z.enum(estados).optional(),
  idProveedor: z.string().uuid().optional(),
});

/**
 * El precio unitario admite cero: a veces el proveedor manda la pieza de
 * reemplazo sin cargo por garantia, y esa entrada tiene que quedar
 * registrada igual. Lo que no admite es negativo.
 */
const precio = z.number().min(0, 'El precio no puede ser negativo.').max(2_000_000);
const cantidad = z.number().int('Las piezas se cuentan enteras.')
  .min(1, 'La cantidad tiene que ser al menos uno.')
  .max(10_000, 'Esa cantidad es demasiado alta; revise el dato.');

export const esquemaCrearCompra = z.object({
  idProveedor: z.string().uuid('El proveedor indicado no es valido.'),
  fechaEstimada: z.string().date('La fecha estimada no es valida.').optional(),
  observacion: z.string().trim().max(500).optional(),
  lineas: z.array(z.object({
    idRepuesto: z.string().uuid('El repuesto indicado no es valido.'),
    cantidad,
    precioUnitario: precio,
  })).min(1, 'Un pedido sin lineas no es un pedido.').max(200),
});

export const esquemaMoverCompra = z.object({
  hacia: z.enum(estados, { errorMap: () => ({ message: 'Ese estado de compra no existe.' }) }),
  motivoCancelacion: z.string().trim().min(5, 'Explique por que se cancela.').max(500).optional(),
});

export const esquemaRecibirCompra = z.object({
  idBodega: z.string().uuid('Indique a que bodega entra la mercaderia.'),
  lineas: z.array(z.object({
    idLinea: z.string().uuid(),
    // Cero es valido: es «de esta linea no llego nada todavia».
    cantidad: z.number().int().min(0).max(10_000),
  })).min(1, 'Indique que llego.'),
});
