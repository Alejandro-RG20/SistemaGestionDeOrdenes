/** Rutas del modulo de clientes. */
import { Router } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeClientes(): Router {
  const router = Router();

  router.get('/clientes', exigirPermiso('clientes.consultar'), asincrono(controlador.listar));
  router.get('/clientes/:id', exigirPermiso('clientes.consultar'), asincrono(controlador.obtener));
  router.post('/clientes', exigirPermiso('clientes.crear'), asincrono(controlador.crear));
  router.patch('/clientes/:id', exigirPermiso('clientes.editar'), asincrono(controlador.actualizar));
  router.post('/clientes/:id/telefonos', exigirPermiso('clientes.editar'), asincrono(controlador.agregarTelefono));
  router.post('/clientes/:id/direcciones', exigirPermiso('clientes.editar'), asincrono(controlador.agregarDireccion));
  router.post('/clientes/:id/fusionar', exigirPermiso('clientes.fusionar'), asincrono(controlador.fusionar));

  return router;
}
