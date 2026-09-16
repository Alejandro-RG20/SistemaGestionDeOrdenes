/**
 * Rutas del portal publico.
 *
 * SIN SESION, a proposito: el cliente no tiene cuenta y pedirle una para
 * saber si su refrigeradora esta lista es la forma mas segura de que no
 * consulte y llame por telefono, que es justo el trabajo que el portal
 * viene a quitarle al centro.
 *
 * A cambio, va con freno: la consulta responde a "numero de orden mas
 * telefono" y sin limite cualquiera podria recorrer numeros hasta dar con
 * uno que case.
 */
import { Router } from 'express';
import { asincrono } from '../../comun/autorizacion.js';
import { limitarPeticiones } from '../../comun/limite-peticiones.js';
import * as controlador from './controlador.js';

/** Veinte consultas por minuto: mas que suficiente para una persona. */
const LIMITE = limitarPeticiones({
  maximo: 20,
  ventanaMs: 60_000,
  mensaje: 'Demasiadas consultas seguidas. Espere un minuto y vuelva a intentarlo.',
});

export function rutasDelPortal(): Router {
  const router = Router();
  router.get('/portal/ordenes/:numero', LIMITE, asincrono(controlador.consultar));
  return router;
}
