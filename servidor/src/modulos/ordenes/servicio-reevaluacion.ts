/**
 * Reevaluacion de la cobertura de las ordenes abiertas de un articulo.
 *
 * Vive en el modulo de ordenes porque escribe sobre ordenes; el CALCULO se
 * lo pide al servicio de garantias, que es el dueno del motor. Asi la
 * dependencia va en un solo sentido: articulos -> ordenes -> garantias.
 *
 * Corre en la transaccion que le pasa quien la llama, para que el cambio
 * del articulo y la reevaluacion se confirmen o se reviertan juntos.
 */
import { TIPO_GARANTIA, type TipoGarantia } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import * as servicioGarantias from '../garantias/servicio.js';
import * as repositorio from './repositorio.js';

export interface OrdenReevaluada {
  readonly id: string;
  readonly numero: number;
  readonly tipoAnterior: TipoGarantia;
  readonly tipoNuevo: TipoGarantia;
  /** Paso a cargo del cliente: la orden se detiene hasta que acepte la cotizacion. */
  readonly detenida: boolean;
}

export async function reevaluarOrdenesAbiertas(
  ejecutor: Ejecutor,
  actor: Actor,
  idArticulo: string,
  motivo: string,
): Promise<readonly OrdenReevaluada[]> {
  const ordenes = await repositorio.listarAbiertasDeArticulo(idArticulo, ejecutor);
  if (ordenes.length === 0) return [];

  const evaluaciones = await servicioGarantias.evaluarParaVariosSolicitantes(
    idArticulo, ordenes.map((orden) => orden.id_cliente), ejecutor,
  );

  // Primero se calcula todo en memoria; despues se escribe de una vez.
  const reevaluadas: OrdenReevaluada[] = [];
  const cambios: repositorio.CambioDeGarantia[] = [];

  for (const orden of ordenes) {
    const evaluacion = evaluaciones.get(orden.id_cliente);
    if (evaluacion === undefined) continue;

    const tipoAnterior = orden.tipo_garantia as TipoGarantia;
    if (evaluacion.tipo === tipoAnterior) continue;

    cambios.push({
      idOrden: orden.id,
      estado: orden.estado,
      tipoGarantia: evaluacion.tipo,
      idReglaCobertura: evaluacion.idReglaCobertura,
      observacion:
        `Cobertura reevaluada de ${tipoAnterior} a ${evaluacion.tipo}. ${motivo}. ${evaluacion.motivo}`,
    });

    reevaluadas.push({
      id: orden.id,
      numero: orden.numero,
      tipoAnterior,
      tipoNuevo: evaluacion.tipo,
      detenida: evaluacion.tipo === TIPO_GARANTIA.PARTICULAR && tipoAnterior !== TIPO_GARANTIA.PARTICULAR,
    });
  }

  await repositorio.aplicarCambiosDeGarantia(ejecutor, cambios, actor.id);
  await repositorio.anotarEventosDeReevaluacion(ejecutor, cambios, actor.id);

  return reevaluadas;
}
