/**
 * Diagnostico y cotizacion desde el panel.
 *
 * Hasta ahora el diagnostico solo entraba por la cola del movil y la
 * cotizacion no se podia registrar en ninguna parte: la transicion
 * «en diagnostico → cotizada» exigia una cotizacion que nadie podia crear,
 * y la autorizacion del cliente no tenia donde anotarse. Esto usa las
 * tablas que ya existian (diagnostico, cotizacion) y las mismas reglas.
 *
 * DIAGNOSTICO Y GARANTIA. El diagnostico NO cambia la garantia de la
 * orden. Registra la falla encontrada, el componente, las observaciones del
 * tecnico y, si la constata, una posible exclusion (golpe, mal uso...). Las
 * observaciones y la exclusion quedan como nota en el historial; las fotos
 * se cargan como evidencias de la orden. Si la garantia tiene que cambiar,
 * la reclasifica quien tiene permiso, con motivo (servicio-garantia).
 */
import type {
  CodigoPermiso, CotizacionDeOrden, DatosDeTaller, EstadoCotizacion, PeticionDecisionCotizacion,
  PeticionRegistrarCotizacion, PeticionRegistrarDiagnostico,
} from '@servitotal/compartido';
import {
  ACCION_BITACORA, ESTADO_ORDEN, ErrorDeCotizacion, MODALIDAD_SERVICIO, TIPO_GARANTIA,
  calcularCotizacion, hayAjustes, responsableDePago,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { auditar } from '../../comun/auditoria.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorAutorizacion, ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { alcanceDe, exigirCerco } from './alcance.js';
import * as repositorio from './repositorio.js';

/** Donde se diagnostica: el tecnico ya tiene el articulo delante. */
const ESTADOS_DE_DIAGNOSTICO: readonly string[] = [ESTADO_ORDEN.EN_DIAGNOSTICO];
/**
 * Se cotiza al diagnosticar, y se puede registrar una version nueva
 * mientras el cliente no haya autorizado la orden. Despues de «autorizada»
 * la cotizacion ya no se cambia.
 */
const ESTADOS_DE_COTIZACION: readonly string[] = [
  ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.COTIZADA, ESTADO_ORDEN.ESPERANDO_AUTORIZACION,
];
/** La cotizacion de la visita (particular a domicilio con pago previo) se hace antes de despachar. */
const ESTADOS_DE_COTIZACION_DE_VISITA: readonly string[] = [
  ESTADO_ORDEN.REGISTRADA, ESTADO_ORDEN.ASIGNADA, ESTADO_ORDEN.ESPERANDO_AUTORIZACION,
];
/** La decision del cliente se anota mientras se le pregunta. */
const ESTADOS_DE_DECISION: readonly string[] = [ESTADO_ORDEN.COTIZADA, ESTADO_ORDEN.ESPERANDO_AUTORIZACION];

/**
 * Descuentos, exoneraciones y precios distintos del inventario: decision
 * comercial de jefatura. No hay un permiso propio en el catalogo sembrado;
 * se usa el que ya autoriza decidir quien paga (`garantias.reclasificar`).
 * Ver la propuesta de un permiso dedicado en la documentacion.
 */
const PERMISO_AJUSTE: CodigoPermiso = 'garantias.reclasificar';

/** Visita particular a domicilio con cargo, todavia sin diagnostico: se cotiza la visita. */
function esCotizacionDeVisita(orden: repositorio.FilaDatosDeTaller): boolean {
  return orden.modalidad === MODALIDAD_SERVICIO.RUTA
    && orden.tipo_garantia === TIPO_GARANTIA.PARTICULAR
    && Number(orden.cargo_visita) > 0
    && !orden.tiene_diagnostico;
}

async function ordenCercada(
  actor: Actor, idOrden: string, ejecutor: Parameters<typeof repositorio.datosDeTaller>[1], bloquear = false,
) {
  const orden = await repositorio.datosDeTaller(idOrden, ejecutor, bloquear);
  if (orden === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');
  exigirCerco(await alcanceDe(actor, ejecutor), orden);
  return orden;
}

function exigirEstado(estado: string, admitidos: readonly string[], que: string): void {
  if (!admitidos.includes(estado)) {
    throw new ErrorDominio(
      'ESTADO_NO_ADMITE',
      `${que} se registra con la orden en ${admitidos.map((e) => `«${e.replace(/_/g, ' ')}»`).join(' o ')}; `
        + `esta orden esta en «${estado.replace(/_/g, ' ')}».`,
    );
  }
}

/** Estado de cada cotizacion: solo la ultima puede estar pendiente; las anteriores fueron reemplazadas. */
function conEstado(
  filas: readonly repositorio.FilaCotizacion[], tipoGarantia: string,
): CotizacionDeOrden[] {
  return filas.map((fila, indice) => {
    const esUltima = indice === filas.length - 1;
    let estado: EstadoCotizacion;
    if (fila.aceptada === true) estado = 'aceptada';
    else if (fila.aceptada === false) estado = 'rechazada';
    else if (!esUltima) estado = 'reemplazada';
    else if (tipoGarantia !== TIPO_GARANTIA.PARTICULAR) estado = 'no_requiere';
    else estado = 'pendiente';
    return { ...fila, estado };
  });
}

export async function obtener(actor: Actor, idOrden: string): Promise<DatosDeTaller> {
  const orden = await ordenCercada(actor, idOrden, undefined);
  // Una tras otra: si esto corre dentro de una transaccion, el cliente es uno.
  const diagnosticos = await repositorio.diagnosticosDeOrden(idOrden);
  const filas = await repositorio.cotizacionesDeOrden(idOrden);
  const repuestos = await repositorio.repuestosDeOrden(idOrden);
  const relaciones = await repositorio.relacionesDeOrden(idOrden);
  const origen = relaciones.find((r) => r.relacion === 'origen') ?? null;
  const antecedentes = origen === null ? null : {
    idOrden: origen.id,
    codigo: origen.codigo,
    tipoGarantia: origen.tipo_garantia as never,
    diagnosticos: await repositorio.diagnosticosDeOrden(origen.id),
  };

  const cotizaciones = conEstado(filas, orden.tipo_garantia);
  const ultima = cotizaciones[cotizaciones.length - 1];
  const tiene = (permiso: CodigoPermiso): boolean => actor.permisos.includes(permiso);
  const puedeCotizar = (tiene('taller.cotizacion.registrar') || tiene(PERMISO_AJUSTE))
    && orden.tipo_garantia !== TIPO_GARANTIA.POR_VALIDAR
    && (esCotizacionDeVisita(orden)
      ? ESTADOS_DE_COTIZACION_DE_VISITA.includes(orden.estado)
      : orden.tiene_diagnostico && ESTADOS_DE_COTIZACION.includes(orden.estado));

  return {
    tipoGarantia: orden.tipo_garantia,
    responsablePago: responsableDePago(orden.tipo_garantia),
    modalidad: orden.modalidad,
    cargoVisita: Number(orden.cargo_visita),
    diagnosticos,
    repuestos,
    cotizaciones,
    antecedentes,
    puede: {
      diagnosticar: tiene('taller.diagnostico.registrar') && orden.estado === ESTADO_ORDEN.EN_DIAGNOSTICO,
      cotizar: puedeCotizar,
      ajustar: puedeCotizar && tiene(PERMISO_AJUSTE) && orden.tipo_garantia === TIPO_GARANTIA.PARTICULAR,
      decidir: tiene('taller.cotizacion.autorizar')
        && orden.tipo_garantia === TIPO_GARANTIA.PARTICULAR
        && ESTADOS_DE_DECISION.includes(orden.estado)
        && ultima?.estado === 'pendiente',
    },
  };
}

export async function registrarDiagnostico(
  actor: Actor, idOrden: string, peticion: PeticionRegistrarDiagnostico,
): Promise<DatosDeTaller> {
  await enTransaccion(async (cliente) => {
    const orden = await ordenCercada(actor, idOrden, cliente);
    exigirEstado(orden.estado, ESTADOS_DE_DIAGNOSTICO, 'El diagnostico');

    // Lo firma el tecnico de la sesion. Si quien registra no es tecnico
    // (el administrador), se firma con el tecnico asignado.
    const idTecnicoDelActor = await repositorio.buscarTecnicoDeUsuario(actor.id, cliente);
    if (idTecnicoDelActor !== null && orden.id_tecnico !== null && idTecnicoDelActor.id !== orden.id_tecnico) {
      throw new ErrorDominio('NO_ES_RESPONSABLE', 'Esta orden la tiene asignada otro tecnico.');
    }
    const idTecnico = idTecnicoDelActor?.id ?? orden.id_tecnico;
    if (idTecnico === null) {
      throw new ErrorDominio('SIN_TECNICO', 'La orden no tiene tecnico asignado: asignelo antes de diagnosticar.');
    }

    await repositorio.insertarDiagnosticoDelPanel(cliente, {
      idOrden, idTecnico, fallaReal: peticion.fallaReal, componente: peticion.componente ?? null,
    });

    // Observaciones y posible exclusion: una nota en el historial de la
    // orden. La garantia no se toca.
    const observaciones = peticion.observaciones?.trim() ?? '';
    const exclusion = peticion.exclusion?.trim() ?? '';
    if (observaciones !== '' || exclusion !== '') {
      await repositorio.anotarAvisosEnBitacora(cliente, [{
        idOrden,
        estado: orden.estado,
        observacion: 'Diagnostico: '
          + (observaciones === '' ? '' : `observaciones: ${observaciones}. `)
          + (exclusion === ''
            ? ''
            : `Posible exclusion constatada por el tecnico: ${exclusion}. La garantia de la orden `
              + `(${orden.tipo_garantia.replace(/_/g, ' ')}) no cambia por esto; si corresponde, `
              + 'se reclasifica con motivo.'),
      }], actor.id);
    }
  });
  return obtener(actor, idOrden);
}

/**
 * Registra una cotizacion (o una version nueva).
 *
 * Los repuestos y sus precios NO los escribe el usuario: salen de las
 * solicitudes vigentes de la orden y del precio del inventario. Un repuesto
 * sin precio queda pendiente y la cotizacion no se registra: no se inventa
 * un importe. Cambiar un precio, descontar o exonerar es un ajuste: solo en
 * ordenes particulares, con permiso y motivo.
 *
 * Nunca se edita una cotizacion: cada cambio es una fila nueva, y la
 * anterior conserva sus importes y la decision del cliente si la hubo. El
 * detalle completo queda como constancia en la bitacora inmutable.
 */
export async function registrarCotizacion(
  actor: Actor, idOrden: string, peticion: PeticionRegistrarCotizacion,
): Promise<DatosDeTaller> {
  await enTransaccion(async (cliente) => {
    const orden = await ordenCercada(actor, idOrden, cliente, true);
    if (orden.tipo_garantia === TIPO_GARANTIA.POR_VALIDAR) {
      throw new ErrorDominio('GARANTIA_POR_VALIDAR',
        'La garantia de esta orden esta por validar: confirmela antes de cotizar, para saber quien paga.');
    }
    const deVisita = esCotizacionDeVisita(orden);
    if (deVisita) {
      exigirEstado(orden.estado, ESTADOS_DE_COTIZACION_DE_VISITA, 'La cotizacion de la visita');
      if (peticion.manoObra > 0) {
        throw new ErrorValidacion('Antes del diagnostico solo se cotiza la visita: la mano de obra va en la '
          + 'cotizacion de la reparacion.', { manoObra: 'Debe ser 0 antes del diagnostico.' });
      }
    } else {
      exigirEstado(orden.estado, ESTADOS_DE_COTIZACION, 'La cotizacion');
      if (!orden.tiene_diagnostico) {
        throw new ErrorDominio('SIN_DIAGNOSTICO', 'Registre el diagnostico antes de cotizar.');
      }
    }

    // Repuestos: lo pedido y vigente para la orden, al precio del inventario.
    const repuestos = (await repositorio.repuestosDeOrden(idOrden, cliente)).filter((r) => r.cantidad > 0);
    const cambiados = new Map((peticion.preciosRepuestos ?? []).map((p) => [p.idRepuesto, p.precioUnitario]));
    for (const id of cambiados.keys()) {
      if (!repuestos.some((r) => r.idRepuesto === id)) {
        throw new ErrorValidacion('Ese repuesto no esta pedido para esta orden.', { preciosRepuestos: id });
      }
    }
    const motivo = peticion.motivo?.trim() ?? '';
    const lineas = repuestos.map((r) => ({
      idRepuesto: r.idRepuesto, codigo: r.codigo, descripcion: r.descripcion, cantidad: r.cantidad,
      precioInventario: r.precioInventario,
      precioUnitario: cambiados.get(r.idRepuesto) ?? r.precioInventario,
      motivoPrecio: cambiados.has(r.idRepuesto) ? motivo || null : null,
    }));

    const visitaOriginal = peticion.cargoVisita ?? Number(orden.cargo_visita);
    const entrada = {
      tipoGarantia: orden.tipo_garantia,
      manoObra: peticion.manoObra,
      visita: visitaOriginal,
      lineas,
      ...(peticion.ajustes === undefined ? {} : { ajustes: peticion.ajustes }),
    };

    // Un ajuste es descuento, exoneracion, precio distinto del inventario o
    // un cargo de visita distinto del congelado en la orden.
    const ajusta = hayAjustes(entrada) || visitaOriginal !== Number(orden.cargo_visita);
    if (ajusta) {
      if (orden.tipo_garantia !== TIPO_GARANTIA.PARTICULAR) {
        throw new ErrorDominio('AJUSTE_NO_APLICA',
          'Los descuentos, exoneraciones y cambios de precio solo se aplican en ordenes particulares: '
            + 'lo cubierto por una garantia no lo paga el cliente.');
      }
      if (!actor.permisos.includes(PERMISO_AJUSTE)) {
        throw new ErrorAutorizacion('Aplicar descuentos, exoneraciones o cambiar precios cotizados corresponde '
          + 'a la jefatura.');
      }
    }

    let detalle;
    try {
      detalle = calcularCotizacion(entrada);
    } catch (fallo) {
      if (fallo instanceof ErrorDeCotizacion) throw new ErrorValidacion(fallo.message, { [fallo.campo]: fallo.message });
      throw fallo;
    }
    if (detalle.preciosPendientes.length > 0) {
      throw new ErrorDominio('PRECIO_PENDIENTE',
        `Sin precio registrado en inventario: ${detalle.preciosPendientes.join(', ')}. Registre el precio en el `
          + 'catalogo (o, con permiso, cotice el precio con motivo) antes de registrar la cotizacion.');
    }

    const anterior = await repositorio.ultimaCotizacion(cliente, idOrden);
    if ((ajusta || anterior !== null) && motivo.length < 10) {
      throw new ErrorValidacion(
        anterior !== null
          ? 'Escriba el motivo de la nueva version de la cotizacion (al menos 10 caracteres): queda en la bitacora.'
          : 'Escriba el motivo del descuento, la exoneracion o el cambio de precio (al menos 10 caracteres).',
        { motivo: 'Obligatorio.' },
      );
    }

    const id = await repositorio.insertarCotizacion(cliente, {
      idOrden,
      manoObra: detalle.manoObra.final,
      totalRepuestos: detalle.repuestos.final,
      cargoVisita: detalle.visita.final,
      total: detalle.totalFinal,
      registradoPor: actor.id,
    });
    await auditar(cliente, [{
      tabla: 'cotizacion', idRegistro: id, accion: ACCION_BITACORA.CREAR, campo: 'detalle',
      valorAnterior: anterior === null ? null : String(anterior.total),
      valorNuevo: JSON.stringify(detalle),
      motivo: motivo === '' ? null : motivo,
      idUsuario: actor.id,
    }]);
  });
  return obtener(actor, idOrden);
}

/**
 * Aceptacion o rechazo del cliente, sobre la cotizacion VIGENTE (la
 * ultima). Las anteriores conservan su decision. Una orden cubierta por
 * garantia no pide al cliente que acepte pagar lo cubierto.
 */
export async function registrarDecision(
  actor: Actor, idOrden: string, peticion: PeticionDecisionCotizacion,
): Promise<DatosDeTaller> {
  await enTransaccion(async (cliente) => {
    const orden = await ordenCercada(actor, idOrden, cliente, true);
    if (orden.tipo_garantia !== TIPO_GARANTIA.PARTICULAR) {
      throw new ErrorDominio('NO_REQUIERE_AUTORIZACION',
        'Esta orden la cubre una garantia: el cliente no tiene que aceptar el pago de lo cubierto.');
    }
    exigirEstado(orden.estado, ESTADOS_DE_DECISION, 'La decision del cliente');
    const ultima = await repositorio.ultimaCotizacion(cliente, idOrden);
    if (ultima === null || ultima.aceptada !== null) {
      throw new ErrorDominio('SIN_COTIZACION_PENDIENTE',
        'No hay ninguna cotizacion esperando la decision del cliente. Si cambio el precio, registre una nueva version.');
    }
    await repositorio.anotarDecisionDeCotizacion(cliente, {
      idCotizacion: ultima.id, aceptada: peticion.aceptada, forma: peticion.forma,
    });
    // Quien la anoto, por que canal y lo que dijo el cliente quedan en la
    // bitacora: la tabla cotizacion no guarda quien registro la decision.
    await auditar(cliente, [{
      tabla: 'cotizacion', idRegistro: ultima.id, accion: ACCION_BITACORA.MODIFICAR,
      campo: 'aceptada', valorAnterior: null, valorNuevo: String(peticion.aceptada),
      motivo: `${peticion.forma.replace(/_/g, ' ')}${peticion.observacion ? `: ${peticion.observacion}` : ''}`,
      idUsuario: actor.id,
    }]);
  });
  return obtener(actor, idOrden);
}
