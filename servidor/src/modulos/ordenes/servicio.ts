/**
 * Reglas de la orden de servicio.
 *
 * Este servicio no decide si una transicion vale: eso lo dice la maquina de
 * estados, que es codigo puro y vive en dominio/ordenes. Aqui se arma el
 * contexto, se consulta, y si el veredicto es que no, se propaga el error
 * de dominio con el mensaje que la maquina escribio.
 */
import type {
  FichaOrden, Paginacion, PeticionAsignarTecnico, PeticionCrearOrden, ResumenOrden,
} from '@servitotal/compartido';
import { ESTADO_ORDEN, MODALIDAD_SERVICIO } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { enTransaccion } from '../../comun/transacciones.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorConflicto, ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { definicionDe, destinosPosibles } from '../../dominio/ordenes/indice.js';
import { horasParaVencer, sumarHorasLaborables, type CalendarioLaboral } from '../../dominio/plazos/indice.js';
import * as servicioAgenda from '../agenda/servicio.js';
import * as servicioGarantias from '../garantias/servicio.js';
import * as repositorio from './repositorio.js';
import { aEvento, aNota, aResumenOrden, type FilaOrden } from './dto.js';

function conPlazo(fila: FilaOrden, ahora: Date, calendario: CalendarioLaboral): ResumenOrden {
  const restantes = fila.plazo_vence_en === null
    ? null
    : horasParaVencer(ahora, fila.plazo_vence_en, calendario);
  return aResumenOrden(fila, restantes);
}

export async function listar(
  actor: Actor, filtro: repositorio.FiltroOrdenes, pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenOrden[]; paginacion: Paginacion }> {
  const [total, filas, calendario] = await Promise.all([
    repositorio.contar(filtro),
    repositorio.listar(filtro, pagina.tamano, pagina.desplazamiento),
    servicioAgenda.obtenerCalendarioLaboral(actor.idCentro),
  ]);

  // Las horas laborables restantes se calculan en memoria sobre la pagina
  // ya traida: una consulta, no una por orden.
  const ahora = new Date();
  return {
    datos: filas.map((fila) => conPlazo(fila, ahora, calendario)),
    paginacion: construirPaginacion(pagina, total),
  };
}

/**
 * RF-60: ordenes activas vencidas o a punto de vencer.
 *
 * El filtro grueso —plazo ya pasado— lo hace la base con su indice parcial;
 * la alerta previa, que se cuenta en horas laborables, se resuelve aqui
 * sobre las filas ya traidas.
 */
export async function listarAlertas(
  actor: Actor, pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenOrden[]; paginacion: Paginacion }> {
  const filtro: repositorio.FiltroOrdenes = { soloActivas: true, soloVencidas: false };
  const [total, filas, calendario] = await Promise.all([
    repositorio.contar(filtro),
    repositorio.listar(filtro, pagina.tamano, pagina.desplazamiento),
    servicioAgenda.obtenerCalendarioLaboral(actor.idCentro),
  ]);

  const ahora = new Date();
  const enRiesgo = filas
    .map((fila) => conPlazo(fila, ahora, calendario))
    .filter((orden) => orden.vencida || orden.enAlerta);

  return { datos: enRiesgo, paginacion: construirPaginacion(pagina, total) };
}

export async function obtenerFicha(actor: Actor, idOrden: string): Promise<FichaOrden> {
  const fila = await repositorio.buscarPorId(idOrden);
  if (fila === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');

  const [eventos, notas, calendario] = await Promise.all([
    repositorio.listarEventos(idOrden),
    repositorio.listarNotas(idOrden),
    servicioAgenda.obtenerCalendarioLaboral(actor.idCentro),
  ]);

  return {
    ...conPlazo(fila, new Date(), calendario),
    telefonoContacto: fila.telefono_contacto,
    direccionServicio: fila.direccion_servicio,
    referenciaUbicacion: fila.referencia_ubicacion,
    idZona: fila.id_zona,
    zona: fila.zona,
    cargoVisita: Number(fila.cargo_visita),
    idReglaCobertura: fila.id_regla_cobertura,
    levantadaEnCampo: fila.levantada_en_campo,
    motivoAnulacion: fila.motivo_anulacion,
    fechaEntrega: fila.fecha_entrega?.toISOString() ?? null,
    eventos: eventos.map(aEvento),
    notas: notas.map(aNota),
    destinosPosibles: destinosPosibles(fila.estado),
  };
}

/**
 * Crea la orden.
 *
 * El UUID puede venir del dispositivo movil; el numero correlativo lo
 * asigna siempre la secuencia del servidor. Los datos de contacto y
 * ubicacion se COPIAN de la ficha viva del cliente y a partir de aqui
 * quedan congelados: que el cliente se mude no mueve esta orden.
 */
export async function crear(actor: Actor, peticion: PeticionCrearOrden): Promise<FichaOrden> {
  const idOrden = await enTransaccion(async (cliente) => {
    // Reenviar la misma orden desde el movil no la duplica.
    if (peticion.id !== undefined && await repositorio.existeOrden(peticion.id, cliente)) {
      throw new ErrorConflicto(
        'Esa orden ya fue registrada. Si la esta reenviando desde el movil, ya llego bien.',
      );
    }

    const articulo = await repositorio.articuloPerteneceA(peticion.idArticulo, cliente);
    if (articulo === null) {
      throw new ErrorValidacion('El articulo indicado no existe o esta desactivado.',
        { idArticulo: 'Articulo no valido.' });
    }

    const congelables = await repositorio.datosParaCongelar(peticion.idCliente, cliente);
    if (congelables === null) {
      throw new ErrorValidacion('El cliente indicado no existe.', { idCliente: 'Cliente no valido.' });
    }

    const telefono = peticion.telefonoContacto ?? congelables.telefono;
    if (telefono === null) {
      throw new ErrorValidacion(
        'El cliente no tiene telefono registrado y la orden necesita uno de contacto.',
        { telefonoContacto: 'Indique un telefono.' },
      );
    }

    // La cobertura la decide el motor de garantias, con quien pide el
    // servicio: si el articulo esta a nombre de otro, no hay garantia.
    const cobertura = await servicioGarantias.evaluar(
      peticion.idArticulo, peticion.idCliente, undefined, cliente,
    );

    const esRuta = peticion.modalidad === MODALIDAD_SERVICIO.RUTA;
    const idZona = esRuta ? peticion.idZona ?? congelables.id_zona : null;
    const cargoVisita = esRuta ? Number(congelables.cargo_visita ?? 0) : 0;

    const calendario = await servicioAgenda.obtenerCalendarioLaboral(actor.idCentro, cliente);
    const plazo = await repositorio.buscarPlazo(ESTADO_ORDEN.REGISTRADA, cobertura.tipo, cliente);
    const plazoVenceEn = plazo === null
      ? null
      : sumarHorasLaborables(new Date(), plazo.horas_maximas, calendario);

    const creada = await repositorio.insertarOrden(cliente, {
      id: peticion.id ?? null,
      idCentro: actor.idCentro,
      idCliente: peticion.idCliente,
      idArticulo: peticion.idArticulo,
      modalidad: peticion.modalidad,
      tipoGarantia: cobertura.tipo,
      idReglaCobertura: cobertura.idReglaCobertura,
      idResponsableActual: actor.id,
      telefonoContacto: telefono,
      direccionServicio: esRuta ? peticion.direccionServicio ?? congelables.detalle : null,
      referenciaUbicacion: esRuta ? peticion.referenciaUbicacion ?? congelables.referencia : null,
      idZona,
      cargoVisita,
      fallaReportada: peticion.fallaReportada,
      plazoVenceEn,
      levantadaEnCampo: peticion.levantadaEnCampo ?? false,
      creadoPor: actor.id,
    });

    await repositorio.insertarEvento(cliente, {
      idOrden: creada.id,
      estadoAnterior: null,
      estadoNuevo: ESTADO_ORDEN.REGISTRADA,
      idResponsable: actor.id,
      observacion: `Orden registrada. Cobertura: ${cobertura.tipo}. ${cobertura.motivo}`,
    });

    return creada.id;
  });

  return obtenerFicha(actor, idOrden);
}

export async function asignarTecnico(
  actor: Actor, idOrden: string, peticion: PeticionAsignarTecnico,
): Promise<ResumenOrden> {
  await enTransaccion(async (cliente) => {
    const contexto = await repositorio.buscarContextoTransicion(idOrden, cliente);
    if (contexto === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');
    if (definicionDe(contexto.estado).esFinal) {
      throw new ErrorDominio(
        'ORDEN_CERRADA',
        `La orden ${contexto.numero} ya esta ${contexto.estado} y no se edita.`,
      );
    }
    await repositorio.asignarTecnico(cliente, idOrden, peticion.idTecnico, actor.id);
  });

  const fila = await repositorio.buscarPorId(idOrden);
  const calendario = await servicioAgenda.obtenerCalendarioLaboral(actor.idCentro);
  return conPlazo(fila!, new Date(), calendario);
}
