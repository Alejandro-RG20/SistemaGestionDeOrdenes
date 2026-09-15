/**
 * Evidencias: la segunda cola del protocolo.
 *
 * El binario no viaja con la operacion. Primero se registra la evidencia
 * —clave, momento, ubicacion— y despues el archivo sube por partes, con
 * reanudacion. Asi una foto de cuatro megas con mala senal no bloquea el
 * resto de la cola.
 */
import type { EstadoDeCarga, PeticionIniciarCarga } from '@servitotal/compartido';
import { randomUUID } from 'node:crypto';
import type { Actor } from '../../comun/contexto-peticion.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../comun/errores.js';
import * as almacen from '../../infraestructura/almacenamiento-objetos.js';
import * as repositorio from './repositorio.js';

export interface EvidenciaListada {
  readonly id: string;
  readonly clave: string;
  readonly tipo: string;
  readonly rutaArchivo: string | null;
  readonly huellaDigital: string | null;
  readonly autor: string | null;
  readonly momentoDispositivo: string;
  readonly bytes: number | null;
  readonly sincronizada: boolean;
}

export async function listarDeOrden(idOrden: string): Promise<readonly EvidenciaListada[]> {
  if (!(await repositorio.ordenExiste(idOrden))) {
    throw new ErrorNoEncontrado('No existe una orden con ese identificador.');
  }
  const filas = await repositorio.listarDeOrden(idOrden);
  return filas.map((fila) => ({
    id: fila.id,
    clave: fila.clave,
    tipo: fila.tipo,
    rutaArchivo: fila.ruta_archivo,
    huellaDigital: fila.huella_digital,
    autor: fila.autor,
    momentoDispositivo: fila.momento_dispositivo.toISOString(),
    bytes: fila.bytes,
    sincronizada: fila.sincronizada,
  }));
}

/**
 * Abre la carga. La evidencia se registra ya, sin archivo: si el telefono
 * se queda sin bateria a mitad de la subida, el taller igual sabe que esa
 * foto existe y esta pendiente.
 */
export async function iniciarCarga(
  actor: Actor, peticion: PeticionIniciarCarga,
): Promise<EstadoDeCarga> {
  const idCarga = randomUUID();

  const idEvidencia = await enTransaccion(async (cliente) => {
    if (!(await repositorio.ordenExiste(peticion.idOrden, cliente))) {
      throw new ErrorValidacion('La orden indicada no existe.', { idOrden: 'Orden no valida.' });
    }
    return repositorio.insertarEvidencia(cliente, {
      idOrden: peticion.idOrden,
      tipo: peticion.tipo,
      clave: peticion.clave,
      rutaArchivo: null,
      huellaDigital: peticion.huellaDigital,
      idAutor: actor.id,
      momentoDispositivo: new Date(peticion.momentoDispositivo),
      latitud: peticion.latitud ?? null,
      longitud: peticion.longitud ?? null,
      bytes: peticion.bytes,
      sincronizada: false,
    });
  });

  const estado = await almacen.iniciarCarga({
    idCarga,
    idOrden: peticion.idOrden,
    clave: `${peticion.clave}-${idEvidencia}`,
    bytes: peticion.bytes,
    huellaDigital: peticion.huellaDigital,
  });

  return {
    idCarga,
    idOrden: peticion.idOrden,
    clave: peticion.clave,
    bytes: estado.bytes,
    bytesRecibidos: estado.bytesRecibidos,
    completa: estado.completa,
    idEvidencia,
  };
}

/** Lo consulta el dispositivo para saber desde que byte reanudar. */
export async function consultarCarga(idCarga: string): Promise<EstadoDeCarga> {
  const estado = await almacen.estadoDeCarga(idCarga);
  return {
    idCarga, idOrden: estado.idOrden, clave: estado.clave,
    bytes: estado.bytes, bytesRecibidos: estado.bytesRecibidos, completa: estado.completa,
  };
}

export async function agregarParte(
  idCarga: string, desplazamiento: number, parte: Buffer,
): Promise<EstadoDeCarga> {
  const estado = await almacen.agregarParte(idCarga, desplazamiento, parte);
  return {
    idCarga, idOrden: estado.idOrden, clave: estado.clave,
    bytes: estado.bytes, bytesRecibidos: estado.bytesRecibidos, completa: estado.completa,
  };
}

/**
 * Cierra la carga y deja la evidencia marcada como sincronizada. La huella
 * se verifica antes: una evidencia que no casa con la suya no sirve para
 * reclamarle a un fabricante.
 */
export async function cerrarCarga(idEvidencia: string, idCarga: string): Promise<EvidenciaListada> {
  const guardado = await almacen.cerrarCarga(idCarga);

  await enTransaccion(async (cliente) => {
    const evidencia = await repositorio.buscarEvidencia(idEvidencia, cliente);
    if (evidencia === null) throw new ErrorNoEncontrado('No existe una evidencia con ese identificador.');

    await repositorio.marcarEvidenciaSincronizada(cliente, {
      id: idEvidencia,
      rutaArchivo: guardado.ruta,
      huellaDigital: guardado.huellaDigital,
      bytes: guardado.bytes,
    });
  });

  const fila = await repositorio.buscarEvidencia(idEvidencia);
  return {
    id: fila!.id, clave: fila!.clave, tipo: fila!.tipo,
    rutaArchivo: fila!.ruta_archivo, huellaDigital: fila!.huella_digital,
    autor: fila!.autor, momentoDispositivo: fila!.momento_dispositivo.toISOString(),
    bytes: fila!.bytes, sincronizada: fila!.sincronizada,
  };
}
