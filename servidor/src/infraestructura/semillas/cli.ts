/** Punto de entrada de la siembra: `npm run sembrar`. */
import { cerrarPiscina } from '../conexion.js';
import { bitacora } from '../../comun/bitacora.js';
import { ErrorAplicacion } from '../../comun/errores.js';
import { sembrar } from './sembrador.js';

sembrar()
  .catch((error: unknown) => {
    const mensaje = error instanceof ErrorAplicacion ? error.message : String(error);
    bitacora.error(`No se pudo sembrar la base de datos. ${mensaje}`);
    process.exitCode = 1;
  })
  .finally(() => cerrarPiscina());
