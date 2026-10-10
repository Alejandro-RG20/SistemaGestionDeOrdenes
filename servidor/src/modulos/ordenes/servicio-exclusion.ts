/**
 * Exclusion de garantia: cuando una orden de garantia deja de estar
 * cubierta (golpe, mal uso, falla excluida...).
 *
 * Esa orden NO se reclasifica a particular. Lo que se hace:
 *   1. el tecnico ya registro el diagnostico, la falla y las evidencias, y
 *      anoto el motivo por el que no aplica;
 *   2. un usuario autorizado (`garantias.reclasificar`) confirma la
 *      exclusion, con motivo;
 *   3. la orden original se CIERRA SIN REPARAR por la maquina de estados
 *      (no se anula: anular es cancelar), y conserva su tipo de garantia,
 *      su diagnostico, sus evidencias, sus repuestos y su historial;
 *   4. si se pide, se abre una orden PARTICULAR nueva para el mismo cliente
 *      y articulo, con su propia cotizacion y autorizacion;
 *   5. las dos quedan vinculadas en la bitacora inmutable de ambas.
 *
 * No se trasladan cargos, consumos ni movimientos de inventario: la orden
 * nueva se cotiza desde cero. Todo ocurre en una transaccion.
 */
import {
  ACCION_BITACORA, ESTADO_ORDEN, TIPO_GARANTIA,
  type PeticionConfirmarExclusion, type ResultadoExclusion,
} from '@servitotal/compartido';
import { auditar } from '../../comun/auditoria.js';
import type { Actor } from '../../comun/contexto-peticion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorDominio, ErrorNoEncontrado } from '../../comun/errores.js';
import { definicionDe } from '../../dominio/ordenes/indice.js';
import { exigirCercoSobreOrden } from './alcance.js';
import * as repositorio from './repositorio.js';
import { crearRegistro } from './servicio.js';
import { mover } from './servicio-transiciones.js';

export async function confirmarExclusion(
  actor: Actor, idOrden: string, peticion: PeticionConfirmarExclusion,
): Promise<ResultadoExclusion> {
  return enTransaccion(async (cliente) => {
    await exigirCercoSobreOrden(actor, idOrden, cliente);
    const orden = await repositorio.datosDeTaller(idOrden, cliente, true);
    if (orden === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');

    if (orden.tipo_garantia !== TIPO_GARANTIA.PROVEEDOR && orden.tipo_garantia !== TIPO_GARANTIA.ADICIONAL) {
      throw new ErrorDominio('NO_ES_DE_GARANTIA',
        'La exclusion se confirma sobre una orden de garantia del proveedor o adicional.');
    }
    if (definicionDe(orden.estado).esFinal) {
      throw new ErrorDominio('ORDEN_CERRADA', `La orden ${orden.codigo} ya esta cerrada.`);
    }
    if (!orden.tiene_diagnostico) {
      throw new ErrorDominio('SIN_DIAGNOSTICO',
        'Antes de confirmar la exclusion, el tecnico debe registrar el diagnostico con la falla encontrada.');
    }

    // 1. La constancia de la exclusion, con quien la confirmo y por que.
    await auditar(cliente, [{
      tabla: 'orden_servicio', idRegistro: idOrden, accion: ACCION_BITACORA.MODIFICAR,
      campo: 'exclusion_garantia', valorAnterior: orden.tipo_garantia, valorNuevo: 'no_aplica',
      motivo: peticion.motivo, idUsuario: actor.id,
    }]);

    // 2. Cierre sin reparar por la maquina de estados: valida el paso, el
    //    permiso de cerrar y deja el evento. El tipo de garantia no cambia.
    await mover(actor, idOrden, {
      hacia: ESTADO_ORDEN.CERRADA_SIN_REPARAR,
      observacion: `Garantia ${orden.tipo_garantia} no aplicable (exclusion confirmada): ${peticion.motivo}`,
    });

    if (peticion.crearOrdenParticular === false) {
      return { idOrdenCerrada: idOrden, codigoOrdenCerrada: orden.codigo, idOrdenNueva: null, codigoOrdenNueva: null };
    }

    // 3. La orden particular nueva: mismo cliente y articulo, sin cargos ni
    //    repuestos trasladados.
    const falla = await repositorio.fallaReportada(idOrden, cliente);
    const modalidad = peticion.modalidad ?? (orden.modalidad as 'ruta' | 'taller');
    const idNueva = await crearRegistro(actor, {
      idCliente: orden.id_cliente,
      idArticulo: orden.id_articulo,
      modalidad,
      tipoGarantiaElegida: TIPO_GARANTIA.PARTICULAR,
      fallaReportada: `Continua la orden ${orden.codigo}, cuya garantia no aplica. Falla reportada: ${falla}`,
    });
    const nueva = await repositorio.datosDeTaller(idNueva, cliente);

    // 4. El vinculo, en la bitacora de las dos.
    await auditar(cliente, [
      {
        tabla: 'orden_servicio', idRegistro: idOrden, accion: ACCION_BITACORA.CREAR,
        campo: 'orden_continuacion', valorAnterior: null, valorNuevo: idNueva,
        motivo: `Continua en la orden particular ${nueva!.codigo}.`, idUsuario: actor.id,
      },
      {
        tabla: 'orden_servicio', idRegistro: idNueva, accion: ACCION_BITACORA.CREAR,
        campo: 'orden_origen', valorAnterior: null, valorNuevo: idOrden,
        motivo: `Viene de la orden ${orden.codigo} (garantia ${orden.tipo_garantia} no aplicable): ${peticion.motivo}`,
        idUsuario: actor.id,
      },
    ]);

    return {
      idOrdenCerrada: idOrden, codigoOrdenCerrada: orden.codigo,
      idOrdenNueva: idNueva, codigoOrdenNueva: nueva!.codigo,
    };
  });
}
