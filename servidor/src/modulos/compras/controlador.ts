/** Controladores de compras y proveedores. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { actorDe } from '../../comun/autenticacion.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import {
  esquemaCrearCompra, esquemaFiltroCompras, esquemaMoverCompra,
  esquemaProveedor, esquemaRecibirCompra,
} from './esquemas.js';
import * as servicio from './servicio.js';

const identificador = (peticion: Request): string =>
  validar(esquemaIdentificador, peticion.params['id']);

export async function listarProveedores(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(
    respuesta, await servicio.listarProveedores(peticion.query['soloActivos'] === 'true'),
  );
}

export async function crearProveedor(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaProveedor, peticion.body);
  responderDatos(respuesta, await servicio.crearProveedor(actorDe(peticion), datos), 201);
}

export async function editarProveedor(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaProveedor, peticion.body);
  responderDatos(
    respuesta, await servicio.editarProveedor(actorDe(peticion), identificador(peticion), datos),
  );
}

export async function desactivarProveedor(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(
    respuesta,
    await servicio.cambiarActivoProveedor(actorDe(peticion), identificador(peticion), false),
  );
}

export async function activarProveedor(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(
    respuesta,
    await servicio.cambiarActivoProveedor(actorDe(peticion), identificador(peticion), true),
  );
}

export async function listar(peticion: Request, respuesta: Response): Promise<void> {
  const filtro = validar(esquemaFiltroCompras, peticion.query);
  const pagina = await servicio.listar(filtro, leerParametrosPagina(peticion.query));
  responderListado(respuesta, pagina.datos, pagina.paginacion);
}

export async function obtener(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.obtener(identificador(peticion)));
}

export async function crear(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaCrearCompra, peticion.body);
  responderDatos(respuesta, await servicio.crear(actorDe(peticion), datos), 201);
}

export async function mover(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaMoverCompra, peticion.body);
  responderDatos(
    respuesta, await servicio.mover(actorDe(peticion), identificador(peticion), datos),
  );
}

export async function recibir(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaRecibirCompra, peticion.body);
  responderDatos(
    respuesta, await servicio.recibir(actorDe(peticion), identificador(peticion), datos),
  );
}
