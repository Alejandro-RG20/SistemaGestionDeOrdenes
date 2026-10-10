/**
 * Garantia de la orden: la decision vigente, su historial y la
 * reclasificacion manual.
 *
 * La garantia la elige quien registra la orden. Ni el diagnostico ni un
 * cambio en la ficha del articulo la cambian por su cuenta. Cambiarla es
 * una RECLASIFICACION: exige el permiso `garantias.reclasificar` (lo
 * comprueba la ruta) y un motivo escrito, y queda en la bitacora inmutable
 * con la clasificacion anterior, la nueva, el responsable y la fecha.
 */
import {
  ACCION_BITACORA, TIPO_GARANTIA,
  type DecisionGarantia, type GarantiaDeOrden, type PeticionReclasificarGarantia, type TipoGarantia,
} from '@servitotal/compartido';
import { auditar } from '../../comun/auditoria.js';
import type { Actor } from '../../comun/contexto-peticion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorDominio, ErrorNoEncontrado } from '../../comun/errores.js';
import { evaluarReclasificacion } from '../../dominio/garantias/indice.js';
import { definicionDe } from '../../dominio/ordenes/indice.js';
import * as servicioGarantias from '../garantias/servicio.js';
import { exigirCercoSobreOrden } from './alcance.js';
import * as repositorio from './repositorio.js';

export async function obtener(actor: Actor, idOrden: string): Promise<GarantiaDeOrden> {
  await exigirCercoSobreOrden(actor, idOrden);
  const orden = await repositorio.buscarGarantiaDeOrden(idOrden);
  if (orden === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');

  const filas = await repositorio.decisionesDeGarantia(idOrden);
  const historial: DecisionGarantia[] = filas.map((fila) => ({
    tipoAnterior: (fila.tipo_anterior ?? null) as TipoGarantia | null,
    tipo: fila.tipo as TipoGarantia,
    origen: fila.origen === 'registro' && orden.levantada_en_campo && fila.tipo === TIPO_GARANTIA.POR_VALIDAR
      ? 'campo'
      : fila.origen,
    momento: fila.momento.toISOString(),
    responsable: fila.responsable,
    motivo: fila.motivo,
  }));

  // Ordenes registradas antes de que la decision se anotara en la
  // bitacora: se conoce su alta (quien y cuando), no el motivo.
  if (!historial.some((decision) => decision.origen === 'registro' || decision.origen === 'campo')) {
    const primera = historial[0];
    historial.unshift({
      tipoAnterior: null,
      // Si despues hubo cambios, el tipo inicial es el anterior al primero.
      tipo: (primera?.tipoAnterior ?? orden.tipo_garantia) as TipoGarantia,
      origen: 'sin_registro',
      momento: orden.creado_en.toISOString(),
      responsable: orden.creador,
      motivo: null,
    });
  }

  // El estado del articulo es informativo; si falla (articulo inexistente),
  // la decision se muestra igual.
  const consulta = await servicioGarantias
    .consultar(orden.id_articulo, orden.id_cliente, undefined, orden.tipo_garantia)
    .catch(() => null);

  return {
    tipoActual: orden.tipo_garantia as TipoGarantia,
    vigente: historial[historial.length - 1]!,
    historial,
    advertencias: consulta?.advertencias ?? [],
    garantias: consulta?.garantias ?? null,
    puedeReclasificar: actor.permisos.includes('garantias.reclasificar')
      && !definicionDe(orden.estado as never).esFinal,
  };
}

export async function reclasificar(
  actor: Actor, idOrden: string, peticion: PeticionReclasificarGarantia,
): Promise<GarantiaDeOrden> {
  await enTransaccion(async (cliente) => {
    await exigirCercoSobreOrden(actor, idOrden, cliente);
    const orden = await repositorio.buscarGarantiaDeOrden(idOrden, cliente, true);
    if (orden === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');

    const veredicto = evaluarReclasificacion({
      desde: orden.tipo_garantia as TipoGarantia,
      hacia: peticion.tipo,
      ordenCerrada: definicionDe(orden.estado as never).esFinal,
    });
    if (!veredicto.permitida) throw new ErrorDominio('RECLASIFICACION_NO_PERMITIDA', veredicto.motivo);

    // Las advertencias de la nueva garantia se anotan con el motivo: no
    // impiden la decision, pero queda dicho con que informacion se tomo.
    const consulta = await servicioGarantias
      .consultar(orden.id_articulo, orden.id_cliente, cliente, peticion.tipo)
      .catch(() => null);
    const advertencias = servicioGarantias.advertenciasDeLaElegida(consulta?.advertencias ?? []);
    const motivo = advertencias.length === 0
      ? peticion.motivo
      : `${peticion.motivo} (Advertencias al decidir: ${advertencias.join(' ')})`;

    await repositorio.cambiarTipoGarantia(cliente, idOrden, peticion.tipo, actor.id);
    await auditar(cliente, [{
      tabla: 'orden_servicio', idRegistro: idOrden, accion: ACCION_BITACORA.MODIFICAR,
      campo: 'tipo_garantia', valorAnterior: orden.tipo_garantia, valorNuevo: peticion.tipo,
      motivo, idUsuario: actor.id,
    }]);
  });
  return obtener(actor, idOrden);
}
