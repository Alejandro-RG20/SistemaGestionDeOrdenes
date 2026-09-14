/** Controladores de articulos. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { actorDe } from '../../comun/autenticacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import {
  esquemaActualizarArticulo, esquemaCambiarDatosSensibles, esquemaCrearArticulo,
  esquemaRegistrarCobertura, esquemaTransferir,
} from './esquemas.js';
import * as servicio from './servicio.js';

const identificador = (peticion: Request): string => validar(esquemaIdentificador, peticion.params['id']);

function textoDeConsulta(peticion: Request, clave: string): string | undefined {
  const valor = peticion.query[clave];
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

export async function listar(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const idCliente = textoDeConsulta(peticion, 'idCliente');
  const resultado = await servicio.listar({
    idCliente: idCliente === undefined ? undefined : validar(esquemaIdentificador, idCliente),
    numeroSerie: textoDeConsulta(peticion, 'numeroSerie')?.toUpperCase(),
    texto: textoDeConsulta(peticion, 'texto'),
    soloActivos: peticion.query['soloActivos'] !== 'false',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function obtener(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.obtenerFicha(identificador(peticion)));
}

export async function obtenerPorSerie(peticion: Request, respuesta: Response): Promise<void> {
  const serie = peticion.params['serie'];
  responderDatos(respuesta, await servicio.obtenerPorSerie(typeof serie === 'string' ? serie : ''));
}

export async function crear(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaCrearArticulo, peticion.body);
  responderDatos(respuesta, await servicio.crear(actorDe(peticion), datos), 201);
}

export async function actualizar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaActualizarArticulo, peticion.body);
  responderDatos(respuesta, await servicio.actualizar(actorDe(peticion), identificador(peticion), datos));
}

export async function cambiarDatosSensibles(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaCambiarDatosSensibles, peticion.body);
  responderDatos(respuesta, await servicio.cambiarDatosSensibles(actorDe(peticion), identificador(peticion), datos));
}

export async function transferir(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaTransferir, peticion.body);
  responderDatos(respuesta, await servicio.transferir(actorDe(peticion), identificador(peticion), datos));
}

export async function registrarCobertura(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaRegistrarCobertura, peticion.body);
  responderDatos(respuesta, await servicio.registrarCobertura(actorDe(peticion), identificador(peticion), datos), 201);
}
