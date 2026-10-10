/** Rutas del modulo de agenda. */
import { Router } from 'express';
import { asincrono, exigirAlgunPermiso, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeAgenda(): Router {
  const router = Router();

  router.get('/agenda', exigirPermiso('agenda.consultar'), asincrono(controlador.listar));
  router.get('/agenda/resumen', exigirPermiso('agenda.consultar'), asincrono(controlador.resumen));
  // Llegada y salida reales. Las registra el tecnico de la visita (desde el
  // panel o el movil) o quien programa la agenda; el servicio lo comprueba.
  router.post('/visitas/:id/llegada', exigirAlgunPermiso('agenda.programar', 'campo.sincronizar'),
    asincrono(controlador.registrarLlegada));
  router.post('/visitas/:id/salida', exigirAlgunPermiso('agenda.programar', 'campo.sincronizar'),
    asincrono(controlador.registrarSalida));
  router.get('/agenda/calendario', exigirPermiso('agenda.consultar'), asincrono(controlador.calendario));
  router.get('/ordenes/:id/visitas', exigirPermiso('agenda.consultar'), asincrono(controlador.listarDeOrden));
  router.post('/ordenes/:id/visitas', exigirPermiso('agenda.programar'), asincrono(controlador.programar));
  router.put('/ordenes/:id/visitas', exigirPermiso('agenda.programar'), asincrono(controlador.reprogramar));

  return router;
}
