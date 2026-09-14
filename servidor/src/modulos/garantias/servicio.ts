/**
 * Servicio de garantias: arma el contexto, llama al motor y persiste lo que
 * el motor decide. La regla de negocio esta en dominio/garantias, no aqui.
 */
import type {
  EvaluacionCobertura, Paginacion, PeticionNuevaVersionRegla, ResumenReglaCobertura, TipoGarantia,
} from '@servitotal/compartido';
import { ACCION_BITACORA, TIPO_GARANTIA } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { enTransaccion, ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { auditar } from '../../comun/auditoria.js';
import {
  elegirReglaAplicable, evaluarCobertura, reevaluarTrasDiagnostico,
  type ContextoCobertura, type ResultadoCobertura,
} from '../../dominio/garantias/indice.js';
import * as repositorio from './repositorio.js';
import { aArticuloDelDominio, aPolizaDelDominio, aReglaDelDominio, aResumenRegla } from './dto.js';

export async function listarReglas(
  soloVigentes: boolean, pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenReglaCobertura[]; paginacion: Paginacion }> {
  const [total, filas] = await Promise.all([
    repositorio.contarReglas(soloVigentes),
    repositorio.listarReglas(soloVigentes, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenRegla), paginacion: construirPaginacion(pagina, total) };
}

/**
 * Arma el contexto que el motor necesita: articulo, polizas y la regla
 * vigente mas especifica. Tres consultas, ninguna dentro de un bucle.
 */
async function armarContexto(
  idArticulo: string,
  idClienteSolicitante: string | undefined,
  fallaReal: string | undefined,
  ejecutor: Ejecutor,
): Promise<ContextoCobertura> {
  const [filaArticulo, filasPoliza, filasRegla] = await Promise.all([
    repositorio.buscarArticuloParaCobertura(idArticulo, ejecutor),
    repositorio.listarPolizas(idArticulo, ejecutor),
    repositorio.listarReglasVigentes(ejecutor),
  ]);

  if (filaArticulo === null) throw new ErrorNoEncontrado('No existe un articulo con ese identificador.');

  const articulo = aArticuloDelDominio(filaArticulo);
  const reglas = filasRegla.map(aReglaDelDominio);
  const regla = elegirReglaAplicable(reglas, articulo.idMarca, articulo.idCategoria);

  if (regla === null) {
    throw new ErrorDominio(
      'SIN_REGLA_DE_COBERTURA',
      'No hay ninguna regla de cobertura vigente que aplique a este articulo. ' +
        'Pida a la jefatura que registre la regla general antes de continuar.',
    );
  }

  return {
    articulo,
    polizas: filasPoliza.map(aPolizaDelDominio),
    regla,
    idClienteSolicitante: idClienteSolicitante ?? articulo.idCliente,
    momento: new Date(),
    fallaReal,
  };
}

function aEvaluacion(resultado: ResultadoCobertura): EvaluacionCobertura {
  return {
    tipo: resultado.tipo,
    idReglaCobertura: resultado.idReglaCobertura,
    motivo: resultado.motivo,
    detieneLaOrden: resultado.detieneLaOrden,
    desglose: resultado.desglose.map((parte) => ({ nombre: parte.nombre, seCumplio: parte.seCumplio })),
  };
}

/** Consulta de cobertura. No escribe nada: sirve para mostrarla antes de abrir la orden. */
export async function evaluar(
  idArticulo: string,
  idClienteSolicitante: string | undefined,
  fallaReal: string | undefined,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<EvaluacionCobertura> {
  const contexto = await armarContexto(idArticulo, idClienteSolicitante, fallaReal, ejecutor);

  // Con falla real se responde lo que quedaria TRAS el diagnostico, que es
  // la reevaluacion sobre la cobertura que la orden habria tenido al abrirse.
  const inicial = evaluarCobertura({ ...contexto, fallaReal: undefined });
  const resultado = fallaReal === undefined
    ? inicial
    : reevaluarTrasDiagnostico(contexto, inicial.tipo);
  return aEvaluacion(resultado);
}

export interface OrdenReevaluada {
  readonly id: string;
  readonly numero: number;
  readonly tipoAnterior: TipoGarantia;
  readonly tipoNuevo: TipoGarantia;
  readonly detenida: boolean;
}

/**
 * Recalcula la cobertura de las ordenes ABIERTAS de un articulo.
 *
 * Se invoca cuando cambia un dato del que depende la cobertura: fecha de
 * compra, tienda de origen, marca o dueno. Las ordenes ya entregadas o
 * cerradas no se tocan: lo que se cobro, cobrado esta.
 *
 * Corre en la transaccion que le pasa quien la llama, para que el cambio
 * del articulo y la reevaluacion se confirmen o se reviertan juntos.
 *
 * NOTA DE ETAPA: escribe sobre orden_servicio porque el modulo de ordenes
 * es de la etapa 4. Cuando exista, esta escritura debe pasar por su
 * servicio y esta funcion quedarse solo con el calculo.
 */
export async function reevaluarOrdenesAbiertas(
  ejecutor: Ejecutor,
  actor: Actor,
  idArticulo: string,
  motivo: string,
): Promise<readonly OrdenReevaluada[]> {
  const ordenes = await repositorio.listarOrdenesAbiertasDeArticulo(idArticulo, ejecutor);
  if (ordenes.length === 0) return [];

  // El contexto se arma UNA vez y se reutiliza para todas las ordenes del
  // articulo: lo unico que cambia entre ellas es quien pidio el servicio.
  const base = await armarContexto(idArticulo, undefined, undefined, ejecutor);

  // Primero se calcula todo en memoria; despues se escribe de una vez.
  const reevaluadas: OrdenReevaluada[] = [];
  const cambios: repositorio.CambioDeGarantia[] = [];

  for (const orden of ordenes) {
    const contexto: ContextoCobertura = { ...base, idClienteSolicitante: orden.id_cliente };
    const resultado = evaluarCobertura(contexto);
    const tipoAnterior = orden.tipo_garantia as TipoGarantia;
    if (resultado.tipo === tipoAnterior) continue;

    cambios.push({
      idOrden: orden.id,
      estado: orden.estado,
      tipoGarantia: resultado.tipo,
      idReglaCobertura: resultado.idReglaCobertura,
      observacion:
        `Cobertura reevaluada de ${tipoAnterior} a ${resultado.tipo}. ${motivo}. ${resultado.motivo}`,
    });

    reevaluadas.push({
      id: orden.id,
      numero: orden.numero,
      tipoAnterior,
      tipoNuevo: resultado.tipo,
      // Una orden abierta que pasa a particular se detiene hasta que el
      // cliente acepte la cotizacion.
      detenida: resultado.tipo === TIPO_GARANTIA.PARTICULAR && tipoAnterior !== TIPO_GARANTIA.PARTICULAR,
    });
  }

  await repositorio.aplicarCambiosDeGarantia(ejecutor, cambios, actor.id);
  await repositorio.anotarEventosDeReevaluacion(ejecutor, cambios, actor.id);

  return reevaluadas;
}

/** RF-86: no se edita una regla; se cierra la vigente y se abre la siguiente. */
export async function crearVersionDeRegla(
  actor: Actor, peticion: PeticionNuevaVersionRegla,
): Promise<ResumenReglaCobertura> {
  if (peticion.mesesCobertura < 0 || peticion.mesesCobertura > 240) {
    throw new ErrorValidacion('Los meses de cobertura deben estar entre 0 y 240.',
      { mesesCobertura: 'Valor fuera de rango.' });
  }

  return enTransaccion(async (cliente) => {
    const idMarca = peticion.idMarca ?? null;
    const idCategoria = peticion.idCategoria ?? null;

    const versionAnterior = await repositorio.cerrarVersionesAnteriores(cliente, idMarca, idCategoria);
    const id = await repositorio.insertarRegla(cliente, {
      idMarca, idCategoria,
      mesesCobertura: peticion.mesesCobertura,
      exigeTiendaGrupo: peticion.exigeTiendaGrupo,
      fallasExcluidas: peticion.fallasExcluidas,
      version: versionAnterior + 1,
      creadoPor: actor.id,
    });

    await auditar(cliente, [{
      tabla: 'regla_cobertura', idRegistro: id, accion: ACCION_BITACORA.CREAR,
      campo: 'version', valorAnterior: versionAnterior === 0 ? null : String(versionAnterior),
      valorNuevo: String(versionAnterior + 1), motivo: peticion.motivo, idUsuario: actor.id,
    }]);

    const fila = await repositorio.buscarReglaPorId(id, cliente);
    return aResumenRegla(fila!);
  });
}
