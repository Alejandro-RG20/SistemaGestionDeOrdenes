/**
 * Rutas del modulo de ordenes.
 *
 * No hay ruta DELETE: una orden no se elimina. Se anula, con motivo, y eso
 * es una transicion de estado como cualquier otra.
 */
import { Router, type RequestHandler } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeOrdenes(): Router {
  const router = Router();
  const consultar: RequestHandler = exigirPermiso('ordenes.consultar');

  router.get('/ordenes', consultar, asincrono(controlador.listar));
  router.get('/ordenes/alertas', consultar, asincrono(controlador.alertas));
  router.get('/ordenes/:id', consultar, asincrono(controlador.obtener));
  router.post('/ordenes', exigirPermiso('ordenes.crear'), asincrono(controlador.crear));
  router.put('/ordenes/:id/tecnico', exigirPermiso('ordenes.asignar'), asincrono(controlador.asignarTecnico));

  // Una sola puerta para mover la orden: la maquina de estados decide si el
  // paso vale y si quien lo pide es el responsable de turno.
  router.post('/ordenes/:id/estado', consultar, asincrono(controlador.mover));

  router.post('/ordenes/:id/notas', exigirPermiso('ordenes.nota_correccion'), asincrono(controlador.agregarNota));

  return router;
}
