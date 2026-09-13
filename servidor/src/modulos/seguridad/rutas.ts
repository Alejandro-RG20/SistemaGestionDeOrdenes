/**
 * Rutas del modulo de seguridad.
 *
 * Cada ruta declara el permiso que exige. La comprobacion la hace el
 * servidor contra rol_permiso en cada peticion: da igual que la llamada
 * venga del panel o de curl.
 */
import { Router, type RequestHandler } from 'express';
import { exigirPermiso, asincrono } from '../../comun/autorizacion.js';
import * as autenticacion from './controlador-autenticacion.js';
import * as usuarios from './controlador-usuario.js';
import * as roles from './controlador-rol.js';
import * as dispositivos from './controlador-dispositivo.js';

/**
 * Rutas publicas: iniciar sesion y refrescarla. Son las unicas dos del
 * sistema que no exigen sesion previa.
 */
export function rutasPublicasDeSeguridad(): Router {
  const router = Router();
  router.post('/autenticacion/sesion', asincrono(autenticacion.iniciarSesion));
  router.post('/autenticacion/refresco', asincrono(autenticacion.refrescar));
  return router;
}

/** Rutas que exigen sesion. El middleware de sesion se aplica antes de montarlas. */
export function rutasPrivadasDeSeguridad(): Router {
  const router = Router();

  router.delete('/autenticacion/sesion', asincrono(autenticacion.cerrarSesion));
  router.get('/autenticacion/yo', asincrono(autenticacion.perfil));

  const gestionarUsuarios: RequestHandler = exigirPermiso('seguridad.usuario.gestionar');
  router.get('/usuarios', gestionarUsuarios, asincrono(usuarios.listar));
  router.post('/usuarios', gestionarUsuarios, asincrono(usuarios.crear));
  router.get('/usuarios/:id', gestionarUsuarios, asincrono(usuarios.obtener));
  router.patch('/usuarios/:id', gestionarUsuarios, asincrono(usuarios.actualizar));
  router.put('/usuarios/:id/contrasena', gestionarUsuarios, asincrono(usuarios.cambiarContrasena));
  router.post('/usuarios/:id/desbloquear', gestionarUsuarios, asincrono(usuarios.desbloquear));
  // Nada se elimina: se desactiva, con motivo escrito.
  router.post('/usuarios/:id/desactivar', gestionarUsuarios, asincrono(usuarios.desactivar));

  const gestionarRoles: RequestHandler = exigirPermiso('seguridad.rol.gestionar');
  router.get('/roles', gestionarRoles, asincrono(roles.listarRoles));
  router.get('/roles/:id/permisos', gestionarRoles, asincrono(roles.listarPermisosDeRol));
  router.put('/roles/:id/permisos', gestionarRoles, asincrono(roles.asignarPermisos));
  router.get('/permisos', gestionarRoles, asincrono(roles.listarPermisos));

  router.get('/dispositivos', exigirPermiso('seguridad.dispositivo.vincular'), asincrono(dispositivos.listar));
  router.post('/dispositivos', exigirPermiso('seguridad.dispositivo.vincular'), asincrono(dispositivos.vincular));
  router.post('/dispositivos/:id/revocar', exigirPermiso('seguridad.dispositivo.revocar'), asincrono(dispositivos.revocar));

  router.get('/bitacora', exigirPermiso('seguridad.bitacora.consultar'), asincrono(roles.listarBitacora));

  return router;
}
