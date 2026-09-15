/**
 * Servicio de garantias: arma el contexto, llama al motor y persiste lo que
 * el motor decide. La regla de negocio esta en dominio/garantias, no aqui.
 */
import type {
  EvaluacionCobertura, Paginacion, PeticionNuevaVersionRegla, ResumenReglaCobertura,
} from '@servitotal/compartido';
import { ACCION_BITACORA } from '@servitotal/compartido';
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
  // En secuencia: `ejecutor` puede ser un cliente de transaccion, y esos no
  // admiten consultas en paralelo.
  const filaArticulo = await repositorio.buscarArticuloParaCobertura(idArticulo, ejecutor);
  const filasPoliza = await repositorio.listarPolizas(idArticulo, ejecutor);
  const filasRegla = await repositorio.listarReglasVigentes(ejecutor);

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

/**
 * Evalua la cobertura del mismo articulo para varios solicitantes de una
 * vez.
 *
 * El contexto —articulo, polizas y reglas vigentes— se carga UNA sola vez y
 * se reutiliza; lo unico que cambia entre solicitantes es su identidad. Sin
 * esto, reevaluar las ordenes abiertas de un articulo seria tres consultas
 * por orden.
 */
export async function evaluarParaVariosSolicitantes(
  idArticulo: string,
  idsClienteSolicitante: readonly string[],
  ejecutor: Ejecutor,
): Promise<Map<string, EvaluacionCobertura>> {
  const base = await armarContexto(idArticulo, undefined, undefined, ejecutor);
  const resultados = new Map<string, EvaluacionCobertura>();

  for (const idCliente of new Set(idsClienteSolicitante)) {
    const contexto: ContextoCobertura = { ...base, idClienteSolicitante: idCliente };
    resultados.set(idCliente, aEvaluacion(evaluarCobertura(contexto)));
  }
  return resultados;
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
