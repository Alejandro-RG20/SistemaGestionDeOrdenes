/**
 * Ruta de catalogos de apoyo.
 *
 * Exige `ordenes.consultar` y no un permiso propio: son marcas, categorias
 * y zonas, datos de referencia sin los que no se puede dibujar un
 * formulario. Ponerles un permiso aparte solo lograria que a alguien se le
 * quedaran los desplegables vacios sin saber por que.
 */
import { Router } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeCatalogos(): Router {
  const router = Router();
  router.get('/catalogos', exigirPermiso('ordenes.consultar'), asincrono(controlador.obtener));
  return router;
}
