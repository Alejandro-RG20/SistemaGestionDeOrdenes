/**
 * Rutas de tiendas.
 *
 * Listar lo puede hacer cualquiera con sesion: el formulario de alta de
 * orden necesita el desplegable de sucursales, y esconderlo no protege
 * nada —los nombres de las tiendas del grupo estan en la calle—.
 * Administrarlas exige el permiso.
 */
import { Router, type RequestHandler } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeTiendas(): Router {
  const router = Router();
  const gestionar: RequestHandler = exigirPermiso('tiendas.gestionar');

  router.get('/tiendas', asincrono(controlador.listar));
  router.get('/tiendas/:id', asincrono(controlador.obtener));
  router.post('/tiendas', gestionar, asincrono(controlador.crear));
  router.put('/tiendas/:id', gestionar, asincrono(controlador.editar));
  // No hay DELETE: las ordenes historicas siguen apuntando aqui.
  router.post('/tiendas/:id/desactivar', gestionar, asincrono(controlador.desactivar));
  router.post('/tiendas/:id/activar', gestionar, asincrono(controlador.activar));

  return router;
}
