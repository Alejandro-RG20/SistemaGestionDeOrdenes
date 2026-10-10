/**
 * Diagnostico y cotizacion desde el panel.
 *
 * Hasta ahora el diagnostico solo entraba por la cola del movil y la
 * cotizacion no se podia registrar en ninguna parte: la transicion
 * «en diagnostico → cotizada» exigia una cotizacion que nadie podia crear,
 * y la autorizacion del cliente no tenia donde anotarse. Esto usa las
 * tablas que ya existian (diagnostico, cotizacion) y las mismas reglas.
 *
 * DIAGNOSTICO Y GARANTIA. La garantia con la que entro la orden queda en
 * su historial. Si el diagnostico encuentra una falla excluida —por la
 * regla de cobertura o porque el tecnico registra golpe, mal uso u otra
 * exclusion— la reparacion pasa a cargo del cliente (tipo «particular»),
 * con un evento que dice de que garantia venia y por que. La modalidad
 * (ruta o taller) no cambia: una orden de garantia no se convierte en
 * «servicio particular a domicilio» por esto.
 */
import type {
  DatosDeTaller, PeticionDecisionCotizacion, PeticionRegistrarCotizacion, PeticionRegistrarDiagnostico,
} from '@servitotal/compartido';
import { ACCION_BITACORA, ESTADO_ORDEN, TIPO_GARANTIA } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { auditar } from '../../comun/auditoria.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorDominio, ErrorNoEncontrado } from '../../comun/errores.js';
import * as servicioGarantias from '../garantias/servicio.js';
import { alcanceDe, exigirCerco } from './alcance.js';
import * as repositorio from './repositorio.js';

/** Donde se diagnostica: el tecnico ya tiene el articulo delante. */
const ESTADOS_DE_DIAGNOSTICO: readonly string[] = [ESTADO_ORDEN.EN_DIAGNOSTICO];
/** Se cotiza al diagnosticar o al rehacer una cotizacion antes de que el cliente decida. */
const ESTADOS_DE_COTIZACION: readonly string[] = [ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.COTIZADA];
/** La decision del cliente se anota mientras se le pregunta. */
const ESTADOS_DE_DECISION: readonly string[] = [ESTADO_ORDEN.COTIZADA, ESTADO_ORDEN.ESPERANDO_AUTORIZACION];

async function ordenCercada(actor: Actor, idOrden: string, ejecutor: Parameters<typeof repositorio.datosDeTaller>[1]) {
  const orden = await repositorio.datosDeTaller(idOrden, ejecutor);
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

export async function obtener(actor: Actor, idOrden: string): Promise<DatosDeTaller> {
  const orden = await ordenCercada(actor, idOrden, undefined);
  const [diagnosticos, cotizaciones] = await Promise.all([
    repositorio.diagnosticosDeOrden(idOrden),
    repositorio.cotizacionesDeOrden(idOrden),
  ]);
  return { tipoGarantia: orden.tipo_garantia, diagnosticos, cotizaciones };
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

    // ¿Sigue cubierta? Primero la regla de cobertura con la falla real;
    // despues la exclusion que registre el tecnico (golpe, mal uso...).
    if (orden.tipo_garantia === TIPO_GARANTIA.PARTICULAR) return;

    const evaluacion = await servicioGarantias.evaluar(orden.id_articulo, orden.id_cliente, peticion.fallaReal, cliente);
    const exclusion = peticion.exclusion?.trim() ?? '';
    const pasaAParticular = evaluacion.tipo === TIPO_GARANTIA.PARTICULAR || exclusion !== '';
    if (!pasaAParticular) return;

    const porQue = exclusion !== ''
      ? `Diagnostico: no la cubre la garantia ${orden.tipo_garantia} — ${exclusion}.`
      : evaluacion.motivo;
    const cambio: repositorio.CambioDeGarantia = {
      idOrden,
      estado: orden.estado,
      tipoGarantia: TIPO_GARANTIA.PARTICULAR,
      idReglaCobertura: evaluacion.idReglaCobertura,
      observacion: `Cobertura reevaluada de ${orden.tipo_garantia} a particular tras el diagnostico. ${porQue} `
        + 'La reparacion requiere cotizacion y autorizacion del cliente.',
    };
    await repositorio.aplicarCambiosDeGarantia(cliente, [cambio], actor.id);
    await repositorio.anotarEventosDeReevaluacion(cliente, [cambio], actor.id);
  });
  return obtener(actor, idOrden);
}

export async function registrarCotizacion(
  actor: Actor, idOrden: string, peticion: PeticionRegistrarCotizacion,
): Promise<DatosDeTaller> {
  await enTransaccion(async (cliente) => {
    const orden = await ordenCercada(actor, idOrden, cliente);
    exigirEstado(orden.estado, ESTADOS_DE_COTIZACION, 'La cotizacion');
    if (!orden.tiene_diagnostico) {
      throw new ErrorDominio('SIN_DIAGNOSTICO', 'Registre el diagnostico antes de cotizar.');
    }
    const pendiente = await repositorio.cotizacionSinDecision(cliente, idOrden);
    if (pendiente !== null) {
      // No se pisa una cotizacion que el cliente tiene en la mano: primero
      // se anota su decision (si la rechazo, se puede cotizar de nuevo).
      throw new ErrorDominio(
        'COTIZACION_PENDIENTE',
        'Hay una cotizacion esperando la decision del cliente. Registre su decision antes de hacer otra.',
      );
    }
    const cargoVisita = peticion.cargoVisita ?? 0;
    await repositorio.insertarCotizacion(cliente, {
      idOrden,
      manoObra: peticion.manoObra,
      totalRepuestos: peticion.totalRepuestos,
      cargoVisita,
      total: peticion.manoObra + peticion.totalRepuestos + cargoVisita,
      registradoPor: actor.id,
    });
  });
  return obtener(actor, idOrden);
}

export async function registrarDecision(
  actor: Actor, idOrden: string, peticion: PeticionDecisionCotizacion,
): Promise<DatosDeTaller> {
  await enTransaccion(async (cliente) => {
    const orden = await ordenCercada(actor, idOrden, cliente);
    exigirEstado(orden.estado, ESTADOS_DE_DECISION, 'La decision del cliente');
    const pendiente = await repositorio.cotizacionSinDecision(cliente, idOrden);
    if (pendiente === null) {
      throw new ErrorDominio('SIN_COTIZACION_PENDIENTE', 'No hay ninguna cotizacion esperando la decision del cliente.');
    }
    await repositorio.anotarDecisionDeCotizacion(cliente, {
      idCotizacion: pendiente, aceptada: peticion.aceptada, forma: peticion.forma,
    });
    // Quien la anoto y lo que dijo el cliente quedan en la bitacora: la
    // tabla cotizacion no guarda quien registro la decision.
    await auditar(cliente, [{
      tabla: 'cotizacion', idRegistro: pendiente, accion: ACCION_BITACORA.MODIFICAR,
      campo: 'aceptada', valorAnterior: null, valorNuevo: String(peticion.aceptada),
      motivo: `${peticion.forma.replace(/_/g, ' ')}${peticion.observacion ? `: ${peticion.observacion}` : ''}`,
      idUsuario: actor.id,
    }]);
  });
  return obtener(actor, idOrden);
}
