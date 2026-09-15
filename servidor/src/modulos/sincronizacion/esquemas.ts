/** Validacion de lo que llega por la cola de sincronizacion. */
import { z } from 'zod';
import { TIPO_OPERACION, type TipoOperacion } from '@servitotal/compartido';

const tipos = Object.values(TIPO_OPERACION) as [TipoOperacion, ...TipoOperacion[]];

/** Tope de operaciones por envio: una ruta de un dia cabe de sobra. */
const MAXIMO_POR_LOTE = 200;

export const esquemaSincronizar = z.object({
  operaciones: z.array(z.object({
    idOperacion: z.string().uuid('El identificador de la operacion no es valido.'),
    tipoOperacion: z.enum(tipos, {
      errorMap: () => ({ message: 'El tipo de operacion no esta soportado por el servidor.' }),
    }),
    momentoDispositivo: z.string().datetime({ message: 'El momento del dispositivo no es valido.' }),
    carga: z.record(z.unknown()),
  }))
    .min(1, 'No se envio ninguna operacion.')
    .max(MAXIMO_POR_LOTE, `No se pueden enviar mas de ${MAXIMO_POR_LOTE} operaciones por vez.`),
});

export const esquemaResolverExcepcion = z.object({
  estado: z.enum(['resuelta', 'descartada'], {
    errorMap: () => ({ message: 'El estado debe ser "resuelta" o "descartada".' }),
  }),
  resolucion: z.string().trim()
    .min(10, 'Escriba como se resolvio: al menos 10 caracteres. Queda registrado.')
    .max(1000),
});

export const esquemaIniciarCarga = z.object({
  idOrden: z.string().uuid('La orden indicada no es valida.'),
  clave: z.string().trim().min(3, 'Indique la clave de la evidencia.').max(60),
  tipo: z.enum(['foto', 'firma', 'documento', 'medicion'], {
    errorMap: () => ({ message: 'El tipo de evidencia no es valido.' }),
  }),
  bytes: z.number().int().min(1).max(50 * 1024 * 1024, 'La evidencia no puede pasar de 50 MB.'),
  huellaDigital: z.string().regex(/^[0-9a-f]{64}$/i, 'La huella debe ser un SHA-256 en hexadecimal.'),
  momentoDispositivo: z.string().datetime({ message: 'El momento del dispositivo no es valido.' }),
  latitud: z.number().min(-90).max(90).nullish(),
  longitud: z.number().min(-180).max(180).nullish(),
});
