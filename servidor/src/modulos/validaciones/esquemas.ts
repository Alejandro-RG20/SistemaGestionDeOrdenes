/** Validacion de lo que entra al modulo de validacion tecnica. */
import { z } from 'zod';
import { RESULTADO_VALIDACION, type ResultadoValidacion } from '@servitotal/compartido';

const resultados = Object.values(RESULTADO_VALIDACION) as
  [ResultadoValidacion, ...ResultadoValidacion[]];

export const esquemaValidar = z.object({
  resultado: z.enum(resultados, {
    errorMap: () => ({ message: 'Ese resultado de validacion no existe.' }),
  }),
  /**
   * Obligatoria SIEMPRE, tambien al aprobar.
   *
   * Una aprobacion sin una linea escrita no se distingue de un clic
   * distraido, y es justo lo que despues nadie puede defender cuando el
   * proveedor pregunta quien reviso esto y con que criterio.
   */
  observacion: z.string().trim()
    .min(10, 'Escriba que reviso y que encontro; con dos palabras la revision no sustenta nada.')
    .max(1000),
  revisoDiagnostico: z.boolean(),
  revisoReparacion: z.boolean(),
  revisoEvidencias: z.boolean(),
  revisoRepuestos: z.boolean(),
});
