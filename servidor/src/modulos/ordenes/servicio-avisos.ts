/**
 * Avisos que otros modulos dejan en la bitacora de la orden.
 *
 * "Se notifica al responsable" se resuelve, por ahora, anotandolo en la
 * bitacora inmutable de la orden y dejandolo visible en su ficha. No se
 * envia nada: empujar avisos por correo o mensaje es otra cosa y hace falta
 * decidir por donde. Lo que si queda es el rastro.
 */
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import * as repositorio from './repositorio.js';

export interface AvisoDeOrden {
  readonly idOrden: string;
  readonly estado: string;
  readonly observacion: string;
}

export async function anotarAvisos(
  ejecutor: Ejecutor, actor: Actor, avisos: readonly AvisoDeOrden[],
): Promise<void> {
  await repositorio.anotarAvisosEnBitacora(ejecutor, avisos, actor.id);
}
