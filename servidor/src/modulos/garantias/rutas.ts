/** Rutas del modulo de garantias. */
import { Router } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeGarantias(): Router {
  const router = Router();

  router.get('/coberturas/reglas', exigirPermiso('garantias.evaluar'), asincrono(controlador.listarReglas));
  router.post('/coberturas/reglas', exigirPermiso('garantias.regla.gestionar'),
    asincrono(controlador.crearVersionDeRegla));
  router.post('/coberturas/evaluar', exigirPermiso('garantias.evaluar'), asincrono(controlador.evaluar));

  return router;
}
