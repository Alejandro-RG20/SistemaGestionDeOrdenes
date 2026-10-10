/** Controladores de tecnicos. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { actorDe } from '../../comun/autenticacion.js';
import {
  esquemaActualizarTecnico, esquemaCrearTecnico, esquemaDesactivarTecnico,
  esquemaIdentificador, esquemaMotivo, validar,
} from './esquemas.js';
import * as servicio from './servicio-tecnico.js';

const identificador = (peticion: Request): string => validar(esquemaIdentificador, peticion.params['id']);
const texto = (valor: unknown): string | undefined =>
  (typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined);

export async function listar(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const estado = texto(peticion.query['estado']);
  const resultado = await servicio.listar(actorDe(peticion), {
    texto: texto(peticion.query['texto']),
    tipo: ['ruta', 'planta'].includes(texto(peticion.query['tipo']) ?? '') ? texto(peticion.query['tipo']) : undefined,
    estado: estado === 'inactivos' || estado === 'todos' ? estado : 'activos',
  }, pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function obtener(peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, await servicio.obtener(identificador(peticion)));
}

export async function crear(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaCrearTecnico, peticion.body);
  responderDatos(respuesta, await servicio.crear(actorDe(peticion), datos), 201);
}

export async function actualizar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaActualizarTecnico, peticion.body);
  responderDatos(respuesta, await servicio.actualizar(actorDe(peticion), identificador(peticion), datos));
}

export async function desactivar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaDesactivarTecnico, peticion.body);
  responderDatos(respuesta, await servicio.desactivar(actorDe(peticion), identificador(peticion), datos));
}

export async function activar(peticion: Request, respuesta: Response): Promise<void> {
  const { motivo } = validar(esquemaMotivo, peticion.body);
  responderDatos(respuesta, await servicio.activar(actorDe(peticion), identificador(peticion), motivo));
}
