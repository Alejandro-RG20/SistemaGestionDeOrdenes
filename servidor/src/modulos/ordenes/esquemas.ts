/** Validacion de lo que entra al modulo de ordenes. */
import { z } from 'zod';
import { ESTADO_ORDEN, MODALIDAD_SERVICIO, type EstadoOrden } from '@servitotal/compartido';

const estados = Object.values(ESTADO_ORDEN) as [EstadoOrden, ...EstadoOrden[]];

export const esquemaCrearOrden = z.object({
  // El dispositivo movil puede traer su propio UUID (AD-03). El numero
  // correlativo lo asigna siempre el servidor.
  id: z.string().uuid('El identificador de orden no es valido.').optional(),
  idCliente: z.string().uuid('El cliente indicado no es valido.'),
  idArticulo: z.string().uuid('El articulo indicado no es valido.'),
  modalidad: z.enum([MODALIDAD_SERVICIO.RUTA, MODALIDAD_SERVICIO.TALLER], {
    errorMap: () => ({ message: 'La modalidad debe ser ruta o taller.' }),
  }),
  fallaReportada: z.string().trim()
    .min(5, 'Escriba la falla que reporta el cliente.')
    .max(500),
  telefonoContacto: z.string().trim()
    .transform((valor) => valor.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{8}$/, 'El telefono debe tener ocho digitos.'))
    .optional(),
  direccionServicio: z.string().trim().max(300).nullish(),
  referenciaUbicacion: z.string().trim().max(300).nullish(),
  idZona: z.string().uuid('La zona indicada no es valida.').nullish(),
  levantadaEnCampo: z.boolean().default(false),
});

export const esquemaAsignarTecnico = z.object({
  idTecnico: z.string().uuid('El tecnico indicado no es valido.'),
});

export const esquemaTransicion = z.object({
  hacia: z.enum(estados, { errorMap: () => ({ message: 'El estado de destino no existe.' }) }),
  motivo: z.string().trim().max(500).optional(),
  observacion: z.string().trim().max(500).optional(),
});

export const esquemaNotaCorreccion = z.object({
  motivo: z.string().trim()
    .min(10, 'Escriba el motivo de la correccion: al menos 10 caracteres.')
    .max(200),
  detalle: z.string().trim()
    .min(10, 'Escriba el detalle de la correccion: al menos 10 caracteres.')
    .max(1000),
});
