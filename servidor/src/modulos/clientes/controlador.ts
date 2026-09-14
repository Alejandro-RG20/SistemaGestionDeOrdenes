/** Controladores de clientes. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { actorDe } from '../../comun/autenticacion.js';
import { esquemaIdentificador, validar } from '../seguridad/esquemas.js';
import {
  esquemaActualizarCliente, esquemaAgregarDireccion, esquemaAgregarTelefono,
  esquemaCrearCliente, esquemaFusionar,
} from './esquemas.js';
import * as servicio from './servicio.js';

const identificador = (peticion: Request): string => validar(esquemaIdentificador, peticion.params['id']);

function textoDeConsulta(peticion: Request, clave: string): string | undefined {
  const valor = peticion.query[clave];
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

export async function listar(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await servicio.listar({
    texto: textoDeConsulta(peticion, 'texto'),
    telefono: textoDeConsulta(peticion, 'telefono'),
    soloActivos: peticion.query['soloActivos'] !== 'false',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function obtener(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.obtenerFicha(identificador(peticion)));
}

export async function crear(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaCrearCliente, peticion.body);
  responderDatos(respuesta, await servicio.crear(actorDe(peticion), datos), 201);
}

export async function actualizar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaActualizarCliente, peticion.body);
  responderDatos(respuesta, await servicio.actualizar(actorDe(peticion), identificador(peticion), datos));
}

export async function agregarTelefono(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaAgregarTelefono, peticion.body);
  responderDatos(respuesta, await servicio.agregarTelefono(actorDe(peticion), identificador(peticion), datos), 201);
}

export async function agregarDireccion(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaAgregarDireccion, peticion.body);
  responderDatos(respuesta, await servicio.agregarDireccion(actorDe(peticion), identificador(peticion), datos), 201);
}

export async function fusionar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaFusionar, peticion.body);
  responderDatos(respuesta, await servicio.fusionar(actorDe(peticion), identificador(peticion), datos));
}
