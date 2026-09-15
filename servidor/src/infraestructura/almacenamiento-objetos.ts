/**
 * Almacenamiento de objetos para las evidencias.
 *
 * Los binarios NUNCA van en la base de datos (AD-09): la base guarda ruta,
 * huella y metadatos, y el archivo vive aqui.
 *
 * Esta implementacion escribe en disco local. Es deliberadamente la mas
 * simple que cumple el contrato, y el contrato es lo que importa: cambiarla
 * por S3 o MinIO es reemplazar este archivo, no tocar los modulos.
 *
 * La carga es REANUDABLE porque las evidencias viajan desde un telefono con
 * mala senal: el estado de cada carga se guarda junto al archivo, no en
 * memoria, para que sobreviva a un reinicio del servidor. Si el estado
 * viviera en memoria, "reanudable" seria mentira en cuanto el proceso
 * reiniciara.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ErrorDominio, ErrorNoEncontrado } from '../comun/errores.js';

const RAIZ = process.env['ALMACEN_OBJETOS_RAIZ'] ?? '/var/lib/servitotal/evidencias';
const CARPETA_PARCIALES = 'parciales';

export interface DescriptorDeCarga {
  readonly idCarga: string;
  readonly idOrden: string;
  readonly clave: string;
  readonly bytes: number;
  readonly huellaDigital: string;
}

export interface EstadoCarga extends DescriptorDeCarga {
  readonly bytesRecibidos: number;
  readonly completa: boolean;
}

const rutaParcial = (idCarga: string): string => path.join(RAIZ, CARPETA_PARCIALES, `${idCarga}.parte`);
const rutaDescriptor = (idCarga: string): string => path.join(RAIZ, CARPETA_PARCIALES, `${idCarga}.json`);

/** Ruta definitiva: una carpeta por orden, para que sea navegable a mano. */
function rutaFinal(idOrden: string, idCarga: string, clave: string): string {
  return path.join('ordenes', idOrden, `${clave}-${idCarga}`);
}

export async function iniciarCarga(descriptor: DescriptorDeCarga): Promise<EstadoCarga> {
  await mkdir(path.join(RAIZ, CARPETA_PARCIALES), { recursive: true });
  await writeFile(rutaDescriptor(descriptor.idCarga), JSON.stringify(descriptor), 'utf8');
  await writeFile(rutaParcial(descriptor.idCarga), '');
  return { ...descriptor, bytesRecibidos: 0, completa: false };
}

async function leerDescriptor(idCarga: string): Promise<DescriptorDeCarga> {
  try {
    return JSON.parse(await readFile(rutaDescriptor(idCarga), 'utf8')) as DescriptorDeCarga;
  } catch {
    throw new ErrorNoEncontrado(
      'No hay ninguna carga en curso con ese identificador. Vuelva a iniciarla desde el principio.',
    );
  }
}

async function bytesEnDisco(idCarga: string): Promise<number> {
  try {
    return (await stat(rutaParcial(idCarga))).size;
  } catch {
    return 0;
  }
}

export async function estadoDeCarga(idCarga: string): Promise<EstadoCarga> {
  const descriptor = await leerDescriptor(idCarga);
  const bytesRecibidos = await bytesEnDisco(idCarga);
  return { ...descriptor, bytesRecibidos, completa: bytesRecibidos >= descriptor.bytes };
}

/**
 * Agrega una parte al final de lo ya recibido.
 *
 * `desplazamiento` es donde el dispositivo cree que se quedo. Si no coincide
 * con lo que hay en disco, se rechaza en lugar de escribir: reanudar mal es
 * peor que no reanudar, porque produce un archivo corrupto que solo se
 * descubre al comparar la huella.
 */
export async function agregarParte(
  idCarga: string, desplazamiento: number, parte: Buffer,
): Promise<EstadoCarga> {
  const descriptor = await leerDescriptor(idCarga);
  const yaRecibidos = await bytesEnDisco(idCarga);

  if (desplazamiento !== yaRecibidos) {
    throw new ErrorDominio(
      'DESPLAZAMIENTO_INCORRECTO',
      `La parte enviada empieza en el byte ${desplazamiento} pero el servidor tiene ${yaRecibidos}. ` +
        `Reanude desde el byte ${yaRecibidos}.`,
    );
  }
  if (yaRecibidos + parte.length > descriptor.bytes) {
    throw new ErrorDominio(
      'CARGA_EXCEDIDA',
      `La evidencia iba a pesar ${descriptor.bytes} bytes y ya se enviaron mas. Reinicie la carga.`,
    );
  }

  await appendFile(rutaParcial(idCarga), parte);
  const bytesRecibidos = yaRecibidos + parte.length;
  return { ...descriptor, bytesRecibidos, completa: bytesRecibidos >= descriptor.bytes };
}

async function huellaDe(ruta: string): Promise<string> {
  const resumen = createHash('sha256');
  for await (const trozo of createReadStream(ruta)) resumen.update(trozo as Buffer);
  return resumen.digest('hex');
}

export interface ObjetoGuardado {
  readonly ruta: string;
  readonly huellaDigital: string;
  readonly bytes: number;
}

/**
 * Cierra la carga: comprueba tamano y huella antes de dar el archivo por
 * bueno. Una evidencia que no casa con su huella no sirve para reclamarle
 * nada a un fabricante, asi que se rechaza en lugar de guardarse a medias.
 */
export async function cerrarCarga(idCarga: string): Promise<ObjetoGuardado> {
  const descriptor = await leerDescriptor(idCarga);
  const bytesRecibidos = await bytesEnDisco(idCarga);

  if (bytesRecibidos !== descriptor.bytes) {
    throw new ErrorDominio(
      'CARGA_INCOMPLETA',
      `Faltan bytes por subir: se esperaban ${descriptor.bytes} y hay ${bytesRecibidos}.`,
    );
  }

  const huella = await huellaDe(rutaParcial(idCarga));
  if (huella.toLowerCase() !== descriptor.huellaDigital.toLowerCase()) {
    throw new ErrorDominio(
      'HUELLA_NO_COINCIDE',
      'El archivo que llego no coincide con la huella que anuncio el dispositivo. ' +
        'Se descarta y hay que volver a subirlo.',
    );
  }

  const relativa = rutaFinal(descriptor.idOrden, idCarga, descriptor.clave);
  const destino = path.join(RAIZ, relativa);
  await mkdir(path.dirname(destino), { recursive: true });
  await rename(rutaParcial(idCarga), destino);

  return { ruta: relativa, huellaDigital: huella, bytes: bytesRecibidos };
}
