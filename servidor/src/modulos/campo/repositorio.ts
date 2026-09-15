/**
 * Acceso a datos de lo que se registra en campo: diagnosticos y evidencias.
 *
 * La evidencia guarda RUTA, HUELLA y metadatos. El binario nunca entra en
 * la base (AD-09): vive en el almacenamiento de objetos.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export async function insertarDiagnostico(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; idTecnico: string; fallaReal: string; componente: string | null;
    momentoDispositivo: Date; creadoPor: string;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO diagnostico
       (id_orden, id_tecnico, falla_real, componente, momento_dispositivo, registrado_sin_conexion)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [datos.idOrden, datos.idTecnico, datos.fallaReal, datos.componente, datos.momentoDispositivo],
  );
  return rows[0]!.id;
}

export async function insertarEvidencia(
  ejecutor: Ejecutor,
  datos: {
    idOrden: string; tipo: string; clave: string; rutaArchivo: string | null;
    huellaDigital: string | null; idAutor: string; momentoDispositivo: Date;
    latitud: number | null; longitud: number | null; bytes: number | null; sincronizada: boolean;
  },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    `INSERT INTO evidencia
       (id_orden, tipo, clave, ruta_archivo, huella_digital, id_autor, momento_dispositivo,
        latitud, longitud, bytes, sincronizada)
     VALUES ($1, $2::tipo_evidencia, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [datos.idOrden, datos.tipo, datos.clave, datos.rutaArchivo, datos.huellaDigital,
      datos.idAutor, datos.momentoDispositivo, datos.latitud, datos.longitud,
      datos.bytes, datos.sincronizada],
  );
  return rows[0]!.id;
}

export async function marcarEvidenciaSincronizada(
  ejecutor: Ejecutor,
  datos: { id: string; rutaArchivo: string; huellaDigital: string; bytes: number },
): Promise<void> {
  await ejecutor.query(
    `UPDATE evidencia
        SET ruta_archivo = $2, huella_digital = $3, bytes = $4,
            sincronizada = true, momento_servidor = now()
      WHERE id = $1`,
    [datos.id, datos.rutaArchivo, datos.huellaDigital, datos.bytes],
  );
}

export interface FilaEvidencia {
  readonly id: string;
  readonly id_orden: string;
  readonly tipo: string;
  readonly clave: string;
  readonly ruta_archivo: string | null;
  readonly huella_digital: string | null;
  readonly autor: string | null;
  readonly momento_dispositivo: Date;
  readonly momento_servidor: Date;
  readonly latitud: string | null;
  readonly longitud: string | null;
  readonly bytes: number | null;
  readonly sincronizada: boolean;
}

export async function listarDeOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaEvidencia[]> {
  const { rows } = await ejecutor.query<FilaEvidencia>(
    `SELECT e.id, e.id_orden, e.tipo::text AS tipo, e.clave, e.ruta_archivo, e.huella_digital,
            u.nombres AS autor, e.momento_dispositivo, e.momento_servidor,
            e.latitud::text AS latitud, e.longitud::text AS longitud, e.bytes, e.sincronizada
       FROM evidencia e LEFT JOIN usuario u ON u.id = e.id_autor
      WHERE e.id_orden = $1 ORDER BY e.momento_dispositivo`,
    [idOrden],
  );
  return rows;
}

export async function buscarEvidencia(
  id: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaEvidencia | null> {
  const { rows } = await ejecutor.query<FilaEvidencia>(
    `SELECT e.id, e.id_orden, e.tipo::text AS tipo, e.clave, e.ruta_archivo, e.huella_digital,
            u.nombres AS autor, e.momento_dispositivo, e.momento_servidor,
            e.latitud::text AS latitud, e.longitud::text AS longitud, e.bytes, e.sincronizada
       FROM evidencia e LEFT JOIN usuario u ON u.id = e.id_autor WHERE e.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function ordenExiste(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<boolean> {
  const { rows } = await ejecutor.query('SELECT 1 FROM orden_servicio WHERE id = $1', [idOrden]);
  return rows.length > 0;
}
