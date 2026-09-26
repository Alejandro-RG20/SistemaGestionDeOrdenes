/** Validacion de lo que entra al modulo de reportes. */
import { z } from 'zod';

/**
 * La clave se valida contra un patron estrecho, no contra la lista, para
 * que un nombre inexistente de 404 con su mensaje y no un error de
 * validacion generico. Lo que importa aqui es que nunca llegue a la
 * consulta algo que no sea un identificador: las consultas se eligen por
 * clave, jamas se componen con texto de la peticion.
 */
export const esquemaConsultaReporte = z.object({
  clave: z.string().trim().regex(/^[a-z_]{3,60}$/, 'Ese reporte no existe.'),
  desde: z.string().datetime({ offset: true }).optional()
    .or(z.string().date().transform((fecha) => `${fecha}T00:00:00.000Z`)).optional(),
  hasta: z.string().datetime({ offset: true }).optional()
    .or(z.string().date().transform((fecha) => `${fecha}T00:00:00.000Z`)).optional(),
});
