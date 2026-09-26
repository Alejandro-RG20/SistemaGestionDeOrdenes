/**
 * Rutas de la entrega.
 *
 * La verificacion se consulta con el mismo permiso que entregar: es la
 * pantalla previa del mostrador, y quien no va a entregar no necesita
 * saber que le falta a la orden para salir.
 */
import { Router, type RequestHandler } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeEntregas(): Router {
  const router = Router();
  const entregar: RequestHandler = exigirPermiso('ordenes.entregar');

  router.get('/ordenes/:id/entrega', entregar, asincrono(controlador.verificar));
  router.post('/ordenes/:id/entrega', entregar, asincrono(controlador.entregar));

  return router;
}
