/** Validacion de lo que entra al modulo de articulos. */
import { z } from 'zod';
import { TIPO_GARANTIA, esFechaValida, type TipoGarantia } from '@servitotal/compartido';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe venir como AAAA-MM-DD.')
  .refine(esFechaValida, 'La fecha no existe en el calendario.');

const meses = z.number({ invalid_type_error: 'La duracion debe ser un numero de meses.' })
  .int('La duracion debe ser un numero entero de meses.')
  .min(1, 'La duracion debe ser de al menos un mes.')
  .max(120, 'La duracion no puede pasar de 120 meses.');

const hoy = (): string => new Date().toISOString().slice(0, 10);

const motivo = z.string().trim()
  .min(10, 'Escriba el motivo: al menos 10 caracteres. Queda registrado en la bitacora.')
  .max(500);

/** La serie identifica al articulo: se guarda en mayusculas y sin espacios. */
const numeroSerie = z.string().trim().toUpperCase()
  .min(3, 'El numero de serie es muy corto.')
  .max(60, 'El numero de serie es muy largo.');

export const esquemaCrearArticulo = z.object({
  idCliente: z.string().uuid('El cliente indicado no es valido.'),
  idMarca: z.string().uuid('La marca indicada no es valida.'),
  idCategoria: z.string().uuid('La categoria indicada no es valida.'),
  idTiendaOrigen: z.string().uuid('La tienda de origen indicada no es valida.'),
  modelo: z.string().trim().max(60).nullish(),
  numeroSerie: numeroSerie.nullish(),
  sinSerieLegible: z.boolean().default(false),
  fechaCompra: fecha.refine((valor) => valor <= hoy(), 'La fecha de compra no puede ser futura.').nullish(),
  facturaReferencia: z.string().trim().max(60).nullish(),
  garantiaAdicional: z.object({
    fechaContratacion: fecha.refine((valor) => valor <= hoy(), 'La fecha de contratacion no puede ser futura.'),
    meses,
    documentoRespaldo: z.string().trim().max(120).nullish(),
  }).nullish(),
}).refine(
  (valor) => valor.sinSerieLegible || (valor.numeroSerie != null && valor.numeroSerie !== ''),
  {
    message: 'Indique el numero de serie o marque que la placa no es legible.',
    path: ['numeroSerie'],
  },
).refine(
  // La garantia adicional se compra con el articulo o despues, nunca antes.
  (valor) => valor.garantiaAdicional == null || valor.fechaCompra == null
    || valor.garantiaAdicional.fechaContratacion >= valor.fechaCompra,
  { message: 'La garantia adicional no puede contratarse antes de la compra del articulo.', path: ['garantiaAdicional', 'fechaContratacion'] },
);

export const esquemaActualizarArticulo = z.object({
  modelo: z.string().trim().max(60).nullish(),
  numeroSerie: numeroSerie.nullish(),
  sinSerieLegible: z.boolean().optional(),
  facturaReferencia: z.string().trim().max(60).nullish(),
}).refine(
  (valor) => Object.values(valor).some((campo) => campo !== undefined),
  { message: 'No se indico ningun cambio.' },
);

export const esquemaCambiarDatosSensibles = z.object({
  fechaCompra: fecha.nullish(),
  idTiendaOrigen: z.string().uuid('La tienda de origen indicada no es valida.').optional(),
  idMarca: z.string().uuid('La marca indicada no es valida.').optional(),
  motivo,
}).refine(
  (valor) => valor.fechaCompra !== undefined || valor.idTiendaOrigen !== undefined || valor.idMarca !== undefined,
  { message: 'No se indico ningun dato sensible que cambiar.' },
);

export const esquemaTransferir = z.object({
  idClienteNuevo: z.string().uuid('El cliente indicado no es valido.'),
  motivo,
});

const tiposDeCobertura = Object.values(TIPO_GARANTIA) as [TipoGarantia, ...TipoGarantia[]];

export const esquemaRegistrarCobertura = z.object({
  tipo: z.enum(tiposDeCobertura, { errorMap: () => ({ message: 'El tipo de cobertura no es valido.' }) }),
  vigenteDesde: fecha,
  vigenteHasta: fecha.optional(),
  meses: meses.optional(),
  documentoRespaldo: z.string().trim().max(120).nullish(),
  idClienteContratante: z.string().uuid('El contratante indicado no es valido.').nullish(),
}).refine(
  (valor) => (valor.vigenteHasta === undefined) !== (valor.meses === undefined),
  { message: 'Indique la fecha de vencimiento o la duracion en meses (una de las dos).', path: ['meses'] },
).refine(
  (valor) => valor.vigenteHasta === undefined || valor.vigenteHasta > valor.vigenteDesde,
  { message: 'La fecha de fin debe ser posterior a la de inicio.', path: ['vigenteHasta'] },
);
