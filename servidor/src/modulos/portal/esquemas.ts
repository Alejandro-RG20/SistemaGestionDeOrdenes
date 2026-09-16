/** Validacion de la consulta publica. */
import { z } from 'zod';

export const esquemaConsultaPublica = z.object({
  numeroOrden: z.coerce.number()
    .int('El numero de orden debe ser un numero entero.')
    .min(1, 'El numero de orden no es valido.')
    .max(99_999_999, 'El numero de orden no es valido.'),
  // Se acepta con guiones, espacios o codigo de pais: los digitos se
  // normalizan despues. Pedirle un formato exacto a un cliente por telefono
  // es la forma mas rapida de que abandone la consulta.
  telefono: z.string().trim().min(7, 'Escriba el telefono con el que solicito el servicio.').max(30),
});
