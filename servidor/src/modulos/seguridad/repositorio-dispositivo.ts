/** Acceso a datos de dispositivos moviles (RF-05). Uso interno del modulo. */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';
import type { FilaDispositivo } from './dto.js';

const CAMPOS = `
  d.id, d.id_usuario, u.nombre_usuario, d.identificador, d.modelo,
  d.vinculado_en, d.revocado_en, d.ultima_sincronizacion`;

export async function buscarPorId(
  id: string,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaDispositivo | null> {
  const { rows } = await ejecutor.query<FilaDispositivo>(
    `SELECT ${CAMPOS} FROM dispositivo d JOIN usuario u ON u.id = d.id_usuario WHERE d.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function buscarPorIdentificador(
  identificador: string,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaDispositivo | null> {
  const { rows } = await ejecutor.query<FilaDispositivo>(
    `SELECT ${CAMPOS} FROM dispositivo d JOIN usuario u ON u.id = d.id_usuario WHERE d.identificador = $1`,
    [identificador],
  );
  return rows[0] ?? null;
}

export async function contar(
  soloVigentes: boolean,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<number> {
  const { rows } = await ejecutor.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM dispositivo d
      WHERE ($1::boolean IS FALSE OR d.revocado_en IS NULL)`,
    [soloVigentes],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listar(
  soloVigentes: boolean,
  limite: number,
  desplazamiento: number,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaDispositivo[]> {
  const { rows } = await ejecutor.query<FilaDispositivo>(
    `SELECT ${CAMPOS}
       FROM dispositivo d JOIN usuario u ON u.id = d.id_usuario
      WHERE ($1::boolean IS FALSE OR d.revocado_en IS NULL)
      ORDER BY d.vinculado_en DESC
      LIMIT $2 OFFSET $3`,
    [soloVigentes, limite, desplazamiento],
  );
  return rows;
}

export async function insertar(
  ejecutor: Ejecutor,
  datos: { idUsuario: string; identificador: string; modelo: string | null },
): Promise<string> {
  const { rows } = await ejecutor.query<{ id: string }>(
    'INSERT INTO dispositivo (id_usuario, identificador, modelo) VALUES ($1, $2, $3) RETURNING id',
    [datos.idUsuario, datos.identificador, datos.modelo],
  );
  return rows[0]!.id;
}

/** Revocacion remota: el dispositivo deja de poder refrescar su sesion. */
export async function revocar(ejecutor: Ejecutor, id: string): Promise<void> {
  await ejecutor.query('UPDATE dispositivo SET revocado_en = now() WHERE id = $1 AND revocado_en IS NULL', [id]);
}

export async function anotarSincronizacion(ejecutor: Ejecutor, id: string): Promise<void> {
  await ejecutor.query('UPDATE dispositivo SET ultima_sincronizacion = now() WHERE id = $1', [id]);
}

/** Devuelve el dispositivo si sigue vigente y pertenece a ese usuario. */
export async function buscarVigenteDeUsuario(
  id: string,
  idUsuario: string,
  ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaDispositivo | null> {
  const { rows } = await ejecutor.query<FilaDispositivo>(
    `SELECT ${CAMPOS}
       FROM dispositivo d JOIN usuario u ON u.id = d.id_usuario
      WHERE d.id = $1 AND d.id_usuario = $2 AND d.revocado_en IS NULL`,
    [id, idUsuario],
  );
  return rows[0] ?? null;
}
