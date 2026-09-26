/** Validacion de la consulta publica. */
import { z } from 'zod';

export const esquemaConsultaPublica = z.object({
  /**
   * El codigo completo (`OS-2026-000123`) o el numero suelto.
   *
   * Se acepta en minusculas y con espacios alrededor porque quien lo
   * teclea en un celular va a escribirlo como pueda. Lo que NO se acepta
   * es cualquier otra cosa: el patron es estrecho a proposito, porque este
   * es el unico endpoint del sistema abierto sin sesion.
   */
  numeroOrden: z.string().trim()
    .min(1, 'Escriba el numero de orden de su comprobante.')
    .max(20, 'Ese numero de orden no es valido.')
    .refine(
      (valor) => /^\d{1,12}$/.test(valor) || /^OS-\d{4}-\d{6}$/i.test(valor),
      'Escriba el numero tal como aparece en su comprobante, por ejemplo OS-2026-000123.',
    ),
  // Se acepta con guiones, espacios o codigo de pais: los digitos se
  // normalizan despues. Pedirle un formato exacto a un cliente por telefono
  // es la forma mas rapida de que abandone la consulta.
  telefono: z.string().trim().min(7, 'Escriba el telefono con el que solicito el servicio.').max(30),
});
