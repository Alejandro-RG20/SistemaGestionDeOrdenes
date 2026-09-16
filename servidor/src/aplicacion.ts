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
import { rutasDeClientes } from './modulos/clientes/rutas.js';
import { rutasDeArticulos } from './modulos/articulos/rutas.js';
import { rutasDeGarantias } from './modulos/garantias/rutas.js';
import { rutasDeOrdenes } from './modulos/ordenes/rutas.js';
import { rutasDeAgenda } from './modulos/agenda/rutas.js';
import { rutasDeInventario } from './modulos/inventario/rutas.js';
import { rutasDeSincronizacion } from './modulos/sincronizacion/rutas.js';
import { rutasDeCampo } from './modulos/campo/rutas.js';
import { rutasDeCobros } from './modulos/cobros/rutas.js';
import { rutasDeAvisos } from './modulos/avisos/rutas.js';
import { rutasDeIndicadores } from './modulos/indicadores/rutas.js';
import { rutasDelPortal } from './modulos/portal/rutas.js';
import { rutasDeCatalogos } from './modulos/catalogos/rutas.js';

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
  // El portal de consulta del cliente es publico a proposito: pedirle cuenta
  // a quien solo quiere saber si su articulo esta listo es la forma mas
  // segura de que llame por telefono en vez de consultar.
  aplicacion.use(RAIZ_API, rutasDelPortal());

  // A partir de aqui, toda ruta exige sesion valida.
  const exigirSesion = crearExigirSesion(cargarUsuarioAutenticado);
  aplicacion.use(RAIZ_API, exigirSesion, rutasPrivadasDeSeguridad());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeClientes());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeArticulos());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeGarantias());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeOrdenes());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeAgenda());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeInventario());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeSincronizacion());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeCampo());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeCobros());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeAvisos());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeIndicadores());
  aplicacion.use(RAIZ_API, exigirSesion, rutasDeCatalogos());

  aplicacion.use(manejarRutaDesconocida);
  aplicacion.use(manejarErrores);

  return aplicacion;
}
