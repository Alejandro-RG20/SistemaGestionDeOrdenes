/** Controladores de agenda. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { actorDe } from '../../comun/autenticacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import { esquemaProgramarVisita, esquemaReprogramarVisita, esquemaSalidaDeVisita } from './esquemas.js';
import * as servicio from './servicio.js';

const identificador = (peticion: Request): string => validar(esquemaIdentificador, peticion.params['id']);

function textoDeConsulta(peticion: Request, clave: string): string | undefined {
  const valor = peticion.query[clave];
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

export async function listar(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const idTecnico = textoDeConsulta(peticion, 'idTecnico');
  const resultado = await servicio.listarConCerco(actorDe(peticion), {
    idTecnico: idTecnico === undefined ? undefined : validar(esquemaIdentificador, idTecnico),
    desde: textoDeConsulta(peticion, 'desde'),
    hasta: textoDeConsulta(peticion, 'hasta'),
    soloVigentes: peticion.query['soloVigentes'] !== 'false',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function listarDeOrden(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.listarDeOrden(actorDe(peticion), identificador(peticion)));
}

export async function programar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaProgramarVisita, peticion.body);
  responderDatos(respuesta, await servicio.programarVisita(actorDe(peticion), identificador(peticion), datos), 201);
}

export async function reprogramar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaReprogramarVisita, peticion.body);
  responderDatos(respuesta, await servicio.reprogramarVisita(actorDe(peticion), identificador(peticion), datos));
}

export async function calendario(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.obtenerCalendarioDelCentro(actorDe(peticion).idCentro));
}

export async function resumen(peticion: Request, respuesta: Response): Promise<void> {
  const idTecnico = textoDeConsulta(peticion, 'idTecnico');
  responderDatos(respuesta, await servicio.resumir(actorDe(peticion), {
    idTecnico: idTecnico === undefined ? undefined : validar(esquemaIdentificador, idTecnico),
    desde: textoDeConsulta(peticion, 'desde'),
    hasta: textoDeConsulta(peticion, 'hasta'),
    soloVigentes: true,
  }));
}

export async function registrarLlegada(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.registrarLlegada(actorDe(peticion), identificador(peticion)));
}

export async function registrarSalida(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaSalidaDeVisita, peticion.body);
  responderDatos(respuesta, await servicio.registrarSalida(actorDe(peticion), identificador(peticion), datos));
}
