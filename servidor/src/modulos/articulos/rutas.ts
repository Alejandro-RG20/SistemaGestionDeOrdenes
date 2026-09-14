/**
 * Rutas del modulo de articulos.
 *
 * Los tres caminos que alteran la cobertura —datos sensibles, cambio de
 * dueno y alta de cobertura— exigen `articulos.editar_datos_sensibles`,
 * que en la matriz solo tienen las jefaturas.
 */
import { Router, type RequestHandler } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeArticulos(): Router {
  const router = Router();
  const consultar: RequestHandler = exigirPermiso('articulos.consultar');
  const datosSensibles: RequestHandler = exigirPermiso('articulos.editar_datos_sensibles');

  router.get('/articulos', consultar, asincrono(controlador.listar));
  router.get('/articulos/serie/:serie', consultar, asincrono(controlador.obtenerPorSerie));
  router.get('/articulos/:id', consultar, asincrono(controlador.obtener));
  router.post('/articulos', exigirPermiso('articulos.crear'), asincrono(controlador.crear));
  router.patch('/articulos/:id', exigirPermiso('articulos.editar'), asincrono(controlador.actualizar));

  router.put('/articulos/:id/datos-sensibles', datosSensibles, asincrono(controlador.cambiarDatosSensibles));
  router.post('/articulos/:id/transferir', datosSensibles, asincrono(controlador.transferir));
  router.post('/articulos/:id/coberturas', datosSensibles, asincrono(controlador.registrarCobertura));

  return router;
}
