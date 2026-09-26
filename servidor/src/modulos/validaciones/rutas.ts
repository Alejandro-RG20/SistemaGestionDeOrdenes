/**
 * Rutas de la validacion tecnica.
 *
 * Consultar la revision exige el MISMO permiso que registrarla, y no
 * `ordenes.consultar`. No es celo: el expediente de revision reune el
 * trabajo de una persona con nombre para que alguien lo juzgue, y eso no
 * es material de consulta general.
 */
import { Router, type RequestHandler } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeValidaciones(): Router {
  const router = Router();
  const validar: RequestHandler = exigirPermiso('taller.validacion.registrar');

  router.get('/validaciones/pendientes', validar, asincrono(controlador.pendientes));
  router.get('/ordenes/:id/revision', validar, asincrono(controlador.expediente));
  router.post('/ordenes/:id/validaciones', validar, asincrono(controlador.registrar));

  // El historial si lo ve cualquiera que pueda ver la orden: en el detalle
  // hace falta saber si el trabajo paso la revision y cuando.
  router.get('/ordenes/:id/validaciones',
    exigirPermiso('ordenes.consultar'), asincrono(controlador.listarDeOrden));

  return router;
}
