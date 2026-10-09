/**
 * El recorrido de una solicitud de repuesto (pliego §26).
 *
 * El tecnico solicita, bodega revisa, aprueba o rechaza con motivo, prepara,
 * entrega, y el tecnico confirma que la tiene. Seis pasos que antes eran un
 * booleano: o estaba liberada o no, y por tanto no habia respuesta para
 * «quien aprobo esto» ni para «bodega lo saco y nadie lo recogio».
 *
 * TRES REGLAS QUE NO SON ADORNO
 *
 *  1. El paso lo decide la maquina de `compartido`, no esta funcion. El
 *     panel ofrece botones con la misma tabla, asi que no puede ofrecer un
 *     paso que el servidor vaya a rechazar.
 *  2. Cada paso exige SU permiso, no uno general. El tecnico no se aprueba
 *     su propia solicitud y bodega no declara que el tecnico la recibio: eso
 *     es la separacion de funciones del §65 aplicada a un tramite pequeño.
 *  3. Aprobar reserva y solo se aprueba lo disponible. Entregar mueve
 *     existencia a la bodega del tecnico, y la mueve por la misma puerta que
 *     cualquier otro movimiento. Una entrega que descontara la bodega por su
 *     cuenta seria un segundo camino para cambiar el inventario, y el dia
 *     que las dos vias no coincidan nadie sabria cual creer.
 */
import {
  ACCION_BITACORA, ESTADO_SOLICITUD, PASOS_CON_MOTIVO, RESPONSABLE_DEL_PASO, TIPO_MOVIMIENTO,
  solicitudPuedeMoverseA, type EstadoSolicitud,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { auditar } from '../../comun/auditoria.js';
import {
  ErrorAutorizacion, ErrorDominio, ErrorNoEncontrado, ErrorValidacion,
} from '../../comun/errores.js';
import * as repositorio from './repositorio-solicitudes.js';
import * as servicioInventario from './servicio.js';
import * as repositorioDisponibilidad from './repositorio-disponibilidad.js';

export interface PasoDeSolicitud {
  readonly hacia: EstadoSolicitud;
  readonly motivo?: string | null;
  /** Solo para «entregada»: de que bodega sale la pieza. */
  readonly idBodegaOrigen?: string | null;
}

function exigirPermisoDelPaso(actor: Actor, hacia: EstadoSolicitud): void {
  const requerido = RESPONSABLE_DEL_PASO[hacia as keyof typeof RESPONSABLE_DEL_PASO];
  if (requerido === undefined) {
    throw new ErrorValidacion('Ese paso no existe.', { hacia: 'Paso no valido.' });
  }
  if (!(actor.permisos as readonly string[]).includes(requerido)) {
    throw new ErrorAutorizacion(
      `Su perfil no es quien da este paso de la solicitud. Lo da quien tiene «${requerido}».`,
    );
  }
}

/**
 * Mueve la solicitud un paso.
 *
 * Todo dentro de una transaccion: si la entrega descuenta la bodega pero el
 * cambio de estado falla, no puede quedar media entrega hecha.
 */
export async function darPaso(
  actor: Actor, idSolicitud: string, paso: PasoDeSolicitud,
): Promise<repositorio.FilaSolicitudDetallada> {
  exigirPermisoDelPaso(actor, paso.hacia);

  const motivo = paso.motivo?.trim() ?? '';
  if (PASOS_CON_MOTIVO.includes(paso.hacia) && motivo === '') {
    throw new ErrorValidacion(
      'Indique por escrito el motivo. Un rechazo sin motivo deja al tecnico sin saber si fue por ' +
        'existencia, por precio o porque pidio la pieza equivocada.',
      { motivo: 'Obligatorio en este paso.' },
    );
  }

  return enTransaccion(async (cliente) => {
    const actual = await repositorio.bloquear(cliente, idSolicitud);
    if (actual === null) {
      throw new ErrorNoEncontrado('No existe una solicitud con ese identificador.');
    }

    if (!solicitudPuedeMoverseA(actual.estado, paso.hacia)) {
      throw new ErrorDominio(
        'PASO_INVALIDO',
        `Una solicitud en «${actual.estado}» no puede pasar a «${paso.hacia}».`,
      );
    }

    /*
     * APROBAR ES RESERVAR, Y SOLO SE RESERVA LO QUE HAY.
     *
     * Aprobada la solicitud, la pieza queda apartada para esa orden: cuenta
     * como reservada y deja de estar disponible para las demas. Por eso no
     * se aprueba lo que no hay. La solicitud queda en revision —con su
     * historial intacto— y la orden puede pasar a «esperando repuesto»;
     * cuando entre el repuesto, bodega la aprueba sin perder nada.
     *
     * `disponibleBloqueando` pone en fila a dos aprobaciones simultaneas del
     * mismo repuesto: la segunda ve la reserva de la primera.
     */
    if (paso.hacia === ESTADO_SOLICITUD.APROBADA) {
      const disponible = await repositorioDisponibilidad.disponibleBloqueando(
        cliente, actual.id_repuesto,
      );
      if (disponible < actual.cantidad) {
        throw new ErrorDominio(
          'SIN_DISPONIBILIDAD',
          `No hay disponibilidad para aprobar: se piden ${actual.cantidad} y hay ${Math.max(disponible, 0)} `
          + 'sin reservar en bodega. La solicitud sigue en revision y la orden puede quedar '
          + '«esperando repuesto» hasta que entre.',
        );
      }
    }

    /*
     * El tecnico solo confirma SUS solicitudes. Sin esto, cualquier tecnico
     * podria declarar recibida la pieza de otro, que es la via mas simple de
     * perder una pieza sin que quede a nombre de nadie.
     */
    if (paso.hacia === ESTADO_SOLICITUD.RECIBIDA) {
      const suya = await repositorio.esDelTecnico(cliente, idSolicitud, actor.id);
      if (!suya) {
        throw new ErrorAutorizacion('Esta solicitud no es de una orden asignada a usted.');
      }
    }

    /*
     * ENTREGAR ES UN MOVIMIENTO: DE LA BODEGA A LA DEL TECNICO.
     *
     * Cada tecnico tiene su bodega personal —la del vehiculo si es de ruta,
     * la de banco si es de planta (migracion 0023)—. La entrega mueve la
     * pieza alli, asi que despues se sabe quien la tiene, se consume desde
     * esa bodega contra la orden, y lo que no se use se devuelve con un
     * movimiento de devolucion. Antes, al tecnico de planta se le «entregaba»
     * sin movimiento y la pieza no usada no tenia como volver.
     *
     * Lo que NO se admite es entregar la pieza de una orden sin tecnico: no
     * habria a quien darsela.
     */
    if (paso.hacia === ESTADO_SOLICITUD.ENTREGADA) {
      const destino = await repositorioDisponibilidad.asegurarBodegaDelTecnico(
        cliente, actual.id_orden,
      );
      if (destino === null) {
        throw new ErrorDominio(
          'SIN_TECNICO_ASIGNADO',
          'La orden no tiene tecnico asignado, asi que no hay a quien entregarle la pieza. ' +
            'Asigne el tecnico antes de entregar.',
        );
      }
      const bodegaOrigen = paso.idBodegaOrigen ?? null;
      if (bodegaOrigen === null) {
        throw new ErrorValidacion(
          'Indique de que bodega sale la pieza.', { idBodegaOrigen: 'Obligatorio al entregar.' },
        );
      }
      /*
       * `enTransaccion` es reentrante, asi que este movimiento entra en la
       * MISMA transaccion que el cambio de estado. Si el estado falla
       * despues, la existencia descontada se revierte con el resto.
       */
      await servicioInventario.registrarMovimiento(actor, {
        tipo: TIPO_MOVIMIENTO.DESPACHO_A_MOVIL,
        idRepuesto: actual.id_repuesto,
        idBodegaOrigen: bodegaOrigen,
        idBodegaDestino: destino,
        cantidad: actual.cantidad,
        idOrden: actual.id_orden,
        justificacion: 'Entrega de la solicitud de repuesto al tecnico de la orden',
      });
    }

    await repositorio.registrarPaso(cliente, {
      idSolicitud,
      hacia: paso.hacia,
      motivo: motivo === '' ? null : motivo,
      actor: actor.id,
    });

    // La fila de la solicitud guarda el ULTIMO paso de cada tipo; si se
    // rechaza y se vuelve a revisar, la primera revision se sobrescribe.
    // La bitacora guarda TODOS, y es lo que lee el historial de la orden.
    await auditar(cliente, [{
      tabla: 'solicitud_repuesto',
      idRegistro: idSolicitud,
      accion: paso.hacia === ESTADO_SOLICITUD.ANULADA ? ACCION_BITACORA.ANULAR : ACCION_BITACORA.MODIFICAR,
      campo: 'estado',
      valorAnterior: actual.estado,
      valorNuevo: paso.hacia,
      motivo: motivo === '' ? null : motivo,
      idUsuario: actor.id,
    }]);

    const despues = await repositorio.buscarDetallada(idSolicitud, cliente);
    return despues!;
  });
}
