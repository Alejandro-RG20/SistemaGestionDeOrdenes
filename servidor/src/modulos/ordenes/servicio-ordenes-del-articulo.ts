/**
 * Ordenes abiertas de un articulo cuando cambia su ficha.
 *
 * Cambiar la fecha de compra, la tienda, la marca, el dueno o una garantia
 * registrada del articulo NO cambia la garantia de sus ordenes: la eligio
 * una persona al registrarlas. Lo que si se hace es dejar una nota en el
 * historial de cada orden abierta, para que no pase en silencio y quien
 * tiene permiso decida si la reclasifica, con motivo.
 *
 * Vive en el modulo de ordenes porque escribe sobre ordenes. Corre en la
 * transaccion que le pasa quien la llama, para que el cambio del articulo
 * y las notas se confirmen o se reviertan juntos.
 */
import type { TipoGarantia } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import * as repositorio from './repositorio.js';

export interface OrdenAbiertaDelArticulo {
  readonly id: string;
  readonly numero: number;
  readonly tipoGarantia: TipoGarantia;
}

export async function anotarCambioEnOrdenesAbiertas(
  ejecutor: Ejecutor,
  actor: Actor,
  idArticulo: string,
  motivo: string,
): Promise<readonly OrdenAbiertaDelArticulo[]> {
  const ordenes = await repositorio.listarAbiertasDeArticulo(idArticulo, ejecutor);
  await repositorio.anotarAvisosEnBitacora(ejecutor, ordenes.map((orden) => ({
    idOrden: orden.id,
    estado: orden.estado,
    observacion: `${motivo}. La garantia de esta orden (${orden.tipo_garantia.replace(/_/g, ' ')}) `
      + 'no se modifico; si corresponde, reclasifiquela con motivo.',
  })), actor.id);
  return ordenes.map((orden) => ({
    id: orden.id,
    numero: Number(orden.numero),
    tipoGarantia: orden.tipo_garantia as TipoGarantia,
  }));
}
