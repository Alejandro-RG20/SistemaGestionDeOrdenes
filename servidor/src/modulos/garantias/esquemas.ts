/** Validacion de lo que entra al modulo de garantias. */
import { z } from 'zod';

export const esquemaEvaluar = z.object({
  idArticulo: z.string().uuid('El articulo indicado no es valido.'),
  idClienteSolicitante: z.string().uuid('El cliente indicado no es valido.').optional(),
  fallaReal: z.string().trim().min(3, 'Describa la falla real.').max(500).optional(),
});

export const esquemaNuevaVersionRegla = z.object({
  idMarca: z.string().uuid('La marca indicada no es valida.').nullish(),
  idCategoria: z.string().uuid('La categoria indicada no es valida.').nullish(),
  mesesCobertura: z.number().int('Los meses deben ser un numero entero.').min(0).max(240),
  exigeTiendaGrupo: z.boolean(),
  fallasExcluidas: z.array(z.string().trim().min(2).max(60)).max(40).default([]),
  motivo: z.string().trim()
    .min(10, 'Escriba el motivo: al menos 10 caracteres. Queda registrado en la bitacora.')
    .max(500),
});
