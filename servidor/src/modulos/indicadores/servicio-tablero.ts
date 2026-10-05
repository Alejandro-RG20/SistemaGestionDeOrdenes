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

export async function obtener(actor: Actor): Promise<Tablero> {
  const cerco = await cercoDe(actor);

  // En secuencia: si esto se llamara dentro de una transaccion, las dos
  // consultas compartirian un cliente que no admite paralelismo.
  const c = await repositorio.cifras(cerco);
  const filas = await repositorio.actividad(cerco, LINEAS_DE_ACTIVIDAD);

  const cifras: readonly CifraDelTablero[] = [
    {
      clave: 'ordenes_abiertas',
      etiqueta: 'Ordenes abiertas',
      valor: c.ordenes_abiertas,
      explicacion: 'Todo lo que el centro tiene encima ahora mismo.',
      enlace: '/ordenes?soloActivas=true',
      tono: 'normal',
    },
    {
      clave: 'ordenes_atrasadas',
      etiqueta: 'Con plazo vencido',
      valor: c.ordenes_atrasadas,
      explicacion: 'Se les paso el plazo que se le prometio al cliente.',
      enlace: '/ordenes?soloVencidas=true',
      tono: tonoPorVolumen(c.ordenes_atrasadas, 1, 20),
    },
    {
      clave: 'en_reparacion',
      etiqueta: 'En reparacion',
      valor: c.en_reparacion,
      explicacion: 'Un tecnico las tiene abiertas en el banco.',
      enlace: '/ordenes?estado=en_reparacion',
      tono: 'normal',
    },
    {
      clave: 'esperando_repuesto',
      etiqueta: 'Esperando repuesto',
      valor: c.esperando_repuesto,
      explicacion: 'Detenidas por una pieza que no esta. Cada una es un cliente esperando.',
      enlace: '/ordenes?estado=esperando_repuesto',
      tono: tonoPorVolumen(c.esperando_repuesto, 1, 30),
    },
    {
      clave: 'visitas_de_hoy',
      etiqueta: 'Visitas de hoy',
      valor: c.visitas_de_hoy,
      explicacion: 'Programadas para hoy y todavia vigentes.',
      enlace: '/agenda',
      tono: 'normal',
    },
    {
      clave: 'tecnicos_activos',
      etiqueta: 'Tecnicos activos',
      valor: c.tecnicos_activos,
      explicacion: 'Con ficha activa, de ruta y de planta.',
      enlace: null,
      tono: 'normal',
    },
    {
      clave: 'stock_bajo',
      etiqueta: 'Repuestos bajo minimo',
      valor: c.stock_bajo,
      explicacion: 'En bodegas que surten. La de piezas sustituidas no cuenta: ahi no se repone nada.',
      enlace: '/inventario?bajoMinimo=1',
      tono: tonoPorVolumen(c.stock_bajo, 1, 50),
    },
    {
      clave: 'solicitudes_abiertas',
      etiqueta: 'Solicitudes de repuesto',
      valor: c.solicitudes_abiertas,
      explicacion: 'Pedidas por un tecnico y todavia sin cerrar el recorrido.',
      enlace: '/inventario/recorrido',
      tono: tonoPorVolumen(c.solicitudes_abiertas, 1, 40),
    },
    {
      clave: 'compras_pendientes',
      etiqueta: 'Compras pendientes',
      valor: c.compras_pendientes,
      explicacion: 'Pedidas al proveedor y no recibidas por completo.',
      enlace: '/compras',
      tono: 'normal',
    },
    {
      clave: 'cobros_pendientes',
      etiqueta: 'Cobros pendientes',
      valor: c.cobros_pendientes,
      explicacion: 'Expedientes que todavia no se cobraron ni se cerraron.',
      enlace: '/cobros',
      tono: tonoPorVolumen(c.cobros_pendientes, 1, 100),
    },
    {
      clave: 'excepciones_pendientes',
      etiqueta: 'Excepciones de sincronizacion',
      valor: c.excepciones_pendientes,
      explicacion: 'Trabajo de campo que el servidor conservo pero no pudo aplicar. Nada se perdio.',
      enlace: '/excepciones',
      tono: tonoPorVolumen(c.excepciones_pendientes, 1, 10),
    },
  ];

  const actividad: readonly ActividadReciente[] = filas.map((fila) => ({
    momento: fila.momento.toISOString(),
    quien: fila.quien,
    accion: fila.accion,
    detalle: fila.detalle,
    enlace: fila.id_orden === null ? null : `/ordenes/${fila.id_orden}`,
  }));

  return { calculadoEn: new Date().toISOString(), cifras, actividad };
}
