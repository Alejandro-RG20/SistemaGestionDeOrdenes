/**
 * El tablero de inicio (pliego §42).
 *
 * Aqui las cifras crudas se vuelven tarjetas: etiqueta, explicacion, enlace y
 * tono. Esa traduccion vive en el servidor y no en el panel por una razon
 * concreta: el tono —si una cifra es critica o solo informativa— es una regla
 * de negocio, no una decision de estilo. Que 40 ordenes atrasadas sean
 * criticas y 0 no lo sean es lo mismo en cualquier pantalla que las muestre.
 */
import type { ActividadReciente, CifraDelTablero, Tablero } from '@servitotal/compartido';
import { CODIGO_ROL } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import * as repositorio from './repositorio-tablero.js';
import * as repositorioOrdenes from '../ordenes/repositorio.js';

const LINEAS_DE_ACTIVIDAD = 15;

const ROLES_ACOTADOS_AL_TECNICO: readonly string[] = [
  CODIGO_ROL.TECNICO_RUTA, CODIGO_ROL.TECNICO_PLANTA,
];

/** El mismo cerco del resto del sistema, resuelto para el tablero. */
async function cercoDe(actor: Actor): Promise<repositorio.CercoDelTablero> {
  const idTienda = actor.idTienda ?? null;
  if (!ROLES_ACOTADOS_AL_TECNICO.includes(actor.rol)) {
    return { idTienda, idTecnico: null, idUsuario: null };
  }
  const tecnico = await repositorioOrdenes.buscarTecnicoDeUsuario(actor.id);
  return {
    idTienda,
    // Sin ficha de tecnico el cerco se cierra, no se abre.
    idTecnico: tecnico?.id ?? '00000000-0000-0000-0000-000000000000',
    idUsuario: actor.id,
  };
}

/** Cero no alarma; a partir de ahi, el tono lo decide el propio numero. */
function tonoPorVolumen(valor: number, atencion: number, critico: number): CifraDelTablero['tono'] {
  if (valor >= critico) return 'critico';
  if (valor >= atencion) return 'atencion';
  return 'normal';
}

const LINEAS_DE_INVENTARIO = 10;

export async function obtener(actor: Actor): Promise<Tablero> {
  const cerco = await cercoDe(actor);
  const cercado = cerco.idTienda !== null || cerco.idTecnico !== null;

  // En secuencia: si esto se llamara dentro de una transaccion, las
  // consultas compartirian un cliente que no admite paralelismo.
  const c = await repositorio.cifras(cerco);
  const filas = await repositorio.actividad(cerco, LINEAS_DE_ACTIVIDAD);
  const carga = await repositorio.cargaPorTecnico(cerco);
  const consumidos = await repositorio.masConsumidos(LINEAS_DE_INVENTARIO);
  // Los movimientos del centro entero no son de la incumbencia de quien
  // esta cercado a su tienda o a sus ordenes.
  const recientes = cercado ? [] : await repositorio.movimientosRecientes(LINEAS_DE_INVENTARIO);

  const cifras: readonly CifraDelTablero[] = [
    // ── ordenes ──
    {
      clave: 'registradas_30d', grupo: 'ordenes',
      etiqueta: 'Registradas (30 dias)',
      valor: c.registradas_30d,
      explicacion: 'Ordenes recibidas en los ultimos 30 dias.',
      enlace: '/ordenes',
      tono: 'normal',
    },
    {
      clave: 'sin_asignar', grupo: 'ordenes',
      etiqueta: 'Pendientes de asignacion',
      valor: c.sin_asignar,
      explicacion: 'Abiertas y sin tecnico. Hay que repartirlas.',
      enlace: '/taller',
      tono: tonoPorVolumen(c.sin_asignar, 1, 25),
    },
    {
      clave: 'en_diagnostico', grupo: 'ordenes',
      etiqueta: 'En diagnostico',
      valor: c.en_diagnostico,
      explicacion: 'Un tecnico esta determinando la falla.',
      enlace: '/ordenes?estado=en_diagnostico',
      tono: 'normal',
    },
    {
      clave: 'en_reparacion', grupo: 'ordenes',
      etiqueta: 'En reparacion',
      valor: c.en_reparacion,
      explicacion: 'Un tecnico las tiene abiertas en el banco.',
      enlace: '/ordenes?estado=en_reparacion',
      tono: 'normal',
    },
    {
      clave: 'esperando_repuesto', grupo: 'ordenes',
      etiqueta: 'Esperando repuesto',
      valor: c.esperando_repuesto,
      explicacion: 'Detenidas por una pieza que no esta. Cada una es un cliente esperando.',
      enlace: '/ordenes?estado=esperando_repuesto',
      tono: tonoPorVolumen(c.esperando_repuesto, 1, 30),
    },
    {
      clave: 'esperando_autorizacion', grupo: 'ordenes',
      etiqueta: 'Esperando autorizacion',
      valor: c.esperando_autorizacion,
      explicacion: 'Diagnosticadas; el cliente todavia no autoriza la reparacion.',
      enlace: '/ordenes?estado=esperando_autorizacion',
      tono: tonoPorVolumen(c.esperando_autorizacion, 1, 30),
    },
    {
      clave: 'por_entregar', grupo: 'ordenes',
      etiqueta: 'Finalizadas por entregar',
      valor: c.por_entregar,
      explicacion: 'Reparadas; el articulo espera que el cliente lo retire.',
      enlace: '/ordenes?estado=finalizada',
      tono: 'normal',
    },
    {
      clave: 'cerradas_30d', grupo: 'ordenes',
      etiqueta: 'Cerradas (30 dias)',
      valor: c.cerradas_30d,
      explicacion: 'Entregadas o cerradas sin reparar en los ultimos 30 dias.',
      enlace: '/ordenes?estado=entregada',
      tono: 'normal',
    },
    {
      clave: 'ordenes_atrasadas', grupo: 'ordenes',
      etiqueta: 'Retrasadas',
      valor: c.ordenes_atrasadas,
      explicacion: 'Se les paso el plazo que se le prometio al cliente.',
      enlace: '/ordenes?soloVencidas=true',
      tono: tonoPorVolumen(c.ordenes_atrasadas, 1, 20),
    },
    {
      clave: 'dias_promedio_reparacion', grupo: 'ordenes',
      etiqueta: 'Tiempo promedio de reparacion',
      valor: c.dias_promedio_reparacion ?? 0,
      unidad: 'dias',
      explicacion: c.dias_promedio_reparacion === null
        ? 'Sin entregas en los ultimos 90 dias: no hay promedio que mostrar.'
        : 'De la recepcion a la entrega, sobre lo entregado en los ultimos 90 dias.',
      enlace: '/indicadores',
      tono: 'normal',
    },
    // ── campo ──
    {
      clave: 'visitas_de_hoy', grupo: 'campo',
      etiqueta: 'Visitas de hoy',
      valor: c.visitas_de_hoy,
      explicacion: 'Programadas para hoy y todavia vigentes.',
      enlace: '/agenda',
      tono: 'normal',
    },
    {
      clave: 'tecnicos_activos', grupo: 'campo',
      etiqueta: 'Tecnicos activos',
      valor: c.tecnicos_activos,
      explicacion: 'Con ficha activa, de ruta y de planta.',
      enlace: null,
      tono: 'normal',
    },
    {
      clave: 'excepciones_pendientes', grupo: 'campo',
      etiqueta: 'Excepciones de sincronizacion',
      valor: c.excepciones_pendientes,
      explicacion: 'Trabajo de campo que el servidor conservo pero no pudo aplicar. Nada se perdio.',
      enlace: '/excepciones',
      tono: tonoPorVolumen(c.excepciones_pendientes, 1, 10),
    },
    // ── inventario ──
    {
      clave: 'unidades_disponibles', grupo: 'inventario',
      etiqueta: 'Unidades disponibles',
      valor: c.unidades_disponibles,
      unidad: 'unidades',
      explicacion: 'En bodegas que surten, descontado lo reservado para ordenes.',
      enlace: '/inventario/disponibilidad',
      tono: 'normal',
    },
    {
      clave: 'stock_bajo', grupo: 'inventario',
      etiqueta: 'Repuestos bajo minimo',
      valor: c.stock_bajo,
      explicacion: 'En bodegas que surten. La de piezas sustituidas no cuenta: ahi no se repone nada.',
      enlace: '/inventario?bajoMinimo=1',
      tono: tonoPorVolumen(c.stock_bajo, 1, 50),
    },
    {
      clave: 'solicitudes_abiertas', grupo: 'inventario',
      etiqueta: 'Solicitudes pendientes',
      valor: c.solicitudes_abiertas,
      explicacion: 'Pedidas por un tecnico y todavia sin entregar.',
      enlace: '/inventario/recorrido',
      tono: tonoPorVolumen(c.solicitudes_abiertas, 1, 40),
    },
    {
      clave: 'unidades_reservadas', grupo: 'inventario',
      etiqueta: 'Unidades reservadas',
      valor: c.unidades_reservadas,
      unidad: 'unidades',
      explicacion: 'Aprobadas para una orden y apartadas en bodega, aun sin entregar.',
      enlace: '/inventario/disponibilidad?soloConMovimiento=1',
      tono: 'normal',
    },
    {
      clave: 'unidades_entregadas_30d', grupo: 'inventario',
      etiqueta: 'Entregadas a tecnicos (30 dias)',
      valor: c.unidades_entregadas_30d,
      unidad: 'unidades',
      explicacion: 'Piezas que bodega entrego contra una solicitud.',
      enlace: '/inventario/movimientos',
      tono: 'normal',
    },
    {
      clave: 'unidades_consumidas_30d', grupo: 'inventario',
      etiqueta: 'Consumidas (30 dias)',
      valor: c.unidades_consumidas_30d,
      unidad: 'unidades',
      explicacion: 'Piezas instaladas en un articulo, cada una atada a su orden.',
      enlace: '/inventario/movimientos',
      tono: 'normal',
    },
    {
      clave: 'ajustes_30d', grupo: 'inventario',
      etiqueta: 'Diferencias de inventario (30 dias)',
      valor: c.ajustes_30d,
      explicacion: 'Ajustes justificados: diferencias encontradas al contar fisicamente.',
      enlace: '/inventario/movimientos',
      tono: tonoPorVolumen(c.ajustes_30d, 5, 20),
    },
    {
      clave: 'compras_pendientes', grupo: 'inventario',
      etiqueta: 'Reposiciones pendientes',
      valor: c.compras_pendientes,
      explicacion: 'Pedidas al proveedor y no recibidas por completo en bodega.',
      enlace: '/compras',
      tono: 'normal',
    },
  ];

  const actividad: readonly ActividadReciente[] = filas.map((fila) => ({
    momento: fila.momento.toISOString(),
    quien: fila.quien,
    accion: fila.accion,
    detalle: fila.detalle,
    enlace: fila.id_orden === null ? null : `/ordenes/${fila.id_orden}`,
  }));

  return {
    calculadoEn: new Date().toISOString(),
    cifras,
    actividad,
    cargaPorTecnico: carga.map((fila) => ({
      idTecnico: fila.id_tecnico,
      tecnico: fila.tecnico,
      tipo: fila.tipo,
      abiertas: fila.abiertas,
      vencidas: fila.vencidas,
      enReparacion: fila.en_reparacion,
      esperandoRepuesto: fila.esperando_repuesto,
    })),
    masConsumidos: consumidos.map((fila) => ({
      idRepuesto: fila.id_repuesto,
      codigo: fila.codigo,
      descripcion: fila.descripcion,
      piezas: fila.piezas,
    })),
    movimientosRecientes: recientes.map((fila) => ({
      id: fila.id,
      momento: fila.creado_en.toISOString(),
      tipo: fila.tipo,
      codigo: fila.codigo,
      descripcion: fila.descripcion,
      cantidad: fila.cantidad,
      idOrden: fila.id_orden,
      codigoOrden: fila.codigo_orden,
      responsable: fila.responsable,
    })),
  };
}
