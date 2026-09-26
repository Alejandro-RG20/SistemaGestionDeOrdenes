/**
 * Entrega del articulo al cliente (RF-41).
 *
 * LA LISTA DE REQUISITOS SE CALCULA, NO SE DECLARA.
 *
 * El pliego enumera lo que hay que verificar antes de entregar: reparacion
 * terminada, validacion tecnica aprobada cuando corresponda, cotizacion
 * aceptada cuando corresponda, pago hecho cuando corresponda. La tentacion
 * es poner una casilla «todo revisado» en la pantalla; eso convierte el
 * control en un tramite y es exactamente lo que el pliego prohibe para los
 * expedientes de cobro (§39). Aqui se aplica el mismo criterio.
 *
 * Cada requisito se comprueba contra los datos y se devuelve con QUE HACER
 * si no se cumple, porque quien atiende el mostrador tiene al cliente
 * delante y necesita saber a donde mandarlo, no que se le diga que no.
 *
 * «Cuando corresponda» tambien se calcula: una orden de garantia del
 * proveedor no necesita ni cotizacion ni pago, y pedirselos seria inventar
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

/** Un centavo de diferencia por redondeo no es una deuda. */
const TOLERANCIA_CORDOBAS = 0.5;

export async function verificar(idOrden: string): Promise<VerificacionDeEntrega> {
  const orden = await repositorio.estadoParaEntrega(idOrden);
  if (orden === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');

  const entregaPrevia = await repositorio.deOrden(idOrden);
  const aprobada = await validaciones.estaAprobada(idOrden);

  const total = Number(orden.total);
  const pagado = Number(orden.pagado);
  const cobrableAlCliente = orden.tipo_garantia === TIPO_GARANTIA.PARTICULAR && total > 0;

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
          + 'responder por la reparacion ni cobrarsela al proveedor.',
    },
  ];

  if (cobrableAlCliente) {
    // Solo las ordenes que el cliente paga necesitan cotizacion aceptada y
    // dinero entrado. Exigirselo a una garantia de proveedor seria inventar
    // un tramite que el negocio no tiene.
    const aceptada = orden.cotizacion_aceptada === true;
    requisitos.push({
      clave: 'cotizacion_aceptada',
      etiqueta: 'El cliente autorizo el costo',
      cumplido: aceptada,
      queHacer: aceptada
        ? ''
        : orden.tiene_cotizacion
          ? 'Hay cotizacion pero el cliente todavia no la acepto. Registre la autorizacion.'
          : 'Esta orden es particular y no tiene cotizacion registrada. Elaborela y hagasela '
            + 'firmar antes de entregar.',
    });

    const cubierto = pagado + TOLERANCIA_CORDOBAS >= total;
    requisitos.push({
      clave: 'pago_confirmado',
      etiqueta: 'El pago esta confirmado',
      cumplido: cubierto,
      queHacer: cubierto
        ? ''
        : `Faltan C$ ${(total - pagado).toFixed(2)} por confirmar. Un pago registrado pero sin `
          + 'confirmar no habilita la entrega: registrelo en cobros y pida la confirmacion.',
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
  const verificacion = await verificar(idOrden);

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

  const id = await enTransaccion((cliente) => repositorio.insertar(cliente, {
    idOrden,
    recibidoPor: peticion.recibidoPor,
    documentoReceptor: peticion.documentoReceptor ?? null,
    esElCliente: peticion.esElCliente,
    observacion: peticion.observacion ?? null,
    idResponsable: actor.id,
  }));

  // La maquina de estados es la unica que mueve una orden: aqui se la
  // llama, no se replica.
  await transiciones.mover(actor, idOrden, {
    hacia: ESTADO_ORDEN.ENTREGADA,
    observacion: `Entregado a ${peticion.recibidoPor}`
      + (peticion.esElCliente ? '.' : ', que no es el titular de la orden.'),
  });

  const fila = await repositorio.deOrden(idOrden);
  return aEntrega({ ...fila!, id });
}

export async function deOrden(idOrden: string): Promise<Entrega | null> {
  const fila = await repositorio.deOrden(idOrden);
  return fila === null ? null : aEntrega(fila);
}
