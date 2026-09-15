/**
 * Rutas del modulo de inventario.
 *
 * No hay ruta para editar ni borrar un movimiento: un movimiento no se
 * edita, se corrige con un ajuste justificado, que es otro movimiento.
 */
import { Router, type RequestHandler } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeInventario(): Router {
  const router = Router();
  const consultar: RequestHandler = exigirPermiso('inventario.consultar');

  router.get('/bodegas', consultar, asincrono(controlador.listarBodegas));
  router.get('/repuestos', consultar, asincrono(controlador.listarRepuestos));
  router.get('/existencias', consultar, asincrono(controlador.listarExistencias));
  router.get('/movimientos', consultar, asincrono(controlador.listarMovimientos));
  router.get('/solicitudes-repuesto', consultar, asincrono(controlador.listarSolicitudes));

  // Una sola puerta para registrar cualquier movimiento: el tipo decide que
  // exige, y eso esta declarado en dominio/inventario, no repartido en
  // cinco endpoints.
  router.post('/movimientos', consultar, asincrono(controlador.registrarMovimiento));

  router.post('/ordenes/:id/consumos',
    exigirPermiso('inventario.consumo.registrar'), asincrono(controlador.registrarConsumos));
  router.post('/ordenes/:id/solicitudes-repuesto',
    exigirPermiso('inventario.solicitud.gestionar'), asincrono(controlador.solicitarRepuesto));

  return router;
}
