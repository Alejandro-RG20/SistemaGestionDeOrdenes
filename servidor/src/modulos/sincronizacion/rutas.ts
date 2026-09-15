/**
 * Rutas de sincronizacion.
 *
 * La cola es una sola puerta: el dispositivo manda todo lo que tiene, en
 * orden, y recibe un veredicto por operacion. No hay un endpoint por tipo,
 * porque el orden entre tipos distintos tambien importa.
 */
import { Router } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeSincronizacion(): Router {
  const router = Router();

  router.post('/sincronizacion/cola',
    exigirPermiso('campo.sincronizar'), asincrono(controlador.sincronizar));

  const resolver = exigirPermiso('campo.excepcion.resolver');
  router.get('/sincronizacion/excepciones', resolver, asincrono(controlador.listarExcepciones));
  router.get('/sincronizacion/excepciones/:id', resolver, asincrono(controlador.obtenerExcepcion));
  router.post('/sincronizacion/excepciones/:id/resolver', resolver, asincrono(controlador.resolverExcepcion));

  return router;
}
