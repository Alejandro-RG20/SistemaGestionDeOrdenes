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
 *  3. Entregar mueve existencia, y la mueve por la misma puerta que
 *     cualquier otro movimiento. Una entrega que descontara la bodega por su
 *     cuenta seria un segundo camino para cambiar el inventario, y el dia
 *     que las dos vias no coincidan nadie sabria cual creer.
 */
import {
  ESTADO_SOLICITUD, PASOS_CON_MOTIVO, RESPONSABLE_DEL_PASO, TIPO_MOVIMIENTO,
  solicitudPuedeMoverseA, type EstadoSolicitud,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import {
  ErrorAutorizacion, ErrorDominio, ErrorNoEncontrado, ErrorValidacion,
} from '../../comun/errores.js';
import * as repositorio from './repositorio-solicitudes.js';
import * as servicioInventario from './servicio.js';

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
     * LA ENTREGA MUEVE EXISTENCIA SOLO SI HAY A DONDE MOVERLA
     *
     * Al tecnico de RUTA la pieza se le despacha a su bodega movil: se la
     * lleva en el vehiculo y hace falta poder saber que lleva encima. Al de
     * PLANTA no: trabaja en el taller, la pieza no sale de la bodega del
     * centro, y se descuenta cuando la instala, con el consumo contra la
     * orden.
     *
     * La primera version exigia bodega movil SIEMPRE y respondia
     * SIN_BODEGA_DEL_TECNICO. Eso dejaba el recorrido entero bloqueado para
     * las ordenes de planta, que son la mayoria del taller: una regla
     * correcta para la mitad del negocio, aplicada a la otra mitad.
     *
     * Lo que NO se admite es entregar la pieza de una orden sin tecnico: no
     * habria a quien darsela, y la solicitud quedaria dicha entregada sin
     * que nadie la tenga.
     */
    if (paso.hacia === ESTADO_SOLICITUD.ENTREGADA) {
      const destino = await repositorio.bodegaDelTecnicoDeLaOrden(cliente, idSolicitud);

      if (destino === null && !(await repositorio.tieneTecnico(cliente, idSolicitud))) {
        throw new ErrorDominio(
          'SIN_TECNICO_ASIGNADO',
          'La orden no tiene tecnico asignado, asi que no hay a quien entregarle la pieza. ' +
            'Asigne el tecnico antes de entregar.',
        );
      }

      if (destino !== null) {
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
        });
      }
    }

    await repositorio.registrarPaso(cliente, {
      idSolicitud,
      hacia: paso.hacia,
      motivo: motivo === '' ? null : motivo,
      actor: actor.id,
    });

    const despues = await repositorio.buscarDetallada(idSolicitud, cliente);
    return despues!;
  });
}
