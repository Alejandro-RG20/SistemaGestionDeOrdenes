/**
 * Ruta de la bandeja de avisos.
 *
 * No exige un permiso propio: cualquiera con sesion tiene bandeja, y lo que
 * ve dentro lo deciden sus permisos, grupo por grupo. Un permiso de entrada
 * solo lograria que a quien no lo tuviera se le ocultara tambien lo suyo.
 */
import { Router } from 'express';
import { asincrono } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeAvisos(): Router {
  const router = Router();
  router.get('/avisos', asincrono(controlador.bandeja));
  return router;
}
