/** Punto de entrada del servidor HTTP: `npm run iniciar`. */
import { construirAplicacion } from './aplicacion.js';
import { leerPuerto } from './comun/configuracion.js';
import { bitacora } from './comun/bitacora.js';
import { cerrarPiscina } from './infraestructura/conexion.js';

const puerto = leerPuerto();
const servidor = construirAplicacion().listen(puerto, () => {
  bitacora.informacion(`ServiTotal escuchando en el puerto ${puerto}`);
});

/** Cierre ordenado: se dejan terminar las peticiones en curso. */
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(senal, () => {
    bitacora.informacion(`Senal ${senal} recibida; cerrando`);
    servidor.close(() => {
      cerrarPiscina()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          bitacora.error('Fallo al cerrar la piscina de conexiones', { detalle: String(error) });
          process.exit(1);
        });
    });
  });
}
