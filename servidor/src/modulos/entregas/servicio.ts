/**
 * Entrega del articulo al cliente (RF-41).
 *
 * LA LISTA DE REQUISITOS SE CALCULA, NO SE DECLARA.
 *
 * Lo que hay que verificar antes de entregar: reparacion terminada,
 * validacion tecnica aprobada y, cuando corresponda, la autorizacion del
 * cliente. La tentacion es poner una casilla «todo revisado» en la
 * pantalla; eso convierte el control en un tramite.
 *
 * LA ENTREGA NO DEPENDE DE NINGUN COBRO. El sistema gestiona ordenes e
 * inventario, no dinero (migracion 0023): una orden se entrega y se cierra
 * sin registrar pagos. La tabla `pago` se conserva solo como historico.
 *
 * Cada requisito se comprueba contra los datos y se devuelve con QUE HACER
 * si no se cumple, porque quien atiende el mostrador tiene al cliente
 * delante y necesita saber a donde mandarlo, no que se le diga que no.
 *
 * «Cuando corresponda» tambien se calcula: una orden de garantia del
 * proveedor no necesita autorizacion del cliente, y pedirsela seria inventar
 * un obstaculo que el negocio no tiene.
 */
import {
  ESTADO_ORDEN, TIPO_GARANTIA,
  type Entrega, type PeticionEntregar, type RequisitoDeEntrega, type VerificacionDeEntrega,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorDominio, ErrorNoEncontrado } from '../../comun/errores.js';
import * as validaciones from '../validaciones/servicio.js';
import * as transiciones from '../ordenes/servicio-transiciones.js';
import { exigirCercoSobreOrden } from '../ordenes/alcance.js';
import * as repositorio from './repositorio.js';

function aEntrega(fila: repositorio.FilaEntrega): Entrega {
  return {
    id: fila.id,
    idOrden: fila.id_orden,
    recibidoPor: fila.recibido_por,
    documentoReceptor: fila.documento_receptor,
    esElCliente: fila.es_el_cliente,
    observacion: fila.observacion,
    responsable: fila.responsable,
    momento: fila.momento.toISOString(),
  };
}

/**
 * Que le falta a esta orden para poder entregarse.
 *
 * Lleva el cerco por datos: la verificacion dice quien es el cliente y que
 * evidencias tiene. Y como `entregar` la usa, el cerco protege las
 * dos puertas con una sola linea.
 */
export async function verificar(
  actor: Actor, idOrden: string,
): Promise<VerificacionDeEntrega> {
  await exigirCercoSobreOrden(actor, idOrden);

  const orden = await repositorio.estadoParaEntrega(idOrden);
  if (orden === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');

  const entregaPrevia = await repositorio.deOrden(idOrden);
  const aprobada = await validaciones.estaAprobada(idOrden);

  // Solo la reparacion particular necesita que el cliente la haya
  // autorizado. Es una decision operativa —el cliente dijo «si, repárelo»—,
  // no un cobro.
  const requiereAutorizacion = orden.tipo_garantia === TIPO_GARANTIA.PARTICULAR
    && (orden.tiene_cotizacion || Number(orden.total) > 0);

  const requisitos: RequisitoDeEntrega[] = [
    {
      clave: 'reparacion_terminada',
      etiqueta: 'La reparacion esta terminada',
      cumplido: orden.estado === ESTADO_ORDEN.FINALIZADA,
      queHacer: orden.estado === ESTADO_ORDEN.FINALIZADA
        ? ''
        : `La orden esta en «${orden.estado.replace(/_/g, ' ')}». El taller tiene que `
          + 'terminarla antes de que el articulo salga.',
    },
    {
      clave: 'validacion_tecnica',
      etiqueta: 'Una jefatura reviso y aprobo el trabajo',
      cumplido: aprobada,
      queHacer: aprobada
        ? ''
        : 'Pida la revision a la jefatura de tecnicos. Sin aprobacion, el centro no puede '
          + 'responder por la reparacion.',
    },
  ];

  if (requiereAutorizacion) {
    const aceptada = orden.cotizacion_aceptada === true;
    requisitos.push({
      clave: 'cotizacion_aceptada',
      etiqueta: 'El cliente autorizo la reparacion',
      cumplido: aceptada,
      queHacer: aceptada
        ? ''
        : orden.tiene_cotizacion
          ? 'Hay cotizacion pero el cliente todavia no la acepto. Registre la autorizacion.'
          : 'Esta orden es particular y no tiene la autorizacion del cliente registrada. '
            + 'Registrela antes de entregar.',
    });
  }

  return {
    idOrden,
    puedeEntregarse: entregaPrevia === null && requisitos.every((r) => r.cumplido),
    requisitos,
    entrega: entregaPrevia === null ? null : aEntrega(entregaPrevia),
  };
}

/**
 * Registra la entrega Y mueve la orden a «entregada», en una sola
 * transaccion.
 *
 * Van juntas a proposito. Si fueran dos llamadas, una podria quedar sin la
 * otra: un acta de entrega de una orden que sigue apareciendo como
 * terminada, o una orden entregada sin constancia de a quien. Lo primero
 * confunde al taller; lo segundo es lo que no se puede defender cuando
 * alguien reclama.
 */
export async function entregar(
  actor: Actor, idOrden: string, peticion: PeticionEntregar,
): Promise<Entrega> {
  const verificacion = await verificar(actor, idOrden);

  if (verificacion.entrega !== null) {
    throw new ErrorDominio(
      'ENTREGA_YA_REGISTRADA',
      `Esta orden ya se entrego a ${verificacion.entrega.recibidoPor}. Si el dato esta mal, `
      + 'adjunte una nota de correccion; no se reescribe una entrega.',
    );
  }

  const faltantes = verificacion.requisitos.filter((requisito) => !requisito.cumplido);
  if (faltantes.length > 0) {
    throw new ErrorDominio(
      'ENTREGA_BLOQUEADA',
      `No se puede entregar todavia. ${faltantes.map((r) => r.queHacer).join(' ')}`,
    );
  }

  // El acta y el cambio de estado van en LA MISMA transaccion
  // (`enTransaccion` es reentrante: `mover` se suma a esta). Si la maquina
  // de estados rechaza el paso —falta la firma, por ejemplo—, el acta
  // tampoco queda escrita y la entrega se puede volver a intentar.
  const id = await enTransaccion(async (cliente) => {
    const nueva = await repositorio.insertar(cliente, {
      idOrden,
      recibidoPor: peticion.recibidoPor,
      documentoReceptor: peticion.documentoReceptor ?? null,
      esElCliente: peticion.esElCliente,
      observacion: peticion.observacion ?? null,
      idResponsable: actor.id,
    });

    // La maquina de estados es la unica que mueve una orden: aqui se la
    // llama, no se replica. Exige que el acta exista, y existe.
    await transiciones.mover(actor, idOrden, {
      hacia: ESTADO_ORDEN.ENTREGADA,
      observacion: `Entregado a ${peticion.recibidoPor}`
        + (peticion.esElCliente ? '.' : ', que no es el titular de la orden.'),
    });
    return nueva;
  });

  const fila = await repositorio.deOrden(idOrden);
  return aEntrega({ ...fila!, id });
}

export async function deOrden(idOrden: string): Promise<Entrega | null> {
  const fila = await repositorio.deOrden(idOrden);
  return fila === null ? null : aEntrega(fila);
}
