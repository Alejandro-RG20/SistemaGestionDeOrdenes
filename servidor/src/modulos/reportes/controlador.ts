/** Controladores de reportes. Sin SQL y sin reglas de negocio. */
import type { Request, Response } from 'express';
import { responderDatos } from '../../comun/respuesta.js';
import { validar } from '../seguridad/esquemas.js';
import { esquemaConsultaReporte } from './esquemas.js';
import * as servicio from './servicio.js';
import { aCsv, nombreDeArchivo } from './csv.js';

export async function catalogo(_peticion: Request, respuesta: Response): Promise<void> {
  responderDatos(respuesta, servicio.catalogo());
}

export async function ejecutar(peticion: Request, respuesta: Response): Promise<void> {
  const { clave, desde, hasta } = validar(esquemaConsultaReporte, {
    clave: peticion.params['clave'],
    ...peticion.query,
  });
  responderDatos(respuesta, await servicio.ejecutar(clave, desde, hasta));
}

/**
 * El mismo reporte, como archivo (pliego §43).
 *
 * NO responde con la envoltura del §50 y es correcto: lo que viaja no es un
 * dato de la API, es un archivo que el navegador descarga. Un CSV envuelto en
 * JSON no lo abre Excel.
 *
 * Reusa `servicio.ejecutar`, el mismo que sirve la pantalla, para que el
 * archivo y lo que la persona ve en el navegador no puedan diferir. Dos
 * caminos a los mismos numeros es un camino de mas.
 */
export async function exportar(peticion: Request, respuesta: Response): Promise<void> {
  const { clave, desde, hasta } = validar(esquemaConsultaReporte, {
    clave: peticion.params['clave'],
    ...peticion.query,
  });
  const reporte = await servicio.ejecutar(clave, desde, hasta);

  respuesta
    .status(200)
    .type('text/csv; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${nombreDeArchivo(clave)}"`);
  respuesta.send(aCsv(reporte));
}
