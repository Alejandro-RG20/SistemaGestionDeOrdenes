/**
 * La bandeja de avisos del panel.
 *
 * El negocio decidio que el sistema NO empuja nada: no hay correo ni
 * mensaje. "Se notifica al responsable" quiere decir que cuando esa persona
 * entra al panel, lo que le toca esta ahi.
 *
 * Eso pone toda la carga en una cosa: QUE LA BANDEJA SEA CREIBLE. Si le
 * muestra a cada quien los problemas de los demas, se vuelve ruido y se deja
 * de mirar; y siendo el unico canal, dejar de mirarla es quedarse sin aviso.
 * De ahi las dos reglas de este archivo:
 *
 *  1. CADA GRUPO SE MUESTRA SOLO A QUIEN PUEDE HACER ALGO CON EL. El permiso
 *     decide, no el rol: quien no puede resolver excepciones no las ve.
 *  2. LAS ORDENES SON LAS SUYAS. Quien no tiene mando sobre el taller ve las
 *     que tiene a su cargo o asignadas; las jefaturas ven todas, porque
 *     destrabar lo de otros es justamente su trabajo.
 *
 * Y se calcula en el momento, contra el estado vivo. Si el aviso sigue ahi
 * es porque el problema sigue ahi.
 */
import {
  GRAVEDAD_AVISO, TIPO_AVISO,
  type BandejaDeAvisos, type GrupoDeAvisos, type RenglonDeAviso,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import * as repositorio from './repositorio.js';

/** A partir de cuantos dias sin respuesta se avisa de un expediente enviado. */
const DIAS_SIN_RESPUESTA = 30;

/** Permisos que dan mando sobre el taller entero. */
const MANDO_SOBRE_ORDENES = ['ordenes.asignar', 'ordenes.anular', 'ordenes.cerrar'] as const;

function puede(actor: Actor, permiso: string): boolean {
  return actor.permisos.includes(permiso as never);
}

function tieneMando(actor: Actor): boolean {
  return MANDO_SOBRE_ORDENES.some((permiso) => puede(actor, permiso));
}

function redondear(valor: number | null): number | null {
  return valor === null ? null : Math.round(valor * 10) / 10;
}

export async function bandejaDe(actor: Actor): Promise<BandejaDeAvisos> {
  const grupos: GrupoDeAvisos[] = [];
  const mando = tieneMando(actor);
  const idTecnico = await repositorio.tecnicoDeUsuario(actor.id);

  // ── ordenes en riesgo ──
  if (puede(actor, 'ordenes.consultar')) {
    const alcance = mando
      ? {}
      : { idResponsable: actor.id, ...(idTecnico === null ? {} : { idTecnico }) };
    const porQue = mando
      ? 'Usted responde por el taller: aqui salen todas.'
      : 'Son las ordenes que tiene a su cargo o asignadas.';

    const vencidas = await repositorio.ordenesEnRiesgo({ vencidas: true, ...alcance });
    if (vencidas.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.ORDEN_VENCIDA,
        gravedad: GRAVEDAD_AVISO.CRITICO,
        titulo: 'Ordenes con el plazo vencido',
        porQue,
        total: vencidas.total,
        muestra: vencidas.muestra.map((fila): RenglonDeAviso => ({
          id: fila.id,
          titulo: `Orden ${fila.numero} · ${fila.cliente}`,
          detalle: `${fila.articulo} · ${fila.estado.replace(/_/g, ' ')} · ` +
            `${Math.round(fila.horas_de_atraso ?? 0)} h de atraso`,
          enlace: `/ordenes/${fila.id}`,
          magnitud: redondear(fila.horas_de_atraso),
        })),
        enlaceVerTodo: '/ordenes?soloVencidas=1',
      });
    }

    const enAlerta = await repositorio.ordenesEnRiesgo({ vencidas: false, ...alcance });
    if (enAlerta.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.ORDEN_EN_ALERTA,
        gravedad: GRAVEDAD_AVISO.ATENCION,
        titulo: 'Ordenes por vencer',
        porQue: `${porQue} Entran en la ventana de aviso de su plazo.`,
        total: enAlerta.total,
        muestra: enAlerta.muestra.map((fila): RenglonDeAviso => ({
          id: fila.id,
          titulo: `Orden ${fila.numero} · ${fila.cliente}`,
          detalle: `${fila.articulo} · ${fila.estado.replace(/_/g, ' ')}`,
          enlace: `/ordenes/${fila.id}`,
          magnitud: redondear(fila.horas_de_atraso),
        })),
        enlaceVerTodo: '/ordenes?enAlerta=1',
      });
    }
  }

  // ── excepciones de sincronizacion ──
  if (puede(actor, 'campo.excepcion.resolver')) {
    const excepciones = await repositorio.excepcionesPendientes();
    if (excepciones.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.EXCEPCION_SINCRONIZACION,
        gravedad: GRAVEDAD_AVISO.CRITICO,
        titulo: 'Trabajo de campo sin conciliar',
        // Esto no es una alerta mas: es trabajo que un tecnico hizo de
        // verdad y que el sistema todavia no refleja.
        porQue: 'Un tecnico registro esto en campo y el servidor no lo pudo aplicar. ' +
          'Esta integro, pero nadie lo ha conciliado.',
        total: excepciones.total,
        muestra: excepciones.muestra.map((fila): RenglonDeAviso => ({
          id: fila.id,
          titulo: fila.numero_orden === null
            ? 'Operacion sin orden asociada'
            : `Orden ${fila.numero_orden}`,
          detalle: `${fila.tecnico ?? 'Tecnico no identificado'} · ${fila.motivo}`,
          enlace: `/excepciones/${fila.id}`,
          magnitud: redondear(fila.dias),
        })),
        enlaceVerTodo: '/excepciones',
      });
    }
  }

  // ── cobros ──
  if (puede(actor, 'cobros.expediente.conformar')) {
    const bloqueados = await repositorio.expedientesBloqueados();
    if (bloqueados.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.EXPEDIENTE_BLOQUEADO,
        gravedad: GRAVEDAD_AVISO.ATENCION,
        titulo: 'Expedientes que no pueden salir',
        porQue: 'A su orden le falta evidencia obligatoria. Mientras no aparezca, ' +
          'ese dinero no se le puede reclamar a nadie.',
        total: bloqueados.total,
        muestra: bloqueados.muestra.map((fila): RenglonDeAviso => ({
          id: fila.id,
          titulo: `Orden ${fila.numero_orden} · ${fila.marca ?? 'Poliza'}`,
          detalle: `C$ ${Number(fila.monto_reclamado).toFixed(2)} sin reclamar`,
          enlace: `/cobros/${fila.id}`,
          magnitud: Number(fila.monto_reclamado),
        })),
        enlaceVerTodo: '/cobros?estado=bloqueado_por_evidencia',
      });
    }

    const sinExpediente = await repositorio.ordenesCobrablesSinExpediente();
    if (sinExpediente.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.ORDEN_COBRABLE_SIN_EXPEDIENTE,
        gravedad: GRAVEDAD_AVISO.ATENCION,
        titulo: 'Ordenes entregadas sin expediente',
        porQue: 'El taller ya gasto en estas reparaciones y todavia no las ha reclamado. ' +
          'Cuanto mas viejas, mas cuesta conseguir lo que el fabricante pida.',
        total: sinExpediente.total,
        muestra: sinExpediente.muestra.map((fila): RenglonDeAviso => ({
          id: fila.id,
          titulo: `Orden ${fila.numero} · ${fila.cliente}`,
          detalle: `Garantia ${fila.tipo_garantia} · entregada hace ${Math.round(fila.dias)} dias`,
          enlace: `/ordenes/${fila.id}`,
          magnitud: redondear(fila.dias),
        })),
        enlaceVerTodo: '/cobros?pendientes=1',
      });
    }
  }

  if (puede(actor, 'cobros.expediente.enviar')) {
    const sinRespuesta = await repositorio.expedientesSinRespuesta(DIAS_SIN_RESPUESTA);
    if (sinRespuesta.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.EXPEDIENTE_SIN_RESPUESTA,
        gravedad: GRAVEDAD_AVISO.ATENCION,
        titulo: `Expedientes enviados hace mas de ${DIAS_SIN_RESPUESTA} dias`,
        porQue: 'El tercero no ha contestado. Conviene insistir antes de que se enfrie.',
        total: sinRespuesta.total,
        muestra: sinRespuesta.muestra.map((fila): RenglonDeAviso => ({
          id: fila.id,
          titulo: `Orden ${fila.numero_orden} · ${fila.marca ?? 'Poliza'}`,
          detalle: `C$ ${Number(fila.monto_reclamado).toFixed(2)} · ` +
            `${Math.round(fila.dias ?? 0)} dias sin respuesta`,
          enlace: `/cobros/${fila.id}`,
          magnitud: redondear(fila.dias),
        })),
        enlaceVerTodo: '/cobros?estado=enviado',
      });
    }
  }

  // ── inventario ──
  if (puede(actor, 'inventario.consultar')) {
    const bajoMinimo = await repositorio.repuestosBajoMinimo();
    if (bajoMinimo.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.REPUESTO_BAJO_MINIMO,
        gravedad: GRAVEDAD_AVISO.INFORMATIVO,
        titulo: 'Repuestos en el punto de reorden',
        porQue: 'En las bodegas que surten. Las moviles se reponen con el despacho diario.',
        total: bajoMinimo.total,
        muestra: bajoMinimo.muestra.map((fila): RenglonDeAviso => ({
          // La clave lleva la bodega: un mismo repuesto puede estar bajo
          // minimo en mas de una, y son avisos distintos que se reponen
          // por separado.
          id: `${fila.id}:${fila.bodega}`,
          titulo: `${fila.codigo} · ${fila.descripcion}`,
          // Y el texto tambien dice cual: «quedan 6» sin decir donde no le
          // sirve a quien tiene que ir a reponerlos.
          detalle: `Quedan ${fila.cantidad} en ${fila.bodega}; el minimo es ${fila.stock_minimo}`,
          enlace: `/inventario?repuesto=${fila.id}`,
          magnitud: fila.cantidad - fila.stock_minimo,
        })),
        enlaceVerTodo: '/inventario?bajoMinimo=1',
      });
    }
  }

  if (puede(actor, 'inventario.solicitud.gestionar')) {
    const solicitudes = await repositorio.solicitudesPendientes();
    if (solicitudes.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.SOLICITUD_REPUESTO_PENDIENTE,
        gravedad: GRAVEDAD_AVISO.ATENCION,
        titulo: 'Repuestos pedidos que no han entrado',
        porQue: 'Cada uno tiene una orden detenida esperandolo.',
        total: solicitudes.total,
        muestra: solicitudes.muestra.map((fila): RenglonDeAviso => ({
          id: fila.id,
          titulo: `Orden ${fila.numero_orden} · ${fila.codigo}`,
          detalle: `${fila.cantidad} x ${fila.descripcion} · pedido hace ${Math.round(fila.dias)} dias`,
          enlace: `/inventario/solicitudes`,
          magnitud: redondear(fila.dias),
        })),
        enlaceVerTodo: '/inventario/solicitudes',
      });
    }
  }

  /*
   * Repuestos AGOTADOS. Aparte de «bajo minimo» y con otra gravedad.
   *
   * Bajo minimo es informativo: reponga pronto. Agotado es critico: la
   * proxima orden que necesite esa pieza se detiene. Mezclarlos hacia que lo
   * urgente se perdiera entre lo que solo hay que ir pidiendo.
   */
  if (puede(actor, 'inventario.consultar')) {
    const agotados = await repositorio.repuestosAgotados();
    if (agotados.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.REPUESTO_AGOTADO,
        gravedad: GRAVEDAD_AVISO.CRITICO,
        titulo: 'Repuestos agotados en bodega',
        porQue: 'No hay ninguno. La proxima orden que lo necesite se detiene.',
        total: agotados.total,
        muestra: agotados.muestra.map((fila): RenglonDeAviso => ({
          id: `${fila.id}:${fila.bodega}`,
          titulo: `${fila.codigo} · ${fila.descripcion}`,
          detalle: `Cero en ${fila.bodega}; el minimo es ${fila.stock_minimo}`,
          enlace: `/inventario/kardex/${fila.id}`,
          magnitud: fila.stock_minimo,
        })),
        enlaceVerTodo: '/inventario?bajoMinimo=1',
      });
    }
  }

  /*
   * Cotizaciones que el cliente no ha contestado.
   *
   * Es el unico aviso del sistema sobre algo que NO depende del taller, y por
   * eso hace falta: nadie la persigue porque, formalmente, no hay nada que
   * hacer de este lado. Mientras tanto la orden no avanza y el articulo ocupa
   * espacio en el taller.
   */
  if (puede(actor, 'taller.cotizacion.autorizar')) {
    const cotizaciones = await repositorio.cotizacionesPendientes();
    if (cotizaciones.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.COTIZACION_PENDIENTE,
        gravedad: GRAVEDAD_AVISO.ATENCION,
        titulo: 'Cotizaciones sin respuesta del cliente',
        porQue: 'La orden no avanza hasta que el cliente autorice. Hay que llamarlo.',
        total: cotizaciones.total,
        muestra: cotizaciones.muestra.map((fila): RenglonDeAviso => ({
          id: fila.id,
          titulo: `${fila.codigo ?? `Orden ${fila.numero_orden}`} · ${fila.cliente}`,
          detalle: `C$ ${Number(fila.total).toLocaleString('es-NI')} · cotizada hace `
            + `${Math.round(fila.dias)} dias`,
          enlace: `/ordenes/${fila.id}`,
          magnitud: redondear(fila.dias),
        })),
        enlaceVerTodo: '/ordenes?estado=esperando_autorizacion',
      });
    }
  }

  /** Pedidos al proveedor que no han llegado completos. */
  if (puede(actor, 'compras.consultar')) {
    const compras = await repositorio.comprasPendientes();
    if (compras.total > 0) {
      grupos.push({
        tipo: TIPO_AVISO.COMPRA_PENDIENTE,
        gravedad: GRAVEDAD_AVISO.INFORMATIVO,
        titulo: 'Compras que no han llegado completas',
        porQue: 'Pedidas al proveedor y pendientes de recibir. Varias sostienen ordenes detenidas.',
        total: compras.total,
        muestra: compras.muestra.map((fila): RenglonDeAviso => ({
          id: fila.id,
          titulo: `Compra ${fila.numero} · ${fila.proveedor}`,
          detalle: `${fila.estado.replace(/_/g, ' ')} · pedida hace ${Math.round(fila.dias)} dias`,
          enlace: `/compras/${fila.id}`,
          magnitud: redondear(fila.dias),
        })),
        enlaceVerTodo: '/compras',
      });
    }
  }

  // Lo critico primero; dentro de cada gravedad, lo mas numeroso.
  const orden = {
    [GRAVEDAD_AVISO.CRITICO]: 0,
    [GRAVEDAD_AVISO.ATENCION]: 1,
    [GRAVEDAD_AVISO.INFORMATIVO]: 2,
  };
  grupos.sort((uno, otro) =>
    orden[uno.gravedad] - orden[otro.gravedad] || otro.total - uno.total);

  return {
    calculadaEn: new Date().toISOString(),
    total: grupos.reduce((suma, grupo) => suma + grupo.total, 0),
    criticos: grupos
      .filter((grupo) => grupo.gravedad === GRAVEDAD_AVISO.CRITICO)
      .reduce((suma, grupo) => suma + grupo.total, 0),
    grupos,
  };
}
