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

  // El kardex de un repuesto: sus movimientos con el saldo corrido (§28).
  router.get('/repuestos/:id/kardex', consultar, asincrono(controlador.obtenerKardex));

  // El recorrido del §26. Un tecnico solo ve las solicitudes de sus ordenes:
  // el cerco esta en el servicio, no en este archivo.
  router.get('/solicitudes-repuesto/recorrido', consultar, asincrono(controlador.listarRecorrido));

  /*
   * Una sola puerta para registrar cualquier movimiento: el tipo decide que
   * exige, y eso esta declarado en dominio/inventario, no repartido en cinco
   * endpoints.
   *
   * `inventario.consultar` es el minimo para llegar aqui, NO la autorizacion
   * del movimiento. El permiso que de verdad decide depende del tipo —que
   * viene en el cuerpo— y lo comprueba el servicio con
   * PERMISO_DEL_MOVIMIENTO. Proteger esta ruta solo con el permiso de leer
   * era lo que dejaba a un usuario de consulta ingresar existencia.
   */
  router.post('/movimientos', consultar, asincrono(controlador.registrarMovimiento));

  // Cada paso exige su propio permiso, y lo comprueba el servicio: quien
  // aprueba no es quien recibe (§65).
  router.post('/solicitudes-repuesto/:id/pasos', consultar,
    asincrono(controlador.darPasoDeSolicitud));

  router.post('/ordenes/:id/consumos',
    exigirPermiso('inventario.consumo.registrar'), asincrono(controlador.registrarConsumos));
  router.post('/ordenes/:id/solicitudes-repuesto',
    exigirPermiso('inventario.solicitud.gestionar'), asincrono(controlador.solicitarRepuesto));

  return router;
}
