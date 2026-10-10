/**
 * Servicio de garantias: arma el contexto y devuelve el estado INFORMATIVO
 * de las garantias de un articulo. No decide quien paga una reparacion: lo
 * elige una persona al registrar la orden y, despues, lo reclasifica con
 * motivo quien tiene permiso (modulo de ordenes).
 *
 * Las reglas de cobertura quedan como referencia: dan la duracion habitual
 * de la garantia del proveedor de una marca y categoria.
 */
import type {
  ConsultaGarantias, Paginacion, PeticionNuevaVersionRegla, ResumenReglaCobertura,
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
  advertenciasDeGarantias, advertenciasDeLaElegida, elegirReglaAplicable, resumirGarantias,
  type ContextoCobertura,
} from '../../dominio/garantias/indice.js';

export { advertenciasDeLaElegida };
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
 * Arma el contexto: articulo, polizas y la regla de referencia mas
 * especifica. Tres consultas, ninguna dentro de un bucle. Que no haya regla
 * no es un error: la vigencia sale entonces solo de lo registrado.
 */
async function armarContexto(
  idArticulo: string,
  idClienteSolicitante: string | undefined,
  ejecutor: Ejecutor,
  momento: Date,
): Promise<ContextoCobertura> {
  // En secuencia: `ejecutor` puede ser un cliente de transaccion, y esos no
  // admiten consultas en paralelo.
  const filaArticulo = await repositorio.buscarArticuloParaCobertura(idArticulo, ejecutor);
  const filasPoliza = await repositorio.listarPolizas(idArticulo, ejecutor);
  const filasRegla = await repositorio.listarReglasVigentes(ejecutor);

  if (filaArticulo === null) throw new ErrorNoEncontrado('No existe un articulo con ese identificador.');

  const articulo = aArticuloDelDominio(filaArticulo);
  const reglas = filasRegla.map(aReglaDelDominio);

  return {
    articulo,
    polizas: filasPoliza.map(aPolizaDelDominio),
    regla: elegirReglaAplicable(reglas, articulo.idMarca, articulo.idCategoria),
    idClienteSolicitante: idClienteSolicitante ?? articulo.idCliente,
    momento,
  };
}

/**
 * Estado de las garantias del articulo para quien pide el servicio, con
 * advertencias. No escribe nada.
 *
 * `momento` es el dia contra el que se mide la vigencia: hoy al registrar
 * una orden, y la FECHA DE RECEPCION para una orden ya registrada. Una
 * garantia vigente cuando se recibio el articulo no se pierde porque el
 * diagnostico o la reclasificacion ocurran despues de su vencimiento.
 *
 * Con `elegida`, la advertencia que afecta a esa garantia va primero.
 */
export async function consultar(
  idArticulo: string,
  idClienteSolicitante: string | undefined,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
  elegida?: string,
  momento: Date = new Date(),
): Promise<ConsultaGarantias> {
  const contexto = await armarContexto(idArticulo, idClienteSolicitante, ejecutor, momento);
  const garantias = resumirGarantias(contexto);
  return {
    garantias,
    advertencias: advertenciasDeGarantias(garantias, elegida),
    idReglaReferencia: contexto.regla?.id ?? null,
  };
}

/**
 * Una orden solo se atiende con garantia del proveedor o adicional si esa
 * garantia esta registrada, vigente y corresponde al articulo y a quien
 * pide el servicio. Particular se puede elegir siempre. Es la misma regla
 * que el panel usa para habilitar las opciones.
 */
export function exigirGarantiaAplicable(consulta: ConsultaGarantias, tipo: string): void {
  if (tipo !== 'proveedor' && tipo !== 'adicional') return;
  const estado = consulta.garantias[tipo];
  if (estado.aplicable) return;
  const nombre = tipo === 'proveedor' ? 'del proveedor' : 'adicional';
  throw new ErrorDominio(
    'GARANTIA_NO_APLICABLE',
    `No se puede atender con la garantia ${nombre}: ${estado.motivo ?? 'no aplica.'} `
      + 'Atienda la orden como servicio particular o registre la garantia en la ficha del articulo.',
  );
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
