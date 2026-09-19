/**
 * Arranque del panel.
 *
 * Aqui se registra el trabajador de servicio, que es lo que permite que la
 * aplicacion ABRA sin señal. Sin el, el tecnico con la jornada guardada en
 * el dispositivo veria igualmente la pantalla de «sin conexion» al tocar el
 * icono, y todo el trabajo sin conexion no serviria de nada.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './estilos.css';

const raiz = document.getElementById('raiz');
if (raiz === null) throw new Error('No se encontro el elemento raiz del panel.');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Se registra despues de pintar, para no competir con la primera carga, y
 * un fallo no rompe nada: sin trabajador de servicio la aplicacion sigue
 * funcionando con red, que es el caso del taller.
 *
 * Solo en produccion: en desarrollo, una cache del armazon haria que los
 * cambios no se vieran y se perderia media tarde buscando por que.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
