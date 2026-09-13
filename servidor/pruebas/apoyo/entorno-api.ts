/**
 * Apoyo de las pruebas de la API: base desechable, migraciones, siembra y
 * una aplicacion lista para atacar con peticiones HTTP reales.
 */
import type { Express } from 'express';
import type { Pool } from 'pg';
import { prepararBaseDePruebas } from './base-de-pruebas.js';
import { CONTRASENA_DE_PRUEBA } from '../../src/infraestructura/semillas/paso-seguridad.js';

export { CONTRASENA_DE_PRUEBA };

export interface EntornoApi {
  readonly aplicacion: Express;
  readonly piscina: Pool;
  readonly cerrar: () => Promise<void>;
}

/**
 * Monta el entorno completo una sola vez por archivo de pruebas. La siembra
 * es cara; las pruebas la comparten y evitan modificarse datos entre si.
 */
export async function montarApi(): Promise<EntornoApi> {
  process.env['JWT_SECRETO'] ??= 'clave-de-pruebas-suficientemente-larga-para-hs256';
  process.env['SEGURIDAD_INTENTOS_PARA_BLOQUEO'] ??= '5';
  await prepararBaseDePruebas();

  const { aplicarMigraciones } = await import('../../src/infraestructura/migraciones/ejecutor.js');
  const conexion = await import('../../src/infraestructura/conexion.js');
  const { sembrar } = await import('../../src/infraestructura/semillas/sembrador.js');
  const { construirAplicacion } = await import('../../src/aplicacion.js');

  await aplicarMigraciones();
  await sembrar({ semilla: 20260913 });

  return {
    aplicacion: construirAplicacion(),
    piscina: conexion.obtenerPiscina(),
    cerrar: conexion.cerrarPiscina,
  };
}

/** Nombre de usuario de alguien con ese rol, tomado de la siembra. */
export async function usuarioConRol(piscina: Pool, codigoRol: string): Promise<string> {
  const { rows } = await piscina.query<{ nombre_usuario: string }>(
    `SELECT u.nombre_usuario FROM usuario u JOIN rol r ON r.id = u.id_rol
      WHERE r.codigo = $1 AND u.activo AND NOT u.bloqueado
      ORDER BY u.nombre_usuario LIMIT 1`,
    [codigoRol],
  );
  if (rows[0] === undefined) throw new Error(`La siembra no dejo ningun usuario con el rol ${codigoRol}.`);
  return rows[0].nombre_usuario;
}
