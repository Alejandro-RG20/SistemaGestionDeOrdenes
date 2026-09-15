/** Controladores de evidencias. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos } from '../../comun/respuesta.js';
import { actorDe } from '../../comun/autenticacion.js';
import { ErrorValidacion } from '../../comun/errores.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import { esquemaIniciarCarga } from '../sincronizacion/esquemas.js';
import * as servicio from './servicio.js';
import * as servicioJornada from './servicio-jornada.js';

const identificador = (peticion: Request, clave = 'id'): string =>
  validar(esquemaIdentificador, peticion.params[clave]);

/** Todo lo que el dispositivo necesita para trabajar sin senal, de un viaje. */
export async function descargarJornada(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicioJornada.descargar(actorDe(peticion)));
}

export async function listarDeOrden(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.listarDeOrden(identificador(peticion)));
}

export async function iniciarCarga(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaIniciarCarga, peticion.body);
  responderDatos(respuesta, await servicio.iniciarCarga(actorDe(peticion), datos), 201);
}

export async function consultarCarga(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.consultarCarga(identificador(peticion, 'idCarga')));
}

/**
 * Recibe un trozo del archivo. El desplazamiento viaja en la cabecera
 * `X-Desplazamiento`: es el byte desde el que el dispositivo cree que
 * continua, y el servidor lo verifica antes de escribir.
 */
export async function agregarParte(peticion: Request, respuesta: Response): Promise<void> {
  const cabecera = peticion.header('X-Desplazamiento') ?? '0';
  const desplazamiento = Number(cabecera);
  if (!Number.isInteger(desplazamiento) || desplazamiento < 0) {
    throw new ErrorValidacion('La cabecera X-Desplazamiento debe ser un numero entero de bytes.');
  }
  if (!Buffer.isBuffer(peticion.body) || peticion.body.length === 0) {
    throw new ErrorValidacion('No llego ningun dato en el cuerpo de la peticion.');
  }

  responderDatos(respuesta, await servicio.agregarParte(
    identificador(peticion, 'idCarga'), desplazamiento, peticion.body,
  ));
}

export async function cerrarCarga(peticion: Request, respuesta: Response): Promise<void> {
  const idEvidencia = validar(esquemaIdentificador, (peticion.body as { idEvidencia?: unknown }).idEvidencia);
  responderDatos(respuesta, await servicio.cerrarCarga(idEvidencia, identificador(peticion, 'idCarga')));
}
