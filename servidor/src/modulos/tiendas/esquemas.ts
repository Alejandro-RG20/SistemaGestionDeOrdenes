/** Validacion de lo que entra al modulo de tiendas. */
import { z } from 'zod';

export const esquemaTienda = z.object({
  codigo: z.string().trim()
    .min(3, 'El codigo de la tienda es obligatorio: es lo que el personal dicta por telefono.')
    .max(30),
  nombre: z.string().trim().min(3, 'El nombre de la tienda es obligatorio.').max(160),
  direccion: z.string().trim().max(240).optional(),
  telefono: z.string().trim().max(40).optional(),
  /**
   * Decide si la garantia del proveedor aplica a lo comprado ahi. No es
   * una casilla decorativa: marcarla mal regala o niega garantias.
   */
  perteneceAlGrupo: z.boolean(),
});
