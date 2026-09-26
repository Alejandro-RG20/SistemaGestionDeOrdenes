/** Validacion de lo que entra al modulo de entregas. */
import { z } from 'zod';

export const esquemaEntregar = z.object({
  /**
   * A quien se le puso el equipo en las manos. Es el dato que despues
   * sostiene la entrega si alguien reclama, asi que no admite iniciales.
   */
  recibidoPor: z.string().trim()
    .min(4, 'Escriba el nombre de quien retira el articulo.')
    .max(160),
  documentoReceptor: z.string().trim().min(4).max(40).optional(),
  esElCliente: z.boolean(),
  observacion: z.string().trim().max(500).optional(),
}).refine(
  // Si retira un tercero, su documento es lo unico que lo identifica.
  (datos) => datos.esElCliente || (datos.documentoReceptor ?? '').length >= 4,
  {
    path: ['documentoReceptor'],
    message: 'Si no retira el titular, anote el documento de quien lo hace.',
  },
);
