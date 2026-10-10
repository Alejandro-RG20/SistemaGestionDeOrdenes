/** Validacion de lo que entra al modulo de agenda. */
import { z } from 'zod';
import { FRANJAS_HORARIAS } from '@servitotal/compartido';

const franjas = FRANJAS_HORARIAS as unknown as [string, ...string[]];

export const esquemaProgramarVisita = z.object({
  idTecnico: z.string().uuid('El tecnico indicado no es valido.'),
  fechaProgramada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe venir como AAAA-MM-DD.'),
  franjaHoraria: z.enum(franjas, {
    errorMap: () => ({ message: `La franja debe ser una de: ${FRANJAS_HORARIAS.join(', ')}.` }),
  }),
  ordenRecorrido: z.number().int().min(1).max(20).nullish(),
});

export const esquemaReprogramarVisita = esquemaProgramarVisita.extend({
  motivo: z.string().trim()
    .min(10, 'Escriba por que se reprograma: al menos 10 caracteres.')
    .max(300),
});

const resultados = ['resuelta_en_sitio', 'requiere_traslado_taller', 'cliente_ausente', 'no_autorizada'] as const;

export const esquemaSalidaDeVisita = z.object({
  resultado: z.enum(resultados, {
    errorMap: () => ({ message: 'Indique el resultado: resuelta en sitio, requiere traslado, cliente ausente o no autorizada.' }),
  }),
  observaciones: z.string().trim().max(1000).nullish(),
});
