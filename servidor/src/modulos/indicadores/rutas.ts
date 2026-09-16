/**
 * Ruta de indicadores de operacion.
 *
 * Exige `ordenes.consultar` y no un permiso nuevo: son agregados de lo que
 * quien entra ya puede ver orden por orden. Inventar un permiso aparte solo
 * lograria que la jefatura tuviera que pedirselo a si misma.
 */
import { Router } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeIndicadores(): Router {
  const router = Router();
  router.get('/indicadores/operacion',
    exigirPermiso('ordenes.consultar'), asincrono(controlador.operacion));
  return router;
}
