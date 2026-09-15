/** Controladores de inventario. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { actorDe } from '../../comun/autenticacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import { esquemaConsumosDeOrden, esquemaMovimiento, esquemaSolicitudRepuesto } from './esquemas.js';
import * as servicio from './servicio.js';
import * as catalogo from './servicio-catalogo.js';

const identificador = (peticion: Request): string => validar(esquemaIdentificador, peticion.params['id']);

function textoDeConsulta(peticion: Request, clave: string): string | undefined {
  const valor = peticion.query[clave];
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

function uuidDeConsulta(peticion: Request, clave: string): string | undefined {
  const valor = textoDeConsulta(peticion, clave);
  return valor === undefined ? undefined : validar(esquemaIdentificador, valor);
}

export async function listarBodegas(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await catalogo.listarBodegas(actorDe(peticion)));
}

export async function listarRepuestos(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await catalogo.listarRepuestos({
    texto: textoDeConsulta(peticion, 'texto'),
    soloActivos: peticion.query['soloActivos'] !== 'false',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function listarExistencias(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await catalogo.listarExistencias({
    idBodega: uuidDeConsulta(peticion, 'idBodega'),
    idRepuesto: uuidDeConsulta(peticion, 'idRepuesto'),
    soloBajoMinimo: peticion.query['soloBajoMinimo'] === 'true',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function listarMovimientos(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await catalogo.listarMovimientos({
    idRepuesto: uuidDeConsulta(peticion, 'idRepuesto'),
    idBodega: uuidDeConsulta(peticion, 'idBodega'),
    idOrden: uuidDeConsulta(peticion, 'idOrden'),
    tipo: textoDeConsulta(peticion, 'tipo'),
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function registrarMovimiento(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaMovimiento, peticion.body);
  responderDatos(respuesta, await servicio.registrarMovimiento(actorDe(peticion), datos), 201);
}

export async function listarSolicitudes(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await catalogo.listarSolicitudes({
    idOrden: uuidDeConsulta(peticion, 'idOrden'),
    idRepuesto: uuidDeConsulta(peticion, 'idRepuesto'),
    soloPendientes: peticion.query['soloPendientes'] === 'true',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function solicitarRepuesto(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaSolicitudRepuesto, peticion.body);
  responderDatos(respuesta, await catalogo.solicitarRepuesto(actorDe(peticion), identificador(peticion), datos), 201);
}

export async function registrarConsumos(peticion: Request, respuesta: Response): Promise<void> {
  const { consumos } = validar(esquemaConsumosDeOrden, peticion.body);
  responderDatos(
    respuesta,
    await servicio.registrarConsumosDeOrden(actorDe(peticion), identificador(peticion), consumos),
    201,
  );
}
