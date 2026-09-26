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
import { rutasDeValidaciones } from './modulos/validaciones/rutas.js';
import { rutasDeEntregas } from './modulos/entregas/rutas.js';
import { rutasDeCompras } from './modulos/compras/rutas.js';
import { rutasDeTiendas } from './modulos/tiendas/rutas.js';
import { rutasDeReportes } from './modulos/reportes/rutas.js';

export const RAIZ_API = '/api/v1';

/**
 * El pliego escribe las rutas como `/api/...` y el sistema las sirve en
 * `/api/v1/...`. Se atienden LAS DOS, montando el mismo router en ambas
 * raices.
 *
 * No es indecision: la version en la ruta es lo que permite cambiar un
 * contrato sin romper a quien ya lo usa, y quitarla para parecerse al
 * ejemplo del pliego seria perder algo real a cambio de nada. `/api` queda
 * como alias permanente y apunta siempre a la version vigente.
 */
export const RAICES_API = ['/api/v1', '/api'] as const;

/** Tamano maximo del cuerpo JSON. Las evidencias no viajan por aqui (AD-09). */
const LIMITE_CUERPO = '256kb';

export function construirAplicacion(): Express {
  const aplicacion = express();

  aplicacion.disable('x-powered-by');
  aplicacion.use(express.json({ limit: LIMITE_CUERPO }));
  aplicacion.use(asignarCorrelacion);

  for (const raiz of RAICES_API) {
    aplicacion.get(`${raiz}/salud`, (_peticion, respuesta) => {
      respuesta.json({ datos: { estado: 'disponible' } });
    });

    aplicacion.use(raiz, rutasPublicasDeSeguridad());
    // El portal de consulta del cliente es publico a proposito: pedirle
    // cuenta a quien solo quiere saber si su articulo esta listo es la
    // forma mas segura de que llame por telefono en vez de consultar.
    aplicacion.use(raiz, rutasDelPortal());

    // A partir de aqui, toda ruta exige sesion valida.
    const exigirSesion = crearExigirSesion(cargarUsuarioAutenticado);
    aplicacion.use(raiz, exigirSesion, rutasPrivadasDeSeguridad());
    aplicacion.use(raiz, exigirSesion, rutasDeClientes());
    aplicacion.use(raiz, exigirSesion, rutasDeArticulos());
    aplicacion.use(raiz, exigirSesion, rutasDeGarantias());
    aplicacion.use(raiz, exigirSesion, rutasDeOrdenes());
    aplicacion.use(raiz, exigirSesion, rutasDeAgenda());
    aplicacion.use(raiz, exigirSesion, rutasDeInventario());
    aplicacion.use(raiz, exigirSesion, rutasDeSincronizacion());
    aplicacion.use(raiz, exigirSesion, rutasDeCampo());
    aplicacion.use(raiz, exigirSesion, rutasDeCobros());
    aplicacion.use(raiz, exigirSesion, rutasDeAvisos());
    aplicacion.use(raiz, exigirSesion, rutasDeIndicadores());
    aplicacion.use(raiz, exigirSesion, rutasDeCatalogos());
    aplicacion.use(raiz, exigirSesion, rutasDeValidaciones());
    aplicacion.use(raiz, exigirSesion, rutasDeEntregas());
    aplicacion.use(raiz, exigirSesion, rutasDeCompras());
    aplicacion.use(raiz, exigirSesion, rutasDeTiendas());
    aplicacion.use(raiz, exigirSesion, rutasDeReportes());
  }

  aplicacion.use(manejarRutaDesconocida);
  aplicacion.use(manejarErrores);

  return aplicacion;
}
