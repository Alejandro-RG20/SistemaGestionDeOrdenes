/** Controladores de garantias. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { usuarioDe } from '../../comun/autenticacion.js';
import type { Actor } from '../../comun/contexto-peticion.js';
import { validar } from '../seguridad/esquemas.js';
import { esquemaEvaluar, esquemaNuevaVersionRegla } from './esquemas.js';
import * as servicio from './servicio.js';

function actorDe(peticion: Request): Actor {
  const usuario = usuarioDe(peticion);
  return {
    id: usuario.id, nombreUsuario: usuario.nombreUsuario,
    idCentro: usuario.idCentro, rol: usuario.rol,
  };
}

export async function listarReglas(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await servicio.listarReglas(peticion.query['soloVigentes'] !== 'false', pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function crearVersionDeRegla(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaNuevaVersionRegla, peticion.body);
  responderDatos(respuesta, await servicio.crearVersionDeRegla(actorDe(peticion), datos), 201);
}

export async function evaluar(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaEvaluar, peticion.body);
  const evaluacion = await servicio.evaluar(datos.idArticulo, datos.idClienteSolicitante, datos.fallaReal);
  responderDatos(respuesta, evaluacion);
}
