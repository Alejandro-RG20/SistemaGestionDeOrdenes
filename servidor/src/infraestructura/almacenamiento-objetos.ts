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
import { appendFile, mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorDominio, ErrorNoEncontrado } from '../comun/errores.js';

/**
 * Donde viven los archivos de evidencia.
 *
 * Una ruta relativa se resuelve contra la RAIZ DEL REPOSITORIO, no contra el
 * directorio desde el que se arranco. Si dependiera del directorio actual,
 * `npm run desarrollo` y `npm run desarrollo --workspace servidor` dejarian
 * las evidencias en carpetas distintas, y la mitad de las cargas no se
 * encontrarian despues sin que nadie entendiera por que.
 */
function raizDeObjetos(): string {
  const configurada = process.env['ALMACEN_OBJETOS_RAIZ'] ?? './datos/evidencias';
  if (path.isAbsolute(configurada)) return configurada;
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  // infraestructura/ -> src/ -> servidor/ -> raiz del repositorio
  return path.resolve(aqui, '..', '..', '..', configurada);
}

const RAIZ = raizDeObjetos();
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

  // La primera parte trae la firma del formato: se rechaza ahi mismo lo que
  // no es imagen ni PDF, sin esperar a que suba el archivo entero.
  if (yaRecibidos === 0 && parte.length >= 12 && formatoDe(parte.subarray(0, 16)) === null) {
    throw new ErrorDominio(
      'ARCHIVO_NO_ADMITIDO',
      'El archivo no es una imagen (JPEG, PNG, WEBP, HEIC) ni un PDF. No se guardo.',
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

async function primerosBytes(ruta: string, cuantos: number): Promise<Buffer> {
  const archivo = await open(ruta, 'r');
  try {
    const bufer = Buffer.alloc(cuantos);
    const { bytesRead } = await archivo.read(bufer, 0, cuantos, 0);
    return bufer.subarray(0, bytesRead);
  } finally {
    await archivo.close();
  }
}

export type FormatoDeEvidencia = 'jpeg' | 'png' | 'webp' | 'heic' | 'pdf';

/** Reconoce el formato por su firma de bytes. Nulo si no es uno admitido. */
export function formatoDe(cabecera: Buffer): FormatoDeEvidencia | null {
  const empieza = (...bytes: number[]): boolean => bytes.every((b, i) => cabecera[i] === b);
  if (empieza(0xff, 0xd8, 0xff)) return 'jpeg';
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (cabecera.subarray(0, 4).toString('latin1') === 'RIFF'
    && cabecera.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (cabecera.subarray(4, 8).toString('latin1') === 'ftyp'
    && ['heic', 'heix', 'mif1', 'msf1', 'heif'].includes(cabecera.subarray(8, 12).toString('latin1'))) {
    return 'heic';
  }
  if (cabecera.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return null;
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

  /*
   * EL CONTENIDO TIENE QUE SER LO QUE DICE SER.
   *
   * La huella prueba que llego lo que se mando, no que lo mandado sea una
   * fotografia. Se miran los primeros bytes —la firma del formato, que no
   * depende del nombre ni de lo que declare el navegador— y solo se admiten
   * imagenes y PDF. Un ejecutable renombrado a .jpg no entra al expediente.
   */
  const formato = formatoDe(await primerosBytes(rutaParcial(idCarga), 16));
  if (formato === null) {
    throw new ErrorDominio(
      'ARCHIVO_NO_ADMITIDO',
      'El archivo no es una imagen (JPEG, PNG, WEBP, HEIC) ni un PDF. No se guardo: '
        + 'adjunte la fotografia o el documento original.',
    );
  }

  const relativa = rutaFinal(descriptor.idOrden, idCarga, descriptor.clave);
  const destino = path.join(RAIZ, relativa);
  await mkdir(path.dirname(destino), { recursive: true });
  await rename(rutaParcial(idCarga), destino);

  return { ruta: relativa, huellaDigital: huella, bytes: bytesRecibidos };
}
