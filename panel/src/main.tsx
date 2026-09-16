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
