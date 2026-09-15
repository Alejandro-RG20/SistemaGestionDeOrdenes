/**
 * Rutas de evidencias: la segunda cola.
 *
 * La subida por partes usa cuerpo binario, no JSON; por eso lleva su propio
 * analizador. El limite por parte es holgado pero acotado: la reanudacion
 * existe para no depender de que una sola peticion llegue entera.
 */
import express, { Router } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

/** Tamano maximo de UNA parte. El archivo entero puede ser mucho mayor. */
const LIMITE_POR_PARTE = '8mb';

export function rutasDeCampo(): Router {
  const router = Router();
  const cargar = exigirPermiso('campo.evidencia.cargar');

  // La descarga de jornada la pide la app al iniciar sesion y al volver al
  // taller. Exige el mismo permiso que sincronizar: es la otra mitad del
  // trabajo sin conexion.
  router.get('/campo/jornada', exigirPermiso('campo.sincronizar'), asincrono(controlador.descargarJornada));

  router.get('/ordenes/:id/evidencias', exigirPermiso('ordenes.consultar'), asincrono(controlador.listarDeOrden));

  router.post('/evidencias/cargas', cargar, asincrono(controlador.iniciarCarga));
  router.get('/evidencias/cargas/:idCarga', cargar, asincrono(controlador.consultarCarga));
  router.patch('/evidencias/cargas/:idCarga',
    cargar,
    express.raw({ type: 'application/octet-stream', limit: LIMITE_POR_PARTE }),
    asincrono(controlador.agregarParte));
  router.post('/evidencias/cargas/:idCarga/cerrar', cargar, asincrono(controlador.cerrarCarga));

  return router;
}
