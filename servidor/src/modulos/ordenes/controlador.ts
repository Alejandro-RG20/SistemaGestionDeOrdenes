/** Controladores de ordenes. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado, responderSinContenido } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { actorDe } from '../../comun/autenticacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import {
  esquemaAsignarTecnico, esquemaCrearOrden, esquemaNotaCorreccion, esquemaTransicion,
} from './esquemas.js';
import * as servicio from './servicio.js';
import * as transiciones from './servicio-transiciones.js';

const identificador = (peticion: Request): string => validar(esquemaIdentificador, peticion.params['id']);

function textoDeConsulta(peticion: Request, clave: string): string | undefined {
  const valor = peticion.query[clave];
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

export async function listar(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const numero = textoDeConsulta(peticion, 'numero');
  const idTecnico = textoDeConsulta(peticion, 'idTecnico');
  const idCliente = textoDeConsulta(peticion, 'idCliente');

  const resultado = await servicio.listar(actorDe(peticion), {
    estado: textoDeConsulta(peticion, 'estado'),
    idTecnico: idTecnico === undefined ? undefined : validar(esquemaIdentificador, idTecnico),
    idCliente: idCliente === undefined ? undefined : validar(esquemaIdentificador, idCliente),
    numero: numero === undefined ? undefined : Number(numero),
    soloActivas: peticion.query['soloActivas'] === 'true',
    soloVencidas: peticion.query['soloVencidas'] === 'true',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

/** RF-60: el panel de jefaturas. Solo lo vencido o a punto de vencer. */
export async function alertas(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await servicio.listarAlertas(actorDe(peticion), pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function obtener(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.obtenerFicha(actorDe(peticion), identificador(peticion)));
}

export async function crear(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaCrearOrden, peticion.body);
  responderDatos(respuesta, await servicio.crear(actorDe(peticion), datos), 201);
}

export async function asignarTecnico(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaAsignarTecnico, peticion.body);
  responderDatos(respuesta, await servicio.asignarTecnico(actorDe(peticion), identificador(peticion), datos));
}

export async function mover(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaTransicion, peticion.body);
  responderDatos(respuesta, await transiciones.mover(actorDe(peticion), identificador(peticion), datos));
}

export async function agregarNota(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaNotaCorreccion, peticion.body);
  await transiciones.agregarNotaCorreccion(actorDe(peticion), identificador(peticion), datos);
  responderSinContenido(respuesta);
}
