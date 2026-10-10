/** Validacion de lo que entra al modulo de ordenes. */
import { z } from 'zod';
import { ESTADO_ORDEN, MODALIDAD_SERVICIO, type EstadoOrden } from '@servitotal/compartido';

const estados = Object.values(ESTADO_ORDEN) as [EstadoOrden, ...EstadoOrden[]];

export const esquemaCrearOrden = z.object({
  /**
   * Sucursal desde la que entra la solicitud.
   *
   * Opcional aqui porque al usuario de tienda se la impone el servidor con
   * la suya. El agente telefonico si la manda, porque atiende a clientes de
   * cualquier sucursal.
   */
  idTienda: z.string().uuid('La tienda indicada no es valida.').nullish(),
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
  tipoGarantiaElegida: z.enum(['proveedor', 'adicional', 'particular'], {
    errorMap: () => ({ message: 'Elija garantia del proveedor, garantia adicional o servicio particular.' }),
  }).optional(),
});

export const esquemaAsignarTecnico = z.object({
  idTecnico: z.string().uuid('El tecnico indicado no es valido.'),
  /** Obligatorio cuando la orden ya tenia tecnico: es una reasignacion. */
  motivo: z.string().trim().max(500).optional(),
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

export const esquemaRegistrarBitacora = z.object({
  texto: z.string().trim()
    .min(1, 'Escriba el comentario: no se guardan comentarios vacios.')
    .max(2000, 'El comentario no puede pasar de 2000 caracteres.'),
  tipo: z.enum(['comentario', 'pago_registrado', 'pago_confirmado', 'correccion'], {
    errorMap: () => ({ message: 'El tipo de entrada no es valido.' }),
  }).optional(),
  idEntradaCorregida: z.string().uuid('La entrada a corregir no es valida.').optional(),
}).refine(
  (valor) => valor.tipo !== 'correccion' || valor.idEntradaCorregida !== undefined,
  { message: 'Indique que entrada corrige.', path: ['idEntradaCorregida'] },
);

export const esquemaRegistrarDiagnostico = z.object({
  fallaReal: z.string().trim().min(5, 'Describa la falla real encontrada (al menos 5 caracteres).').max(1000),
  componente: z.string().trim().max(120).nullish(),
  exclusion: z.string().trim().max(500).nullish(),
});

const monto = (campo: string) => z.number({ invalid_type_error: `${campo} debe ser un numero.` })
  .min(0, `${campo} no puede ser negativo.`).max(10_000_000);

export const esquemaRegistrarCotizacion = z.object({
  manoObra: monto('La mano de obra'),
  totalRepuestos: monto('El total de repuestos'),
  cargoVisita: monto('El cargo por visita').optional(),
});

export const esquemaDecisionCotizacion = z.object({
  aceptada: z.boolean({ required_error: 'Indique si el cliente acepto o no.' }),
  forma: z.enum(['firma_presencial', 'llamada', 'mensaje', 'correo'], {
    errorMap: () => ({ message: 'Indique como dio su respuesta el cliente.' }),
  }),
  observacion: z.string().trim().max(500).nullish(),
});
