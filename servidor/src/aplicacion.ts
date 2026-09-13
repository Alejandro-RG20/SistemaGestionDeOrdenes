/**
 * Construccion de la aplicacion HTTP.
 *
 * Un solo backend desplegable, dividido en modulos con fronteras
 * explicitas: aqui se montan, y es el unico punto donde se conocen entre si.
 */
import express, { type Express } from 'express';
import { asignarCorrelacion, crearExigirSesion } from './comun/autenticacion.js';
import { manejarErrores, manejarRutaDesconocida } from './comun/manejador-errores.js';
import { cargarUsuarioAutenticado } from './modulos/seguridad/servicio-autenticacion.js';
import { rutasPrivadasDeSeguridad, rutasPublicasDeSeguridad } from './modulos/seguridad/rutas.js';

export const RAIZ_API = '/api/v1';

/** Tamano maximo del cuerpo JSON. Las evidencias no viajan por aqui (AD-09). */
const LIMITE_CUERPO = '256kb';

export function construirAplicacion(): Express {
  const aplicacion = express();

  aplicacion.disable('x-powered-by');
  aplicacion.use(express.json({ limit: LIMITE_CUERPO }));
  aplicacion.use(asignarCorrelacion);

  aplicacion.get(`${RAIZ_API}/salud`, (_peticion, respuesta) => {
    respuesta.json({ datos: { estado: 'disponible' } });
  });

  aplicacion.use(RAIZ_API, rutasPublicasDeSeguridad());

  // A partir de aqui, toda ruta exige sesion valida.
  const exigirSesion = crearExigirSesion(cargarUsuarioAutenticado);
  aplicacion.use(RAIZ_API, exigirSesion, rutasPrivadasDeSeguridad());

  aplicacion.use(manejarRutaDesconocida);
  aplicacion.use(manejarErrores);

  return aplicacion;
}
