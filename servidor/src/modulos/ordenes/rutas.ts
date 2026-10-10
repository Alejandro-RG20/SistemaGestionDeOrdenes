/**
 * Rutas del modulo de ordenes.
 *
 * No hay ruta DELETE: una orden no se elimina. Se anula, con motivo, y eso
 * es una transicion de estado como cualquier otra.
 */
import { Router, type RequestHandler } from 'express';
import { asincrono, exigirAlgunPermiso, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeOrdenes(): Router {
  const router = Router();
  const consultar: RequestHandler = exigirPermiso('ordenes.consultar');

  router.get('/ordenes', consultar, asincrono(controlador.listar));
  router.get('/ordenes/alertas', consultar, asincrono(controlador.alertas));
  router.get('/ordenes/:id', consultar, asincrono(controlador.obtener));
  router.get('/ordenes/:id/historial', consultar, asincrono(controlador.historial));
  router.post('/ordenes', exigirPermiso('ordenes.crear'), asincrono(controlador.crear));
  router.put('/ordenes/:id/tecnico', exigirPermiso('ordenes.asignar'), asincrono(controlador.asignarTecnico));

  // Una sola puerta para mover la orden: la maquina de estados decide si el
  // paso vale y si quien lo pide es el responsable de turno.
  router.post('/ordenes/:id/estado', consultar, asincrono(controlador.mover));

  /*
   * Bitacora de comentarios. Escribe quien OPERA ordenes: el que las
   * registra, despacha, cierra, entrega, diagnostica, fotografia, surte
   * repuestos o revisa trabajos. El usuario de consulta, que solo lee, no.
   * No hay permiso propio para no tocar el catalogo sembrado; ver
   * documentos/AUDITORIA_Y_CORRECCIONES.md.
   */
  router.post('/ordenes/:id/bitacora', exigirAlgunPermiso(
    'ordenes.crear', 'ordenes.asignar', 'ordenes.cerrar', 'ordenes.entregar',
    'taller.diagnostico.registrar', 'campo.evidencia.cargar', 'inventario.solicitud.gestionar',
    'taller.validacion.registrar',
  ), asincrono(controlador.registrarBitacora));

  // Diagnostico, cotizacion y decision del cliente (tablas existentes).
  router.get('/ordenes/:id/taller', consultar, asincrono(controlador.datosDeTaller));
  router.post('/ordenes/:id/diagnostico', exigirPermiso('taller.diagnostico.registrar'),
    asincrono(controlador.registrarDiagnostico));
  router.post('/ordenes/:id/cotizaciones', exigirPermiso('taller.cotizacion.registrar'),
    asincrono(controlador.registrarCotizacion));
  router.post('/ordenes/:id/cotizaciones/decision', exigirPermiso('taller.cotizacion.autorizar'),
    asincrono(controlador.registrarDecision));

  router.post('/ordenes/:id/notas', exigirPermiso('ordenes.nota_correccion'), asincrono(controlador.agregarNota));

  return router;
}
