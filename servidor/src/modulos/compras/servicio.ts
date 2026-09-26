/**
 * Compras y proveedores.
 *
 * LA REGLA QUE ORGANIZA TODO ESTE MODULO: una compra NO es mercaderia.
 *
 * Crear un pedido no suma ni una pieza a la existencia. La existencia se
 * mueve cuando bodega abre las cajas y cuenta, y eso pasa por el mismo
 * `registrarMovimiento` que usa cualquier otro ingreso — no por una via
 * paralela—. Si la compra sumara al crearse, el sistema diria que hay
 * compresores disponibles mientras siguen en un camion, y un tecnico
 * saldria a una casa confiando en una pieza que no existe.
 *
 * Tambien por eso quien pide y quien recibe son permisos distintos: el
 * jefe de compras arma el pedido, bodega cuenta lo que llego. Que una sola
 * persona haga las dos cosas es como se pierde inventario sin que nadie lo
 * note.
 */
import {
  ESTADO_COMPRA, TIPO_MOVIMIENTO,
  compraAdmiteRecepcion, compraPuedeMoverseA,
  type CompraDetallada, type EstadoCompra, type Paginacion,
  type PeticionCrearCompra, type PeticionMoverCompra, type PeticionProveedor,
  type PeticionRecibirCompra, type Proveedor, type ResumenCompra,
} from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorDominio, ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import { construirPaginacion, type ParametrosPagina } from '../../comun/paginacion.js';
import * as inventario from '../inventario/servicio.js';
import * as repositorio from './repositorio.js';

// ── proveedores ───────────────────────────────────────────────────────

function aProveedor(fila: repositorio.FilaProveedor): Proveedor {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    contacto: fila.contacto,
    telefono: fila.telefono,
    correo: fila.correo,
    direccion: fila.direccion,
    atiendeGarantias: fila.atiende_garantias,
    activo: fila.activo,
  };
}

export async function listarProveedores(soloActivos: boolean): Promise<readonly Proveedor[]> {
  return (await repositorio.listarProveedores(soloActivos)).map(aProveedor);
}

export async function crearProveedor(
  actor: Actor, peticion: PeticionProveedor,
): Promise<Proveedor> {
  const id = await enTransaccion((cliente) => repositorio.insertarProveedor(cliente, {
    codigo: peticion.codigo,
    nombre: peticion.nombre,
    contacto: peticion.contacto ?? null,
    telefono: peticion.telefono ?? null,
    correo: peticion.correo ?? null,
    direccion: peticion.direccion ?? null,
    atiendeGarantias: peticion.atiendeGarantias,
    idUsuario: actor.id,
  }));
  return aProveedor((await repositorio.buscarProveedor(id))!);
}

export async function editarProveedor(
  actor: Actor, id: string, peticion: PeticionProveedor,
): Promise<Proveedor> {
  if (await repositorio.buscarProveedor(id) === null) {
    throw new ErrorNoEncontrado('No existe un proveedor con ese identificador.');
  }
  await enTransaccion((cliente) => repositorio.actualizarProveedor(cliente, id, {
    nombre: peticion.nombre,
    contacto: peticion.contacto ?? null,
    telefono: peticion.telefono ?? null,
    correo: peticion.correo ?? null,
    direccion: peticion.direccion ?? null,
    atiendeGarantias: peticion.atiendeGarantias,
    idUsuario: actor.id,
  }));
  return aProveedor((await repositorio.buscarProveedor(id))!);
}

/**
 * Un proveedor no se borra: se desactiva. Las compras viejas siguen
 * apuntando a el y el historial tiene que poder decir a quien se le
 * compro, aunque hoy ya no se le compre.
 */
export async function cambiarActivoProveedor(
  actor: Actor, id: string, activo: boolean,
): Promise<Proveedor> {
  if (await repositorio.buscarProveedor(id) === null) {
    throw new ErrorNoEncontrado('No existe un proveedor con ese identificador.');
  }
  await enTransaccion((cliente) =>
    repositorio.cambiarActivoProveedor(cliente, id, activo, actor.id));
  return aProveedor((await repositorio.buscarProveedor(id))!);
}

// ── compras ───────────────────────────────────────────────────────────

function aResumen(fila: repositorio.FilaCompra): ResumenCompra {
  return {
    id: fila.id,
    numero: Number(fila.numero),
    proveedor: fila.proveedor,
    estado: fila.estado as EstadoCompra,
    fechaPedido: fila.fecha_pedido.toISOString(),
    fechaEstimada: fila.fecha_estimada?.toISOString() ?? null,
    total: Number(fila.total),
    lineas: fila.lineas,
    pedido: Number(fila.pedido),
    recibido: Number(fila.recibido),
  };
}

export async function listar(
  filtro: repositorio.FiltroCompras, parametros: ParametrosPagina,
): Promise<{ datos: readonly ResumenCompra[]; paginacion: Paginacion }> {
  const total = await repositorio.contarCompras(filtro);
  const filas = await repositorio.listarCompras(
    filtro, parametros.tamano, parametros.desplazamiento,
  );
  return { datos: filas.map(aResumen), paginacion: construirPaginacion(parametros, total) };
}

export async function obtener(id: string): Promise<CompraDetallada> {
  const fila = await repositorio.buscarCompra(id);
  if (fila === null) throw new ErrorNoEncontrado('No existe una compra con ese identificador.');
  const lineas = await repositorio.lineasDeCompra(id);
  const estado = fila.estado as EstadoCompra;

  return {
    ...aResumen(fila),
    idProveedor: fila.id_proveedor,
    observacion: fila.observacion,
    motivoCancelacion: fila.motivo_cancelacion,
    detalle: lineas.map((linea) => ({
      id: linea.id,
      idRepuesto: linea.id_repuesto,
      codigoRepuesto: linea.codigo,
      descripcion: linea.descripcion,
      cantidad: linea.cantidad,
      cantidadRecibida: linea.cantidad_recibida,
      precioUnitario: Number(linea.precio_unitario),
    })),
    transicionesPosibles: (['borrador', 'enviada', 'confirmada', 'recibida_parcial',
      'recibida', 'cancelada'] as EstadoCompra[])
      .filter((hacia) => compraPuedeMoverseA(estado, hacia)),
    admiteRecepcion: compraAdmiteRecepcion(estado),
  };
}

export async function crear(actor: Actor, peticion: PeticionCrearCompra): Promise<CompraDetallada> {
  if (await repositorio.buscarProveedor(peticion.idProveedor) === null) {
    throw new ErrorValidacion('El proveedor indicado no existe.', {
      idProveedor: 'Proveedor no valido.',
    });
  }

  // Un repuesto repetido rompe la restriccion de unicidad y el mensaje de
  // PostgreSQL no le dice nada a quien arma el pedido.
  const vistos = new Set<string>();
  for (const linea of peticion.lineas) {
    if (vistos.has(linea.idRepuesto)) {
      throw new ErrorValidacion(
        'Un repuesto aparece dos veces en el pedido. Junte las cantidades en una sola linea.',
        { lineas: 'Repuesto repetido.' },
      );
    }
    vistos.add(linea.idRepuesto);
  }

  const total = peticion.lineas.reduce(
    (suma, linea) => suma + linea.cantidad * linea.precioUnitario, 0,
  );

  const id = await enTransaccion(async (cliente) => {
    const idCompra = await repositorio.insertarCompra(cliente, {
      idProveedor: peticion.idProveedor,
      fechaEstimada: peticion.fechaEstimada ?? null,
      observacion: peticion.observacion ?? null,
      total: Number(total.toFixed(2)),
      idUsuario: actor.id,
    });
    for (const linea of peticion.lineas) {
      await repositorio.insertarLinea(cliente, {
        idCompra,
        idRepuesto: linea.idRepuesto,
        cantidad: linea.cantidad,
        precioUnitario: linea.precioUnitario,
      });
    }
    return idCompra;
  });

  return obtener(id);
}

export async function mover(
  actor: Actor, id: string, peticion: PeticionMoverCompra,
): Promise<CompraDetallada> {
  await enTransaccion(async (cliente) => {
    const actual = await repositorio.bloquearCompra(cliente, id);
    if (actual === null) {
      throw new ErrorNoEncontrado('No existe una compra con ese identificador.');
    }

    const desde = actual.estado as EstadoCompra;
    if (!compraPuedeMoverseA(desde, peticion.hacia)) {
      throw new ErrorDominio(
        'TRANSICION_COMPRA_INVALIDA',
        `Una compra en «${desde.replace(/_/g, ' ')}» no puede pasar a `
        + `«${peticion.hacia.replace(/_/g, ' ')}».`,
      );
    }

    if (peticion.hacia === ESTADO_COMPRA.CANCELADA
      && (peticion.motivoCancelacion ?? '').trim().length < 5) {
      throw new ErrorValidacion('Explique por que se cancela la compra.', {
        motivoCancelacion: 'Indique el motivo.',
      });
    }

    await repositorio.cambiarEstadoCompra(
      cliente, id, peticion.hacia,
      peticion.hacia === ESTADO_COMPRA.CANCELADA ? peticion.motivoCancelacion ?? null : null,
      actor.id,
    );
  });

  return obtener(id);
}

/**
 * Bodega cuenta lo que llego.
 *
 * TODO O NADA. Si la tercera linea trae mas de lo pedido, las dos primeras
 * tampoco ingresan: la transaccion se revierte entera. Recibir a medias y
 * dejar la compra en un estado que nadie sabe interpretar es peor que
 * rechazar la operacion completa y que bodega vuelva a contar.
 *
 * El estado final lo decide el sistema comparando lo recibido con lo
 * pedido, no la persona: una compra que alguien marca «recibida» teniendo
 * la mitad en el camion es un agujero de inventario.
 */
export async function recibir(
  actor: Actor, id: string, peticion: PeticionRecibirCompra,
): Promise<CompraDetallada> {
  await enTransaccion(async (cliente) => {
    const actual = await repositorio.bloquearCompra(cliente, id);
    if (actual === null) {
      throw new ErrorNoEncontrado('No existe una compra con ese identificador.');
    }

    const estado = actual.estado as EstadoCompra;
    if (!compraAdmiteRecepcion(estado)) {
      throw new ErrorDominio(
        'COMPRA_NO_ADMITE_RECEPCION',
        `Esta compra esta en «${estado.replace(/_/g, ' ')}» y no admite recepcion. `
        + 'Solo se recibe lo que se envio al proveedor.',
      );
    }

    const lineas = await repositorio.lineasDeCompra(id, cliente);
    const porId = new Map(lineas.map((linea) => [linea.id, linea]));

    for (const entrada of peticion.lineas) {
      if (entrada.cantidad <= 0) continue;
      const linea = porId.get(entrada.idLinea);
      if (linea === undefined) {
        throw new ErrorValidacion('Una de las lineas no pertenece a esta compra.', {
          lineas: 'Linea no valida.',
        });
      }

      const pendiente = linea.cantidad - linea.cantidad_recibida;
      if (entrada.cantidad > pendiente) {
        throw new ErrorDominio(
          'RECEPCION_EXCEDIDA',
          `De «${linea.descripcion}» quedan ${pendiente} por recibir y se estan contando `
          + `${entrada.cantidad}. Si de verdad llegaron de mas, registrelo como ajuste `
          + 'justificado: la compra no se infla.',
        );
      }

      // El ingreso al inventario pasa por la puerta de siempre. Reentra en
      // esta misma transaccion, asi que o entra todo o no entra nada.
      await inventario.registrarMovimiento(actor, {
        idRepuesto: linea.id_repuesto,
        tipo: TIPO_MOVIMIENTO.INGRESO,
        idBodegaDestino: peticion.idBodega,
        cantidad: entrada.cantidad,
        precioUnitario: Number(linea.precio_unitario),
        justificacion: `Recepcion de la compra ${id}`,
      });

      await repositorio.sumarRecibido(cliente, linea.id, entrada.cantidad);
    }

    const actualizadas = await repositorio.lineasDeCompra(id, cliente);
    const completa = actualizadas.every((linea) => linea.cantidad_recibida >= linea.cantidad);
    const algo = actualizadas.some((linea) => linea.cantidad_recibida > 0);

    await repositorio.cambiarEstadoCompra(
      cliente, id,
      completa ? ESTADO_COMPRA.RECIBIDA : algo ? ESTADO_COMPRA.RECIBIDA_PARCIAL : estado,
      null, actor.id,
    );
  });

  return obtener(id);
}
