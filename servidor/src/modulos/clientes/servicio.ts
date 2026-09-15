/**
 * Reglas de clientes.
 *
 * Los datos del cliente son VIVOS: corregir un telefono o una direccion los
 * corrige en la ficha y en todo lo que consulte la ficha. Lo que la orden
 * copio al crearse queda congelado en la orden y esta capa no lo toca
 * jamas: cambiar la direccion de un cliente no puede mover una visita ya
 * programada.
 */
import type {
  FichaCliente, Paginacion, PeticionActualizarCliente, PeticionAgregarDireccion,
  PeticionAgregarTelefono, PeticionCrearCliente, PeticionFusionarClientes,
  ResultadoFusion, ResumenCliente,
} from '@servitotal/compartido';
import { ACCION_BITACORA } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import { ErrorConflicto, ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { auditar, type AsientoAuditoria } from '../../comun/auditoria.js';
import { enTransaccion } from '../../comun/transacciones.js';
import * as repositorio from './repositorio.js';
import { aFichaCliente, aResumenCliente } from './dto.js';

export async function listar(
  filtro: repositorio.FiltroClientes,
  pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenCliente[]; paginacion: Paginacion }> {
  const [total, filas] = await Promise.all([
    repositorio.contar(filtro),
    repositorio.listar(filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumenCliente), paginacion: construirPaginacion(pagina, total) };
}

export async function obtenerFicha(idCliente: string): Promise<FichaCliente> {
  const fila = await repositorio.buscarPorId(idCliente);
  if (fila === null) throw new ErrorNoEncontrado('No existe un cliente con ese identificador.');

  const [telefonos, direcciones, relacionados] = await Promise.all([
    repositorio.listarTelefonos(idCliente),
    repositorio.listarDirecciones(idCliente),
    repositorio.contarRelacionados(idCliente),
  ]);
  return aFichaCliente(fila, telefonos, direcciones, relacionados.articulos, relacionados.ordenes);
}

export async function crear(actor: Actor, peticion: PeticionCrearCliente): Promise<FichaCliente> {
  const idCliente = await enTransaccion(async (cliente) => {
    if (peticion.direccion?.idZona != null && !(await repositorio.existeZona(peticion.direccion.idZona, cliente))) {
      throw new ErrorValidacion('La zona indicada no existe o esta desactivada.', { idZona: 'Zona no valida.' });
    }

    const id = await repositorio.insertar(cliente, {
      idCentro: actor.idCentro,
      nombres: peticion.nombres,
      apellidos: peticion.apellidos ?? null,
      identificacion: peticion.identificacion ?? null,
      correo: peticion.correo ?? null,
      creadoPor: actor.id,
    });

    await repositorio.insertarTelefono(cliente, id, peticion.telefono, 'celular', true);

    if (peticion.direccion != null) {
      await repositorio.insertarDireccion(cliente, {
        idCliente: id,
        idZona: peticion.direccion.idZona ?? null,
        detalle: peticion.direccion.detalle,
        referencia: peticion.direccion.referencia ?? null,
        principal: true,
      });
    }

    await auditar(cliente, [{
      tabla: 'cliente', idRegistro: id, accion: ACCION_BITACORA.CREAR,
      valorNuevo: `${peticion.nombres} ${peticion.apellidos ?? ''}`.trim(), idUsuario: actor.id,
    }]);
    return id;
  });

  return obtenerFicha(idCliente);
}

export async function actualizar(
  actor: Actor, idCliente: string, peticion: PeticionActualizarCliente,
): Promise<FichaCliente> {
  await enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idCliente, cliente);
    if (previo === null) throw new ErrorNoEncontrado('No existe un cliente con ese identificador.');

    await repositorio.actualizar(cliente, idCliente, peticion, actor.id);

    const asientos: AsientoAuditoria[] = [];
    const anotar = (campo: string, anterior: string | null, nuevo: string | null): void => {
      if (anterior === nuevo) return;
      asientos.push({
        tabla: 'cliente', idRegistro: idCliente, accion: ACCION_BITACORA.MODIFICAR,
        campo, valorAnterior: anterior, valorNuevo: nuevo, idUsuario: actor.id,
      });
    };
    if (peticion.nombres !== undefined) anotar('nombres', previo.nombres, peticion.nombres);
    if (peticion.apellidos !== undefined) anotar('apellidos', previo.apellidos, peticion.apellidos ?? null);
    if (peticion.identificacion !== undefined) anotar('identificacion', previo.identificacion, peticion.identificacion ?? null);
    if (peticion.correo !== undefined) anotar('correo', previo.correo, peticion.correo ?? null);
    await auditar(cliente, asientos);
  });

  return obtenerFicha(idCliente);
}

/** El numero anterior se conserva como historico, no se sobrescribe (RN-22). */
export async function agregarTelefono(
  actor: Actor, idCliente: string, peticion: PeticionAgregarTelefono,
): Promise<FichaCliente> {
  await enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idCliente, cliente);
    if (previo === null) throw new ErrorNoEncontrado('No existe un cliente con ese identificador.');

    const telefonos = await repositorio.listarTelefonos(idCliente, cliente);
    if (telefonos.some((telefono) => telefono.numero === peticion.numero && telefono.vigente)) {
      throw new ErrorConflicto(`El cliente ya tiene registrado el telefono ${peticion.numero}.`);
    }

    if (peticion.reemplazaAlVigente) await repositorio.cerrarTelefonoVigente(cliente, idCliente);

    await repositorio.insertarTelefono(cliente, idCliente, peticion.numero, peticion.tipo ?? null, true);
    await auditar(cliente, [{
      tabla: 'cliente_telefono', idRegistro: idCliente, accion: ACCION_BITACORA.CREAR,
      campo: 'numero', valorAnterior: previo.telefono_vigente, valorNuevo: peticion.numero,
      idUsuario: actor.id,
    }]);
  });

  return obtenerFicha(idCliente);
}

export async function agregarDireccion(
  actor: Actor, idCliente: string, peticion: PeticionAgregarDireccion,
): Promise<FichaCliente> {
  await enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idCliente, cliente);
    if (previo === null) throw new ErrorNoEncontrado('No existe un cliente con ese identificador.');
    if (peticion.idZona != null && !(await repositorio.existeZona(peticion.idZona, cliente))) {
      throw new ErrorValidacion('La zona indicada no existe o esta desactivada.', { idZona: 'Zona no valida.' });
    }

    if (peticion.esPrincipal) await repositorio.quitarPrincipalDeDirecciones(cliente, idCliente);

    await repositorio.insertarDireccion(cliente, {
      idCliente,
      idZona: peticion.idZona ?? null,
      detalle: peticion.detalle,
      referencia: peticion.referencia ?? null,
      principal: peticion.esPrincipal,
    });
    await auditar(cliente, [{
      tabla: 'cliente_direccion', idRegistro: idCliente, accion: ACCION_BITACORA.CREAR,
      campo: 'detalle', valorAnterior: previo.direccion_principal, valorNuevo: peticion.detalle,
      idUsuario: actor.id,
    }]);
  });

  return obtenerFicha(idCliente);
}

/** RF-75: dos fichas de la misma persona se unifican en una. */
export async function fusionar(
  actor: Actor, idPrincipal: string, peticion: PeticionFusionarClientes,
): Promise<ResultadoFusion> {
  return enTransaccion(async (cliente) => {
    if (idPrincipal === peticion.idClienteAbsorbido) {
      throw new ErrorDominio('FUSION_CONSIGO_MISMO', 'No se puede fusionar un cliente consigo mismo.');
    }

    // En secuencia: comparten el cliente de la transaccion.
    const principal = await repositorio.buscarPorId(idPrincipal, cliente);
    const absorbido = await repositorio.buscarPorId(peticion.idClienteAbsorbido, cliente);
    if (principal === null) throw new ErrorNoEncontrado('No existe el cliente que quedaria como principal.');
    if (absorbido === null) throw new ErrorNoEncontrado('No existe el cliente que se quiere fusionar.');
    if (absorbido.id_cliente_principal !== null) {
      throw new ErrorDominio('YA_FUSIONADO', 'Ese cliente ya fue fusionado con otro anteriormente.');
    }
    if (principal.id_cliente_principal !== null) {
      throw new ErrorDominio(
        'PRINCIPAL_YA_FUSIONADO',
        'El cliente que quedaria como principal ya fue absorbido por otro. Fusione contra ese.',
      );
    }

    const articulos = await repositorio.trasladarArticulos(cliente, absorbido.id, principal.id, actor.id);
    const ordenes = await repositorio.trasladarOrdenes(cliente, absorbido.id, principal.id, actor.id);
    await repositorio.trasladarCoberturas(cliente, absorbido.id, principal.id);
    await repositorio.marcarComoAbsorbido(cliente, absorbido.id, principal.id, actor.id);

    await auditar(cliente, [{
      tabla: 'cliente', idRegistro: absorbido.id, accion: ACCION_BITACORA.FUSIONAR,
      campo: 'id_cliente_principal', valorAnterior: null, valorNuevo: principal.id,
      motivo: peticion.motivo, idUsuario: actor.id,
    }]);

    return {
      idClientePrincipal: principal.id,
      idClienteAbsorbido: absorbido.id,
      articulosTrasladados: articulos,
      ordenesTrasladadas: ordenes,
    };
  });
}
