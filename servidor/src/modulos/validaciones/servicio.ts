/**
 * Validacion tecnica: el control que separa «el tecnico dice que lo arreglo»
 * de «el centro responde por esta reparacion».
 *
 * DOS REGLAS QUE SE APLICAN AQUI Y NO EN LA PANTALLA
 *
 *  1. NADIE APRUEBA SU PROPIO TRABAJO. La base lo impide con un disparador,
 *     pero aqui se atrapa antes para poder explicarlo: un error de
 *     restriccion de PostgreSQL no le dice nada a quien lo lee.
 *
 *  2. NO SE APRUEBA CON EVIDENCIA OBLIGATORIA FALTANTE. Aprobar una
 *     reparacion a la que le falta la foto de la pieza sustituida es
 *     firmar un expediente que el proveedor va a rechazar; el costo del
 *     repuesto lo termina comiendo el centro. Rechazar o pedir correccion
 *     si se puede: para eso existen esos dos resultados.
 */
import {
  RESULTADO_VALIDACION, momentosExigiblesEn,
  type ExpedienteDeRevision, type Paginacion, type PeticionValidar, type ValidacionTecnica,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorDominio, ErrorNoEncontrado } from '../../comun/errores.js';
import { construirPaginacion, type ParametrosPagina } from '../../comun/paginacion.js';
import { exigirCercoSobreOrden } from '../ordenes/alcance.js';
import * as repositorio from './repositorio.js';

function aValidacion(fila: repositorio.FilaValidacion): ValidacionTecnica {
  return {
    id: fila.id,
    idOrden: fila.id_orden,
    resultado: fila.resultado as ValidacionTecnica['resultado'],
    observacion: fila.observacion,
    revisoDiagnostico: fila.reviso_diagnostico,
    revisoReparacion: fila.reviso_reparacion,
    revisoEvidencias: fila.reviso_evidencias,
    revisoRepuestos: fila.reviso_repuestos,
    validador: fila.validador,
    momento: fila.momento.toISOString(),
  };
}

export async function expediente(actor: Actor, idOrden: string): Promise<ExpedienteDeRevision> {
  // El cerco por datos. Hoy nadie con `taller.validacion.registrar` esta
  // cercado, asi que no cambia nada; esta puesto para que siga siendo
  // cierto si manana lo esta.
  await exigirCercoSobreOrden(actor, idOrden);

  const orden = await repositorio.expedienteDeRevision(idOrden);
  if (orden === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');

  // Una tras otra, sin Promise.all: dentro de una transaccion el ejecutor
  // es UN cliente del pool, y el cliente de pg no admite consultas
  // simultaneas. Son cuatro consultas por indice; el costo es nada al lado
  // de un fallo intermitente que solo aparece cuando alguien llame a esto
  // desde dentro de una transaccion.
  const presentes = await repositorio.evidenciasPresentes(idOrden);
  const faltantes = await repositorio.evidenciasFaltantes(
    idOrden, momentosExigiblesEn(orden.estado),
  );
  const repuestos = await repositorio.repuestosDeOrden(idOrden);
  const validaciones = await repositorio.listarDeOrden(idOrden);

  return {
    idOrden: orden.id,
    codigo: orden.codigo,
    numero: Number(orden.numero),
    estado: orden.estado,
    cliente: orden.cliente,
    articulo: orden.articulo,
    tipoGarantia: orden.tipo_garantia,
    tecnico: orden.tecnico,
    fallaReportada: orden.falla_reportada,
    diagnostico: orden.falla_real === null
      ? null
      : { fallaReal: orden.falla_real, componente: orden.componente },
    evidenciasPresentes: presentes,
    evidenciasFaltantes: faltantes,
    repuestos: repuestos.map((fila) => ({
      descripcion: fila.descripcion,
      cantidad: fila.cantidad,
      precioUnitario: Number(fila.precio_unitario),
    })),
    validaciones: validaciones.map(aValidacion),
    esSuPropioTrabajo: orden.id_usuario_tecnico === actor.id,
  };
}

export async function listarDeOrden(idOrden: string): Promise<readonly ValidacionTecnica[]> {
  return (await repositorio.listarDeOrden(idOrden)).map(aValidacion);
}

export interface OrdenPorRevisar {
  readonly idOrden: string;
  readonly codigo: string;
  readonly numero: number;
  readonly estado: string;
  readonly cliente: string;
  readonly articulo: string;
  readonly tecnico: string | null;
  readonly tipoGarantia: string;
}

export async function pendientes(
  parametros: ParametrosPagina,
): Promise<{ datos: readonly OrdenPorRevisar[]; paginacion: Paginacion }> {
  const { filas, total } = await repositorio.pendientesDeRevision(
    parametros.tamano, parametros.desplazamiento,
  );
  return {
    datos: filas.map((fila) => ({
      idOrden: fila.id,
      codigo: fila.codigo,
      numero: Number(fila.numero),
      estado: fila.estado,
      cliente: fila.cliente,
      articulo: fila.articulo,
      tecnico: fila.tecnico,
      tipoGarantia: fila.tipo_garantia,
    })),
    paginacion: construirPaginacion(parametros, total),
  };
}

export async function registrar(
  actor: Actor, idOrden: string, peticion: PeticionValidar,
): Promise<ValidacionTecnica> {
  // El cerco por datos. Hoy nadie con `taller.validacion.registrar` esta
  // cercado, asi que no cambia nada; esta puesto para que siga siendo
  // cierto si manana lo esta.
  await exigirCercoSobreOrden(actor, idOrden);

  const orden = await repositorio.expedienteDeRevision(idOrden);
  if (orden === null) throw new ErrorNoEncontrado('No existe una orden con ese identificador.');

  if (orden.id_usuario_tecnico === actor.id) {
    throw new ErrorDominio(
      'VALIDACION_PROPIA',
      'No puede validar una orden que usted mismo atendio. Pidale la revision a otra jefatura.',
    );
  }

  if (peticion.resultado === RESULTADO_VALIDACION.APROBADA) {
    // Solo lo que YA se podia haber tomado. La firma del cliente se
    // recoge al entregar, y exigirla aqui dejaria la orden trabada para
    // siempre: sin aprobar no se entrega, y sin entregar no hay firma.
    const faltantes = await repositorio.evidenciasFaltantes(
      idOrden, momentosExigiblesEn(orden.estado),
    );
    if (faltantes.length > 0) {
      throw new ErrorDominio(
        'EVIDENCIA_INCOMPLETA',
        `No se puede aprobar: falta evidencia obligatoria (${faltantes.join(', ')}). `
        + 'Pida la correccion al tecnico; aprobar asi deja el expediente de cobro sin sustento.',
      );
    }
  }

  const id = await enTransaccion((cliente) => repositorio.insertar(cliente, {
    idOrden,
    resultado: peticion.resultado,
    observacion: peticion.observacion,
    revisoDiagnostico: peticion.revisoDiagnostico,
    revisoReparacion: peticion.revisoReparacion,
    revisoEvidencias: peticion.revisoEvidencias,
    revisoRepuestos: peticion.revisoRepuestos,
    idValidador: actor.id,
  }));

  const validaciones = await repositorio.listarDeOrden(idOrden);
  return aValidacion(validaciones.find((fila) => fila.id === id) ?? validaciones[0]!);
}

/**
 * Si la orden quedo aprobada por una jefatura. Lo consultan la entrega y el
 * expediente de cobro.
 */
export async function estaAprobada(idOrden: string): Promise<boolean> {
  const ultima = await repositorio.ultimaDeOrden(idOrden);
  return ultima?.resultado === RESULTADO_VALIDACION.APROBADA;
}
