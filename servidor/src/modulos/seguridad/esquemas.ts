/**
 * Validacion de todo lo que entra por la API del modulo de seguridad.
 * Los mensajes estan escritos para quien usa el sistema, no para quien lo
 * programo.
 */
import { z } from 'zod';
import { CODIGO_ROL, type CodigoRol } from '@servitotal/compartido';
import { ErrorValidacion } from '../../comun/errores.js';

// Tipado como tupla de CodigoRol para que lo validado ya sea del tipo del
// contrato compartido, y no un string suelto que haya que castear despues.
const codigosRol = Object.values(CODIGO_ROL) as [CodigoRol, ...CodigoRol[]];

const nombreUsuario = z.string()
  .trim()
  .min(3, 'El nombre de usuario debe tener al menos 3 caracteres.')
  .max(40, 'El nombre de usuario no puede pasar de 40 caracteres.')
  .regex(/^[a-z0-9._-]+$/, 'El nombre de usuario solo admite minusculas, numeros, punto, guion y guion bajo.');

const contrasena = z.string()
  .min(10, 'La contrasena debe tener al menos 10 caracteres.')
  .max(128, 'La contrasena no puede pasar de 128 caracteres.');

const motivo = z.string()
  .trim()
  .min(10, 'Escriba el motivo: al menos 10 caracteres. Queda registrado en la bitacora.')
  .max(500, 'El motivo no puede pasar de 500 caracteres.');

export const esquemaIniciarSesion = z.object({
  nombreUsuario: z.string().trim().min(1, 'Indique su nombre de usuario.'),
  contrasena: z.string().min(1, 'Indique su contrasena.'),
  identificadorDispositivo: z.string().trim().min(1).max(120).optional(),
});

export const esquemaRefrescar = z.object({
  tokenRefresco: z.string().min(1, 'Falta la credencial de refresco.'),
});

export const esquemaCrearUsuario = z.object({
  nombreUsuario,
  nombres: z.string().trim().min(3, 'Escriba el nombre completo de la persona.').max(120),
  contrasena,
  codigoRol: z.enum(codigosRol, { errorMap: () => ({ message: 'El rol indicado no existe.' }) }),
  correo: z.string().trim().email('El correo no tiene un formato valido.').max(150).nullish(),
});

export const esquemaActualizarUsuario = z.object({
  nombres: z.string().trim().min(3).max(120).optional(),
  correo: z.string().trim().email('El correo no tiene un formato valido.').max(150).nullish(),
  codigoRol: z.enum(codigosRol, { errorMap: () => ({ message: 'El rol indicado no existe.' }) }).optional(),
}).refine(
  (valor) => Object.values(valor).some((campo) => campo !== undefined),
  { message: 'No se indico ningun cambio.' },
);

export const esquemaCambiarContrasena = z.object({ contrasena });
export const esquemaMotivo = z.object({ motivo });

export const esquemaAsignarPermisos = z.object({
  codigosPermiso: z.array(z.string().trim().min(1)).max(200),
  motivo,
});

export const esquemaVincularDispositivo = z.object({
  idUsuario: z.string().uuid('El identificador de usuario no es valido.'),
  identificador: z.string().trim().min(3, 'Indique el identificador del dispositivo.').max(120),
  modelo: z.string().trim().max(120).nullish(),
});

export const esquemaIdentificador = z.string().uuid('El identificador indicado no es valido.');

/**
 * Valida y devuelve el dato tipado. Traduce el fallo de Zod al error de
 * validacion propio, con un mensaje por campo.
 *
 * El tipo se toma de la SALIDA del esquema, no de su entrada: asi un campo
 * con `.default(...)` o `.transform(...)` llega al servicio ya resuelto y
 * obligatorio, que es como lo declara el contrato compartido.
 */
export function validar<Salida>(esquema: z.ZodType<Salida, z.ZodTypeDef, unknown>, valor: unknown): Salida {
  const resultado = esquema.safeParse(valor);
  if (resultado.success) return resultado.data;

  const campos: Record<string, string> = {};
  for (const problema of resultado.error.issues) {
    const ruta = problema.path.join('.') || 'cuerpo';
    campos[ruta] ??= problema.message;
  }
  const primero = Object.values(campos)[0] ?? 'Los datos enviados no son validos.';
  throw new ErrorValidacion(primero, campos);
}
