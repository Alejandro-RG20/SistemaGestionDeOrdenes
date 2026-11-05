/**
 * Lista de verificacion del diagnostico (RF-22) y advertencia de medicion
 * fuera de rango (RF-23).
 *
 * La usan los dos caminos por los que entra un diagnostico: el panel
 * (tecnico de planta) y la cola del movil (tecnico de ruta). Las mismas
 * reglas en los dos: la funcion de validacion es la del paquete compartido,
 * la misma con la que la aplicacion advierte en vivo.
 */
import {
  describirMedicion, evaluarChecklist,
  type MedicionRegistrada, type RespuestaChecklist,
} from '@servitotal/compartido';
import type { Ejecutor } from '../../comun/transacciones.js';
import { ErrorValidacion } from '../../comun/errores.js';
import * as repositorio from './repositorio.js';

/**
 * Valida y guarda las mediciones de un diagnostico ya insertado.
 *
 * `respuestas` undefined = la peticion no traia lista (operaciones viejas
 * de la cola, guardadas antes de esta version): se acepta tal cual, para no
 * descartar trabajo de campo. Si trae lista, se exige completa y valida.
 * Devuelve las mediciones fuera de rango, ya anotadas en el historial.
 */
export async function registrarMediciones(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; idDiagnostico: string; estadoOrden: string; idResponsable: string;
    respuestas: readonly RespuestaChecklist[] | undefined; exigirLista: boolean;
  },
): Promise<readonly MedicionRegistrada[]> {
  const plantilla = await repositorio.plantillaDeOrden(datos.idOrden, ejecutor);
  if (plantilla === null) return [];
  if (datos.respuestas === undefined && !datos.exigirLista) return [];

  const resultado = evaluarChecklist(plantilla, datos.respuestas ?? []);
  if (resultado.errores.length > 0 || resultado.faltantes.length > 0) {
    const mensajes = [
      ...resultado.errores,
      ...(resultado.faltantes.length === 0 ? [] : [`Complete la lista de verificacion: ${resultado.faltantes.join(', ')}.`]),
    ];
    throw new ErrorValidacion(mensajes.join(' '), { mediciones: mensajes.join(' ') });
  }

  await repositorio.guardarMediciones(ejecutor, datos.idDiagnostico, plantilla.id, resultado.mediciones);
  if (resultado.fueraDeRango.length > 0) {
    await repositorio.anotarAvisosEnBitacora(ejecutor, [{
      idOrden: datos.idOrden,
      estado: datos.estadoOrden,
      observacion: `Advertencia: medicion fuera de rango. ${resultado.fueraDeRango.map(describirMedicion).join('; ')}.`,
    }], datos.idResponsable);
  }
  return resultado.fueraDeRango;
}

/** Plantillas vigentes por categoria, para la jornada del tecnico. */
export async function plantillasPorCategoria(
  idsCategoria: readonly string[], ejecutor?: Ejecutor,
): Promise<Map<string, import('@servitotal/compartido').PlantillaChecklist>> {
  return repositorio.plantillasVigentes([...new Set(idsCategoria)], ejecutor);
}
