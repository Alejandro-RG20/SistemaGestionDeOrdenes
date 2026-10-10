/**
 * Reglas de articulos.
 *
 * Aqui vive la regla mas delicada de la etapa: fecha de compra, tienda de
 * origen, marca y dueno son los datos DE LOS QUE DEPENDE LA COBERTURA.
 * Cambiar cualquiera de ellos exige rol de jefatura, motivo escrito y queda
 * en la bitacora. La garantia de las ordenes ya creadas NO cambia: se les
 * deja una nota y, si corresponde, se reclasifican a mano con motivo.
 */
import type {
  FichaArticulo, Paginacion, PeticionActualizarArticulo, PeticionCambiarDatosSensibles,
  PeticionCrearArticulo, PeticionRegistrarCobertura, PeticionTransferirArticulo,
  ResultadoCambioSensible, ResumenArticulo,
} from '@servitotal/compartido';
import { ACCION_BITACORA, TIPO_GARANTIA, ultimoDiaCubierto } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { enTransaccion } from '../../comun/transacciones.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorConflicto, ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { auditar, type AsientoAuditoria } from '../../comun/auditoria.js';
// La comunicacion entre modulos pasa por la capa de servicios, nunca por el
// repositorio ajeno (regla de arquitectura 3). Las notas se escriben sobre
// ordenes, asi que las deja el modulo de ordenes.
import { anotarCambioEnOrdenesAbiertas } from '../ordenes/servicio-ordenes-del-articulo.js';
import * as repositorio from './repositorio.js';
import { aFichaArticulo, aResumenArticulo, type FilaArticulo } from './dto.js';

/** Cuantas ordenes anteriores se devuelven en la ficha del articulo. */
const ORDENES_EN_EL_HISTORIAL = 20;

export async function listar(
  filtro: repositorio.FiltroArticulos, pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenArticulo[]; paginacion: Paginacion }> {
  const [total, filas] = await Promise.all([
    repositorio.contar(filtro),
    repositorio.listar(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenArticulo), paginacion: construirPaginacion(pagina, total) };
}

export async function obtenerFicha(idArticulo: string): Promise<FichaArticulo> {
  const fila = await repositorio.buscarPorId(idArticulo);
  if (fila === null) throw new ErrorNoEncontrado('No existe un articulo con ese identificador.');

  const [coberturas, historial] = await Promise.all([
    repositorio.listarCoberturas(idArticulo),
    repositorio.listarHistorial(idArticulo, ORDENES_EN_EL_HISTORIAL),
  ]);
  return aFichaArticulo(fila, coberturas, historial);
}

/** RF-76: buscar por serie es como el taller reconoce un aparato que ya vino. */
export async function obtenerPorSerie(numeroSerie: string): Promise<FichaArticulo> {
  const fila = await repositorio.buscarPorSerie(numeroSerie.trim().toUpperCase());
  if (fila === null) {
    throw new ErrorNoEncontrado(`No hay ningun articulo registrado con el numero de serie ${numeroSerie}.`);
  }
  return obtenerFicha(fila.id);
}

async function exigirReferenciasValidas(
  ejecutor: Ejecutor,
  referencias: { idCliente?: string; idMarca?: string; idCategoria?: string; idTiendaOrigen?: string },
): Promise<void> {
  const validas = await repositorio.verificarReferencias(ejecutor, referencias);
  const problemas: Record<string, string> = {};
  if (!validas.cliente) problemas['idCliente'] = 'El cliente no existe o esta desactivado.';
  if (!validas.marca) problemas['idMarca'] = 'La marca no existe o esta desactivada.';
  if (!validas.categoria) problemas['idCategoria'] = 'La categoria no existe o esta desactivada.';
  if (!validas.tienda) problemas['idTiendaOrigen'] = 'La tienda de origen no existe o esta desactivada.';

  if (Object.keys(problemas).length > 0) {
    throw new ErrorValidacion(Object.values(problemas)[0]!, problemas);
  }
}

export async function crear(actor: Actor, peticion: PeticionCrearArticulo): Promise<FichaArticulo> {
  const idArticulo = await enTransaccion(async (cliente) => {
    await exigirReferenciasValidas(cliente, {
      idCliente: peticion.idCliente,
      idMarca: peticion.idMarca,
      idCategoria: peticion.idCategoria,
      idTiendaOrigen: peticion.idTiendaOrigen,
    });

    const serie = peticion.numeroSerie ?? null;
    if (serie !== null) {
      const existente = await repositorio.buscarPorSerie(serie, cliente);
      if (existente !== null) {
        throw new ErrorConflicto(
          `Ya hay un articulo registrado con el numero de serie ${serie}, a nombre de ${existente.cliente}. ` +
            'Si es el mismo aparato que cambio de dueno, transfieralo en lugar de registrarlo de nuevo.',
        );
      }
    }

    const id = await repositorio.insertar(cliente, {
      idCliente: peticion.idCliente,
      idMarca: peticion.idMarca,
      idCategoria: peticion.idCategoria,
      idTiendaOrigen: peticion.idTiendaOrigen,
      modelo: peticion.modelo ?? null,
      numeroSerie: serie,
      sinSerieLegible: peticion.sinSerieLegible ?? false,
      fechaCompra: peticion.fechaCompra ?? null,
      facturaReferencia: peticion.facturaReferencia ?? null,
      creadoPor: actor.id,
    });

    await auditar(cliente, [{
      tabla: 'articulo', idRegistro: id, accion: ACCION_BITACORA.CREAR,
      valorNuevo: serie ?? '(sin serie legible)', idUsuario: actor.id,
    }]);

    // Garantia adicional comprada junto con el articulo: se guarda como
    // cobertura (tabla existente), con el vencimiento calculado AQUI.
    const adicional = peticion.garantiaAdicional ?? null;
    if (adicional !== null) {
      const idCobertura = await repositorio.insertarCobertura(cliente, {
        idArticulo: id,
        tipo: TIPO_GARANTIA.ADICIONAL,
        vigenteDesde: adicional.fechaContratacion,
        vigenteHasta: ultimoDiaCubierto(adicional.fechaContratacion, adicional.meses),
        documentoRespaldo: adicional.documentoRespaldo ?? null,
        idClienteContratante: peticion.idCliente,
        creadoPor: actor.id,
      });
      await auditar(cliente, [{
        tabla: 'cobertura', idRegistro: idCobertura, accion: ACCION_BITACORA.CREAR,
        campo: 'tipo', valorNuevo: `adicional · ${adicional.meses} meses desde ${adicional.fechaContratacion}`,
        idUsuario: actor.id,
      }]);
    }
    return id;
  });

  return obtenerFicha(idArticulo);
}

/** Cambios que no alteran la cobertura: no exigen jefatura ni dejan notas en las ordenes. */
export async function actualizar(
  actor: Actor, idArticulo: string, peticion: PeticionActualizarArticulo,
): Promise<FichaArticulo> {
  await enTransaccion(async (cliente) => {
    const previo = await exigirArticulo(idArticulo, cliente);

    if (peticion.numeroSerie != null && peticion.numeroSerie !== previo.numero_serie) {
      const existente = await repositorio.buscarPorSerie(peticion.numeroSerie, cliente);
      if (existente !== null && existente.id !== idArticulo) {
        throw new ErrorConflicto(
          `El numero de serie ${peticion.numeroSerie} ya esta registrado en otro articulo.`,
        );
      }
    }

    await repositorio.actualizar(cliente, idArticulo, peticion, actor.id);
    await auditar(cliente, asientosDeCambio(idArticulo, actor.id, null, [
      ['modelo', previo.modelo, peticion.modelo],
      ['numero_serie', previo.numero_serie, peticion.numeroSerie],
      ['factura_referencia', previo.factura_referencia, peticion.facturaReferencia],
    ]));
  });

  return obtenerFicha(idArticulo);
}

/**
 * Cambio de fecha de compra, tienda de origen o marca.
 *
 * Todo ocurre en una transaccion: el cambio del articulo, los asientos de
 * bitacora y las notas en las ordenes abiertas se confirman juntos o no
 * ocurre ninguno. La garantia de esas ordenes no cambia.
 */
export async function cambiarDatosSensibles(
  actor: Actor, idArticulo: string, peticion: PeticionCambiarDatosSensibles,
): Promise<ResultadoCambioSensible> {
  const ordenesAbiertas = await enTransaccion(async (cliente) => {
    const previo = await exigirArticulo(idArticulo, cliente);
    await exigirReferenciasValidas(cliente, {
      ...(peticion.idMarca !== undefined ? { idMarca: peticion.idMarca } : {}),
      ...(peticion.idTiendaOrigen !== undefined ? { idTiendaOrigen: peticion.idTiendaOrigen } : {}),
    });

    await repositorio.actualizarDatosSensibles(cliente, idArticulo, peticion, actor.id);

    const fechaPrevia = previo.fecha_compra?.toISOString().slice(0, 10) ?? null;
    await auditar(cliente, asientosDeCambio(idArticulo, actor.id, peticion.motivo, [
      ['fecha_compra', fechaPrevia, peticion.fechaCompra],
      ['id_tienda_origen', previo.id_tienda_origen, peticion.idTiendaOrigen],
      ['id_marca', previo.id_marca, peticion.idMarca],
    ]));

    return anotarCambioEnOrdenesAbiertas(
      cliente, actor, idArticulo, `Cambio de datos del articulo: ${peticion.motivo}`,
    );
  });

  const fila = await repositorio.buscarPorId(idArticulo);
  return { articulo: aResumenArticulo(fila!), ordenesAbiertas };
}

/**
 * Cambio de dueno.
 *
 * Es tan sensible como los anteriores: ni la garantia del fabricante ni la
 * poliza extendida se trasladan al comprador de segunda mano. Las ordenes
 * abiertas conservan su garantia y reciben una nota para revisarla.
 */
export async function transferir(
  actor: Actor, idArticulo: string, peticion: PeticionTransferirArticulo,
): Promise<ResultadoCambioSensible> {
  const ordenesAbiertas = await enTransaccion(async (cliente) => {
    const previo = await exigirArticulo(idArticulo, cliente);
    if (previo.id_cliente === peticion.idClienteNuevo) {
      throw new ErrorDominio('MISMO_DUENO', 'El articulo ya esta a nombre de ese cliente.');
    }
    await exigirReferenciasValidas(cliente, { idCliente: peticion.idClienteNuevo });

    await repositorio.cambiarDuenio(cliente, idArticulo, peticion.idClienteNuevo, actor.id);
    await auditar(cliente, [{
      tabla: 'articulo', idRegistro: idArticulo, accion: ACCION_BITACORA.MODIFICAR,
      campo: 'id_cliente', valorAnterior: previo.id_cliente, valorNuevo: peticion.idClienteNuevo,
      motivo: peticion.motivo, idUsuario: actor.id,
    }]);

    return anotarCambioEnOrdenesAbiertas(
      cliente, actor, idArticulo, `Cambio de dueno del articulo: ${peticion.motivo}`,
    );
  });

  const fila = await repositorio.buscarPorId(idArticulo);
  return { articulo: aResumenArticulo(fila!), ordenesAbiertas };
}

/** Registrar una garantia en la ficha: las ordenes abiertas reciben una nota, no un cambio. */
export async function registrarCobertura(
  actor: Actor, idArticulo: string, peticion: PeticionRegistrarCobertura,
): Promise<FichaArticulo> {
  await enTransaccion(async (cliente) => {
    const previo = await exigirArticulo(idArticulo, cliente);

    // Con duracion en meses, el ultimo dia lo calcula el servidor (la misma
    // cuenta de meses de todo el sistema); no se acepta del navegador.
    const vigenteHasta = peticion.meses !== undefined
      ? ultimoDiaCubierto(peticion.vigenteDesde, peticion.meses)
      : peticion.vigenteHasta!;
    const id = await repositorio.insertarCobertura(cliente, {
      idArticulo,
      tipo: peticion.tipo,
      vigenteDesde: peticion.vigenteDesde,
      vigenteHasta,
      documentoRespaldo: peticion.documentoRespaldo ?? null,
      // RN-28: la poliza es de quien la contrato. Si no se indica, se toma
      // el dueno registrado, que es a quien se le vendio.
      idClienteContratante: peticion.idClienteContratante ?? previo.id_cliente,
      creadoPor: actor.id,
    });

    await auditar(cliente, [{
      tabla: 'cobertura', idRegistro: id, accion: ACCION_BITACORA.CREAR,
      campo: 'tipo', valorNuevo: peticion.tipo, idUsuario: actor.id,
    }]);

    await anotarCambioEnOrdenesAbiertas(
      cliente, actor, idArticulo, `Se registro una garantia ${peticion.tipo} en la ficha del articulo`,
    );
  });

  return obtenerFicha(idArticulo);
}

async function exigirArticulo(idArticulo: string, ejecutor: Ejecutor): Promise<FilaArticulo> {
  const fila = await repositorio.buscarPorId(idArticulo, ejecutor);
  if (fila === null) throw new ErrorNoEncontrado('No existe un articulo con ese identificador.');
  return fila;
}

/** Un asiento por campo que de verdad cambio. */
function asientosDeCambio(
  idArticulo: string,
  idUsuario: string,
  motivo: string | null,
  campos: readonly (readonly [string, string | null, string | null | undefined])[],
): AsientoAuditoria[] {
  return campos
    .filter(([, anterior, nuevo]) => nuevo !== undefined && (nuevo ?? null) !== anterior)
    .map(([campo, anterior, nuevo]) => ({
      tabla: 'articulo', idRegistro: idArticulo, accion: ACCION_BITACORA.MODIFICAR,
      campo, valorAnterior: anterior, valorNuevo: nuevo ?? null, motivo, idUsuario,
    }));
}

/**
 * Corregir una garantia registrada con fechas equivocadas: se desactiva,
 * con motivo en la bitacora, y se registra la correcta. La fila no se
 * borra ni se edita, y ninguna orden cambia de garantia por esto: las
 * abiertas reciben una nota, como al registrar una.
 */
export async function desactivarCobertura(
  actor: Actor, idArticulo: string, idCobertura: string, motivo: string,
): Promise<FichaArticulo> {
  await enTransaccion(async (cliente) => {
    await exigirArticulo(idArticulo, cliente);
    const cobertura = await repositorio.coberturaActivaDe(cliente, idArticulo, idCobertura);
    if (cobertura === null) {
      throw new ErrorNoEncontrado('Esa cobertura no existe en este articulo o ya estaba desactivada.');
    }
    await repositorio.desactivarCobertura(cliente, idCobertura);
    await auditar(cliente, [{
      tabla: 'cobertura', idRegistro: idCobertura, accion: ACCION_BITACORA.DESACTIVAR,
      campo: 'activa', valorAnterior: `${cobertura.tipo} ${cobertura.vigente_desde.toISOString().slice(0, 10)}`
        + ` a ${cobertura.vigente_hasta.toISOString().slice(0, 10)}`,
      valorNuevo: 'desactivada', motivo, idUsuario: actor.id,
    }]);
    await anotarCambioEnOrdenesAbiertas(cliente, actor, idArticulo, `Se desactivo una garantia de la ficha del articulo: ${motivo}`);
  });
  return obtenerFicha(idArticulo);
}
