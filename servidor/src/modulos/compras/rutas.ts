/**
 * Rutas de compras y proveedores.
 *
 * PEDIR Y RECIBIR SON PERMISOS DISTINTOS, y eso es el control interno del
 * modulo: quien arma el pedido al proveedor no es quien declara que la
 * mercaderia llego. Una sola persona haciendo las dos cosas es como se
 * pierde inventario sin que nadie lo note.
 */
import { Router, type RequestHandler } from 'express';
import { asincrono, exigirPermiso } from '../../comun/autorizacion.js';
import * as controlador from './controlador.js';

export function rutasDeCompras(): Router {
  const router = Router();
  const consultar: RequestHandler = exigirPermiso('compras.consultar');
  const gestionar: RequestHandler = exigirPermiso('compras.gestionar');
  const recibir: RequestHandler = exigirPermiso('compras.recibir');
  const proveedores: RequestHandler = exigirPermiso('compras.proveedor.gestionar');

  router.get('/proveedores', consultar, asincrono(controlador.listarProveedores));
  router.post('/proveedores', proveedores, asincrono(controlador.crearProveedor));
  router.put('/proveedores/:id', proveedores, asincrono(controlador.editarProveedor));
  // No hay DELETE: un proveedor se desactiva y sus compras siguen ahi.
  router.post('/proveedores/:id/desactivar', proveedores, asincrono(controlador.desactivarProveedor));
  router.post('/proveedores/:id/activar', proveedores, asincrono(controlador.activarProveedor));

  router.get('/compras', consultar, asincrono(controlador.listar));
  router.get('/compras/:id', consultar, asincrono(controlador.obtener));
  router.post('/compras', gestionar, asincrono(controlador.crear));
  router.post('/compras/:id/estado', gestionar, asincrono(controlador.mover));

  // La recepcion es de bodega, no de compras.
  router.post('/compras/:id/recepcion', recibir, asincrono(controlador.recibir));

  return router;
}
