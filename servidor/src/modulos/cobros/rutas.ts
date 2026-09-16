/**
 * Rutas del modulo de cobros.
 *
 * Una sola puerta para mover un expediente —`POST /expedientes/:id/estado`—
 * igual que con las ordenes: un endpoint por transicion repartiria la
 * maquina de estados en seis sitios.
 *
 * No hay ruta para borrar un expediente ni para editar su monto a mano. El
 * monto se recalcula desde los datos con `/verificar`; si esta mal, lo que
 * esta mal son los consumos o la cotizacion, y se corrigen alli.
 */
import { Router, type RequestHandler } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeCobros(): Router {
  const router = Router();
  const conformar: RequestHandler = exigirPermiso('cobros.expediente.conformar');
  const enviar: RequestHandler = exigirPermiso('cobros.expediente.enviar');
  const consultarIndicadores: RequestHandler = exigirPermiso('cobros.indicadores.consultar');

  router.get('/expedientes', conformar, asincrono(controlador.listar));
  router.get('/expedientes/:id', conformar, asincrono(controlador.obtener));
  router.post('/ordenes/:id/expediente', conformar, asincrono(controlador.conformar));
  router.post('/expedientes/:id/verificar', conformar, asincrono(controlador.verificar));

  // Mover el expediente es lo que lo saca del centro y lo que anota el
  // resultado: exige el permiso de envio, no el de conformacion.
  router.post('/expedientes/:id/estado', enviar, asincrono(controlador.mover));

  router.get('/pagos', exigirPermiso('cobros.pago.registrar'), asincrono(controlador.listarPagos));
  router.post('/ordenes/:id/pagos',
    exigirPermiso('cobros.pago.registrar'), asincrono(controlador.registrarPago));

  router.get('/cobros/indicadores', consultarIndicadores, asincrono(controlador.indicadores));

  return router;
}
