/** Controladores de inventario. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { actorDe } from '../../comun/autenticacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import {
  esquemaConsumosDeOrden, esquemaMovimiento, esquemaPasoSolicitud,
  esquemaRangoKardex, esquemaSolicitudRepuesto,
} from './esquemas.js';
import * as servicio from './servicio.js';
import * as catalogo from './servicio-catalogo.js';
import * as kardex from './servicio-kardex.js';
import * as solicitudes from './servicio-solicitudes.js';

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

/**
 * El kardex de un repuesto (pliego §28).
 *
 * El saldo viene calculado por la base y la paginacion lo respeta: la pagina
 * dos no vuelve a empezar en cero.
 */
export async function obtenerKardex(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const rango = validar(esquemaRangoKardex, {
    desde: textoDeConsulta(peticion, 'desde'),
    hasta: textoDeConsulta(peticion, 'hasta'),
  });
  const resultado = await kardex.obtenerKardex({
    idRepuesto: identificador(peticion),
    idBodega: uuidDeConsulta(peticion, 'idBodega'),
    ...rango,
  }, pagina);

  const { paginacion, ...libro } = resultado;
  responderDatos(respuesta, libro, 200, paginacion);
}

/** El recorrido de las solicitudes. Un tecnico solo ve las suyas. */
export async function listarRecorrido(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await kardex.listarRecorrido(actorDe(peticion), {
    estado: textoDeConsulta(peticion, 'estado'),
    idOrden: uuidDeConsulta(peticion, 'idOrden'),
    soloAbiertas: peticion.query['soloAbiertas'] === 'true',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

/** Un paso del recorrido: revisar, aprobar, rechazar, preparar, entregar, recibir. */
export async function darPasoDeSolicitud(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaPasoSolicitud, peticion.body);
  const fila = await solicitudes.darPaso(actorDe(peticion), identificador(peticion), datos);
  responderDatos(respuesta, kardex.aSolicitudPublica(fila, actorDe(peticion).permisos));
}

export async function listarDisponibilidad(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await catalogo.listarDisponibilidad({
    texto: textoDeConsulta(peticion, 'texto'),
    idRepuesto: uuidDeConsulta(peticion, 'idRepuesto'),
    soloConMovimiento: peticion.query['soloConMovimiento'] === 'true',
    soloBajoMinimo: peticion.query['soloBajoMinimo'] === 'true',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}
