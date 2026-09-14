/** Rutas del modulo de agenda. */
import { Router } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeAgenda(): Router {
  const router = Router();

  router.get('/agenda', exigirPermiso('agenda.consultar'), asincrono(controlador.listar));
  router.get('/agenda/calendario', exigirPermiso('agenda.consultar'), asincrono(controlador.calendario));
  router.get('/ordenes/:id/visitas', exigirPermiso('agenda.consultar'), asincrono(controlador.listarDeOrden));
  router.post('/ordenes/:id/visitas', exigirPermiso('agenda.programar'), asincrono(controlador.programar));
  router.put('/ordenes/:id/visitas', exigirPermiso('agenda.programar'), asincrono(controlador.reprogramar));

  return router;
}
