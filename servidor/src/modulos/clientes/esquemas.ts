/** Validacion de lo que entra al modulo de clientes. */
import { z } from 'zod';

const texto = (minimo: number, maximo: number, mensaje: string) =>
  z.string().trim().min(minimo, mensaje).max(maximo, `No puede pasar de ${maximo} caracteres.`);

/** Numero nicaraguense: ocho digitos. Se admite con espacios o guiones. */
const telefono = z.string()
  .trim()
  .transform((valor) => valor.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{8}$/, 'El telefono debe tener ocho digitos.'));

const motivo = texto(10, 500, 'Escriba el motivo: al menos 10 caracteres. Queda registrado en la bitacora.');

export const esquemaCrearCliente = z.object({
  nombres: texto(2, 120, 'Escriba el nombre del cliente.'),
  apellidos: texto(2, 120, 'Los apellidos son muy cortos.').nullish(),
  identificacion: z.string().trim().max(30).nullish(),
  correo: z.string().trim().email('El correo no tiene un formato valido.').max(150).nullish(),
  telefono,
  direccion: z.object({
    detalle: texto(5, 300, 'Escriba la direccion.'),
    referencia: z.string().trim().max(300).nullish(),
    idZona: z.string().uuid('La zona indicada no es valida.').nullish(),
  }).nullish(),
});

export const esquemaActualizarCliente = z.object({
  nombres: texto(2, 120, 'Escriba el nombre del cliente.').optional(),
  apellidos: texto(2, 120, 'Los apellidos son muy cortos.').nullish(),
  identificacion: z.string().trim().max(30).nullish(),
  correo: z.string().trim().email('El correo no tiene un formato valido.').max(150).nullish(),
}).refine(
  (valor) => Object.values(valor).some((campo) => campo !== undefined),
  { message: 'No se indico ningun cambio.' },
);

export const esquemaAgregarTelefono = z.object({
  numero: telefono,
  tipo: z.enum(['celular', 'casa', 'trabajo']).nullish(),
  reemplazaAlVigente: z.boolean().default(true),
});

export const esquemaAgregarDireccion = z.object({
  detalle: texto(5, 300, 'Escriba la direccion.'),
  referencia: z.string().trim().max(300).nullish(),
  idZona: z.string().uuid('La zona indicada no es valida.').nullish(),
  esPrincipal: z.boolean().default(true),
});

export const esquemaFusionar = z.object({
  idClienteAbsorbido: z.string().uuid('El cliente a fusionar no es valido.'),
  motivo,
});
