/**
 * Portal publico de consulta.
 *
 * Entra gente sin sesion, y esa es toda la premisa de seguridad de este
 * archivo. Dos consecuencias que no se negocian:
 *
 *  1. SE DEVUELVE LO MINIMO. Nada de telefono, direccion, nombre completo,
 *     falla diagnosticada, montos ni nombre del tecnico. Quien consulta ya
 *     sabe su telefono —lo acaba de teclear— y lo demas seria regalarle
 *     datos de un cliente a cualquiera que pruebe numeros de orden.
 *  2. NO SE DISTINGUE "NO EXISTE" DE "NO ES SUYA". La misma respuesta para
 *     los dos casos; si dijeran cosas distintas, probando numeros con un
 *     telefono cualquiera se sabria que ordenes existen.
 */
import type { EstadoOrden, EstadoPublicoOrden, PasoPublico } from '@servitotal/compartido';
import { ErrorNoEncontrado } from '../../comun/errores.js';
import { esEstadoFinal } from '../../dominio/ordenes/indice.js';
import { ETAPAS_PUBLICAS, etapaDe, situacionDe } from '../../dominio/ordenes/lenguaje-cliente.js';
import * as repositorio from './repositorio.js';

/** Iniciales, para que reconozca su orden sin exponer el nombre. */
function iniciales(nombres: string, apellidos: string | null): string {
  return [nombres, apellidos ?? '']
    .join(' ')
    .split(/\s+/)
    .filter((parte) => parte.length > 0)
    .map((parte) => `${parte[0]!.toUpperCase()}.`)
    .join(' ');
}

export async function consultar(
  numeroOrden: number, telefono: string,
): Promise<EstadoPublicoOrden> {
  const fila = await repositorio.buscarPorNumeroYTelefono(numeroOrden, telefono);
  if (fila === null) {
    // Un solo mensaje para "no existe" y para "no es suya".
    throw new ErrorNoEncontrado(
      'No encontramos una orden con ese numero y ese telefono. Revise el numero de orden ' +
      'y pruebe con el telefono que dio al solicitar el servicio.',
    );
  }

  const estado = fila.estado as EstadoOrden;
  const { situacion, explicacion } = situacionDe(estado);
  const cerrada = esEstadoFinal(estado);
  const etapaActual = etapaDe(estado);

  const eventos = await repositorio.recorridoDe(fila.id);
  const etapasAlcanzadas = new Set(
    eventos.map((evento) => etapaDe(evento.estado_nuevo as EstadoOrden)),
  );
  etapasAlcanzadas.add(etapaDe(estado));

  const momentoDeEtapa = new Map<string, Date>();
  for (const evento of eventos) {
    const etapa = etapaDe(evento.estado_nuevo as EstadoOrden);
    if (!momentoDeEtapa.has(etapa)) momentoDeEtapa.set(etapa, evento.momento);
  }

  const indiceActual = ETAPAS_PUBLICAS.findIndex((etapa) => etapa.clave === etapaActual);
  const recorrido: PasoPublico[] = ETAPAS_PUBLICAS.map((etapa, indice) => ({
    etapa: etapa.clave,
    descripcion: etapa.etiqueta,
    momento: (momentoDeEtapa.get(etapa.clave) ?? fila.fecha_recepcion).toISOString(),
    // Alcanzada si se paso por ella o si quedo atras en el recorrido.
    alcanzado: etapasAlcanzadas.has(etapa.clave) || indice < indiceActual,
    actual: etapa.clave === etapaActual,
  }));

  return {
    numeroOrden: Number(fila.numero),
    cliente: iniciales(fila.cliente_nombres, fila.cliente_apellidos),
    articulo: fila.articulo,
    recibidoEn: fila.fecha_recepcion.toISOString(),
    situacion,
    explicacion,
    // Una orden cerrada no tiene entrega estimada: ya paso lo que iba a pasar.
    entregaEstimada: cerrada ? null : fila.plazo_vence_en?.toISOString() ?? null,
    entregadoEn: fila.fecha_entrega?.toISOString() ?? null,
    cerrada,
    // RF-68: solo tiene sentido si es justamente lo que la detiene.
    repuestoEsperadoPara: estado === 'esperando_repuesto'
      ? fila.repuesto_esperado_para?.toISOString() ?? null
      : null,
    recorrido,
    actualizadoEn: fila.fecha_estado_desde.toISOString(),
  };
}
