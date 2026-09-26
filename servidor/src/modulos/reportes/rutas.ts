/**
 * Rutas de reportes. Un endpoint para los diecisiete.
 *
 * Todos exigen el mismo permiso porque un reporte de tiempos y uno de
 * cobros son la misma clase de informacion: la operacion agregada del
 * centro. Quien puede ver una, puede ver la otra.
 */
import { Router, type RequestHandler } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeReportes(): Router {
  const router = Router();
  const consultar: RequestHandler = exigirPermiso('reportes.consultar');

  router.get('/reportes', consultar, asincrono(controlador.catalogo));
  router.get('/reportes/:clave', consultar, asincrono(controlador.ejecutar));

  return router;
}
