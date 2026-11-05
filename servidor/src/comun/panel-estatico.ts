/**
 * Servir el panel ya compilado desde el mismo proceso de la API.
 *
 * En desarrollo el panel corre con Vite (puerto 5173) y hace proxy de `/api`
 * hacia este servidor. En un contenedor no hay Vite: el panel se compila a
 * archivos estaticos (`panel/dist`) y los sirve Express, en el MISMO origen
 * que la API. Asi el navegador no cruza origenes, no hace falta CORS y la
 * aplicacion del tecnico (`/campo`) registra su service worker sin trucos.
 *
 * Solo se activa si la carpeta existe: las pruebas y el desarrollo, que no
 * compilan el panel, siguen exactamente igual que antes.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';

/** Donde buscar el panel compilado: `PANEL_DIST` o `panel/dist` del repositorio. */
export function carpetaDelPanel(): string {
  const configurada = process.env['PANEL_DIST'];
  if (configurada !== undefined && configurada !== '') return path.resolve(configurada);
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  // comun/ -> src|dist/ -> servidor/ -> raiz del repositorio
  return path.resolve(aqui, '..', '..', '..', 'panel', 'dist');
}

/**
 * Monta los archivos del panel y la ruta de respaldo de la SPA. Devuelve si
 * los monto. Se llama DESPUES de las rutas de la API: una ruta `/api/...`
 * desconocida sigue respondiendo el 404 en JSON de siempre, nunca el HTML.
 */
export function montarPanelEstatico(aplicacion: Express, carpeta = carpetaDelPanel()): boolean {
  const indice = path.join(carpeta, 'index.html');
  if (!existsSync(indice)) return false;

  aplicacion.use(express.static(carpeta, {
    index: false,
    setHeaders: (respuesta, ruta) => {
      // Vite pone una huella en el nombre de cada archivo de /assets: se
      // pueden guardar un año. El indice y el service worker, en cambio,
      // deben revisarse siempre o el navegador se queda con la version vieja.
      if (ruta.includes(`${path.sep}assets${path.sep}`)) {
        respuesta.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        respuesta.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  // React Router resuelve las rutas en el navegador (/ordenes/123,
  // /campo, /consulta...). Cualquier GET que no sea de la API recibe el
  // indice y la SPA decide que pantalla mostrar.
  aplicacion.get(/^\/(?!api(?:\/|$)).*/, (_peticion, respuesta) => {
    respuesta.setHeader('Cache-Control', 'no-cache');
    respuesta.sendFile(indice);
  });
  return true;
}
