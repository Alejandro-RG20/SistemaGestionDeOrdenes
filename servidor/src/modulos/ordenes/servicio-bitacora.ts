/**
 * Bitacora de la orden: comentarios generales de los usuarios.
 *
 * No es un modulo nuevo ni una tabla nueva. Cada comentario es un asiento
 * de la tabla `bitacora` de auditoria —la misma que ya registra
 * asignaciones y cambios de la orden— con:
 *
 *   tabla = 'orden_servicio', id_registro = la orden, accion = 'crear',
 *   campo = 'bitacora' (o 'bitacora.<tipo>'), valor_nuevo = el texto,
 *   id_usuario = quien esta en sesion, momento = now() del servidor.
 *
 * Por eso el autor y la fecha no se pueden falsificar (no vienen del
 * cliente) y el comentario no se puede editar ni borrar: la tabla tiene
 * el disparador de solo agregar de la migracion 0023. Una correccion es
 * otro asiento que apunta al corregido.
 *
 * Un comentario NUNCA mueve la orden. Dos tipos de asiento sirven de
 * constancia para la autorizacion comercial de una visita particular con
 * pago previo —«pago registrado» y «confirmo el pago»—, y se distinguen
 * porque se marcan asi al escribirlos, no porque el texto diga «pago».
 */
import type { EntradaBitacora, PeticionRegistrarBitacora } from '@servitotal/compartido';
import { ESTADOS_FINALES, TIPO_ENTRADA_BITACORA } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorAutorizacion, ErrorDominio, ErrorNoEncontrado } from '../../comun/errores.js';
import { alcanceDe, exigirCerco } from './alcance.js';
import * as repositorio from './repositorio.js';

const CAMPO_DE_TIPO: Readonly<Record<string, string>> = {
  [TIPO_ENTRADA_BITACORA.COMENTARIO]: 'bitacora',
  [TIPO_ENTRADA_BITACORA.PAGO_REGISTRADO]: 'bitacora.pago_registrado',
  [TIPO_ENTRADA_BITACORA.PAGO_CONFIRMADO]: 'bitacora.pago_confirmado',
  [TIPO_ENTRADA_BITACORA.CORRECCION]: 'bitacora.correccion',
};

export async function registrar(
  actor: Actor, idOrden: string, peticion: PeticionRegistrarBitacora,
): Promise<EntradaBitacora> {
  return enTransaccion(async (cliente) => {
    // Bloquea la orden: dos confirmaciones simultaneas se ponen en fila.
    const orden = await repositorio.buscarContextoTransicion(idOrden, cliente);
    if (orden === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');
    // Quien no puede ver la orden no puede escribir en ella.
    exigirCerco(await alcanceDe(actor, cliente), orden);

    const tipo = peticion.tipo ?? TIPO_ENTRADA_BITACORA.COMENTARIO;
    let referencia: string | null = null;

    if (tipo === TIPO_ENTRADA_BITACORA.PAGO_REGISTRADO || tipo === TIPO_ENTRADA_BITACORA.PAGO_CONFIRMADO) {
      if ((ESTADOS_FINALES as readonly string[]).includes(orden.estado)) {
        throw new ErrorDominio('ORDEN_CERRADA', 'La orden esta cerrada: registre un comentario comun.');
      }
    }

    if (tipo === TIPO_ENTRADA_BITACORA.PAGO_CONFIRMADO) {
      // Confirmar un pago es un acto de quien registra decisiones
      // comerciales, y de una persona distinta de quien lo registro.
      if (!actor.permisos.includes('taller.cotizacion.autorizar')) {
        throw new ErrorAutorizacion(
          'Confirmar un pago corresponde a quien registra la decision comercial del cliente.',
        );
      }
      const registros = await repositorio.autoresDePagoRegistrado(cliente, idOrden);
      if (registros.length === 0) {
        throw new ErrorDominio('PAGO_SIN_REGISTRAR', 'No hay ningun pago registrado en la bitacora de esta orden que confirmar.');
      }
      if (registros.every((autor) => autor === actor.id)) {
        throw new ErrorDominio(
          'CONFIRMACION_PROPIA',
          'El pago lo registro usted: tiene que confirmarlo otra persona autorizada.',
        );
      }
    }

    if (tipo === TIPO_ENTRADA_BITACORA.CORRECCION) {
      const corregida = await repositorio.entradaDeBitacora(cliente, idOrden, peticion.idEntradaCorregida ?? '');
      if (corregida === null) {
        throw new ErrorDominio('ENTRADA_INEXISTENTE', 'La entrada que quiere corregir no es de esta orden.');
      }
      referencia = corregida;
    }

    const id = await repositorio.insertarEntradaBitacora(cliente, {
      idOrden,
      campo: CAMPO_DE_TIPO[tipo] ?? 'bitacora',
      texto: peticion.texto,
      referencia,
      idUsuario: actor.id,
    });
    const entrada = await repositorio.buscarEntradaBitacora(cliente, id);
    return entrada!;
  });
}
