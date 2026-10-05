/**
 * El kardex y el recorrido de las solicitudes, del lado del servicio.
 *
 * Aqui esta el cerco: un tecnico solo ve SUS solicitudes. Es el mismo
 * principio que con las ordenes —el permiso dice que puede hacer, no sobre
 * que— aplicado a un modulo distinto, y por eso se escribe explicito y no se
 * deja al criterio de cada consulta.
 */
import {
  CODIGO_ROL, ETIQUETA_ESTADO_SOLICITUD, destinosDeSolicitud,
  type Kardex, type LineaKardex, type Paginacion, type SolicitudConRecorrido,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorNoEncontrado } from '../../comun/errores.js';
import * as repositorio from './repositorio.js';
import * as repositorioKardex from './repositorio-kardex.js';
import * as repositorioSolicitudes from './repositorio-solicitudes.js';
import * as repositorioOrdenes from '../ordenes/repositorio.js';

const ROLES_TECNICOS: readonly string[] = [CODIGO_ROL.TECNICO_RUTA, CODIGO_ROL.TECNICO_PLANTA];

/** El tecnico del actor, cuando su rol lo acota a lo suyo. */
async function cercoDelTecnico(actor: Actor): Promise<string | undefined> {
  if (!ROLES_TECNICOS.includes(actor.rol)) return undefined;
  const tecnico = await repositorioOrdenes.buscarTecnicoDeUsuario(actor.id);
  // Sin ficha de tecnico el cerco se cierra, no se abre: un identificador
  // imposible deja el listado vacio en vez de mostrarlo todo.
  return tecnico?.id ?? '00000000-0000-0000-0000-000000000000';
}

export async function obtenerKardex(
  consulta: repositorioKardex.FiltroKardex, pagina: ParametrosPagina,
): Promise<Kardex & { paginacion: Paginacion }> {
  const repuesto = await repositorio.buscarRepuesto(consulta.idRepuesto);
  if (repuesto === null) {
    throw new ErrorNoEncontrado('No existe un repuesto con ese identificador.');
  }

  const bodega = consulta.idBodega === undefined
    ? null
    : await repositorio.buscarBodega(consulta.idBodega);

  // En secuencia y no en paralelo: el saldo inicial es un dato de entrada de
  // la consulta del listado, no algo que se pueda pedir a la vez.
  const saldoInicial = await repositorioKardex.saldoAnterior(consulta);
  const total = await repositorioKardex.contar(consulta);
  const filas = await repositorioKardex.listar(
    consulta, saldoInicial, pagina.tamano, pagina.desplazamiento,
  );

  const lineas: LineaKardex[] = filas.map((fila) => ({
    idMovimiento: fila.id,
    momento: fila.momento.toISOString(),
    tipo: fila.tipo,
    bodegaOrigen: fila.bodega_origen,
    bodegaDestino: fila.bodega_destino,
    entrada: fila.entrada,
    salida: fila.salida,
    saldo: fila.saldo,
    precioUnitario: Number(fila.precio_unitario),
    codigoOrden: fila.codigo_orden,
    responsable: fila.responsable,
    justificacion: fila.justificacion,
  }));

  return {
    idRepuesto: repuesto.id,
    codigo: repuesto.codigo,
    descripcion: repuesto.descripcion,
    idBodega: bodega?.id ?? null,
    bodega: bodega?.nombre ?? null,
    saldoInicial,
    saldoFinal: lineas.at(-1)?.saldo ?? saldoInicial,
    lineas,
    paginacion: construirPaginacion(pagina, total),
  };
}

function aSolicitud(
  fila: repositorioSolicitudes.FilaSolicitudDetallada,
): SolicitudConRecorrido {
  const comoFecha = (valor: Date | null): string | null => valor?.toISOString() ?? null;
  const comoDia = (valor: Date | null): string | null => valor?.toISOString().slice(0, 10) ?? null;
  return {
    id: fila.id,
    idOrden: fila.id_orden,
    codigoOrden: fila.codigo_orden,
    numeroOrden: Number(fila.numero_orden),
    idRepuesto: fila.id_repuesto,
    codigo: fila.codigo,
    descripcion: fila.descripcion,
    cantidad: fila.cantidad,
    via: fila.via,
    estado: fila.estado,
    etiquetaEstado: ETIQUETA_ESTADO_SOLICITUD[fila.estado] ?? fila.estado,
    motivo: fila.motivo,
    liberada: fila.liberada,
    fechaSolicitud: comoDia(fila.fecha_solicitud)!,
    fechaEstimada: comoDia(fila.fecha_estimada),
    fechaIngreso: comoDia(fila.fecha_ingreso),
    tecnico: fila.tecnico,
    solicitadaPor: fila.solicitada_por,
    revisadaPor: fila.revisada_por,
    revisadaEn: comoFecha(fila.revisada_en),
    preparadaPor: fila.preparada_por,
    preparadaEn: comoFecha(fila.preparada_en),
    entregadaPor: fila.entregada_por,
    entregadaEn: comoFecha(fila.entregada_en),
    recibidaEn: comoFecha(fila.recibida_en),
    pasosPosibles: destinosDeSolicitud(fila.estado),
  };
}

export async function listarRecorrido(
  actor: Actor, filtroPedido: repositorioSolicitudes.FiltroRecorrido, pagina: ParametrosPagina,
): Promise<{ datos: readonly SolicitudConRecorrido[]; paginacion: Paginacion }> {
  const cerco = await cercoDelTecnico(actor);
  const filtro: repositorioSolicitudes.FiltroRecorrido = cerco === undefined
    ? filtroPedido
    : { ...filtroPedido, idTecnico: cerco };

  // En secuencia: comparten ejecutor si la lectura cae dentro de una
  // transaccion, y un cliente de transaccion atiende una consulta a la vez.
  const total = await repositorioSolicitudes.contar(filtro);
  const filas = await repositorioSolicitudes.listar(filtro, pagina.tamano, pagina.desplazamiento);

  return {
    datos: filas.map(aSolicitud),
    paginacion: construirPaginacion(pagina, total),
  };
}

export function aSolicitudPublica(
  fila: repositorioSolicitudes.FilaSolicitudDetallada,
): SolicitudConRecorrido {
  return aSolicitud(fila);
}
