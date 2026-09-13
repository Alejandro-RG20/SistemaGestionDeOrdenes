/** Controladores de dispositivos moviles. */
import type { Request, Response } from 'express';
import { responderDatos, responderListado } from '../../comun/respuesta.js';
import { leerParametrosPagina } from '../../comun/paginacion.js';
import { usuarioDe } from '../../comun/autenticacion.js';
import type { Actor } from '../../comun/contexto-peticion.js';
import { esquemaIdentificador, esquemaMotivo, esquemaVincularDispositivo, validar } from './esquemas.js';
import * as servicio from './servicio-dispositivo.js';

function actorDe(peticion: Request): Actor {
  const usuario = usuarioDe(peticion);
  return {
    id: usuario.id, nombreUsuario: usuario.nombreUsuario,
    idCentro: usuario.idCentro, rol: usuario.rol,
  };
}

export async function listar(peticion: Request, respuesta: Response): Promise<void> {
  const pagina = leerParametrosPagina(peticion.query as Record<string, unknown>);
  const resultado = await servicio.listar(peticion.query['soloVigentes'] !== 'false', pagina);
  responderListado(respuesta, resultado.datos, resultado.paginacion);
}

export async function vincular(peticion: Request, respuesta: Response): Promise<void> {
  const datos = validar(esquemaVincularDispositivo, peticion.body);
  responderDatos(respuesta, await servicio.vincular(actorDe(peticion), datos), 201);
}

export async function revocar(peticion: Request, respuesta: Response): Promise<void> {
  const id = validar(esquemaIdentificador, peticion.params['id']);
  const { motivo } = validar(esquemaMotivo, peticion.body);
  responderDatos(respuesta, await servicio.revocar(actorDe(peticion), id, motivo));
}
