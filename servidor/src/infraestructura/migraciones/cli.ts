/** Punto de entrada de las migraciones: `npm run migrar` / `npm run migrar:estado`. */
import { cerrarPiscina } from '../conexion.js';
import { bitacora } from '../../comun/bitacora.js';
import { ErrorAplicacion } from '../../comun/errores.js';
import { aplicarMigraciones, consultarEstado } from './ejecutor.js';

async function principal(): Promise<void> {
  const orden = process.argv[2] ?? 'aplicar';

  if (orden === 'estado') {
    const estado = await consultarEstado();
    for (const fila of estado) {
      const marca = fila.alterada ? 'ALTERADA' : fila.aplicada ? 'aplicada' : 'pendiente';
      console.log(`${marca.padEnd(10)} ${fila.nombre}`);
    }
    return;
  }

  if (orden !== 'aplicar') {
    throw new ErrorAplicacion('ORDEN_DESCONOCIDA', `Orden no reconocida: "${orden}". Use "aplicar" o "estado".`);
  }

  const resultado = await aplicarMigraciones();
  bitacora.informacion('Migraciones al dia', {
    aplicadas: resultado.aplicadas.length,
    omitidas: resultado.omitidas.length,
  });
}

principal()
  .catch((error: unknown) => {
    const mensaje = error instanceof ErrorAplicacion ? error.message : String(error);
    bitacora.error(`No se pudieron aplicar las migraciones. ${mensaje}`);
    process.exitCode = 1;
  })
  .finally(() => cerrarPiscina());
