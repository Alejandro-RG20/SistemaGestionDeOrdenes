/**
 * Captura de una evidencia en el dispositivo.
 *
 * Comprime ANTES de encolar: una foto de tableta pesa varios megas y por la
 * red del cliente no sube nunca. Se comprime una vez, al capturarla, y no
 * en cada reintento.
 *
 * La huella se calcula sobre el archivo YA COMPRIMIDO, que es el que va a
 * viajar: calcularla antes daria una huella que el servidor jamas podria
 * verificar.
 */
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import type { ColaDeEvidencias, EvidenciaCapturada } from './cola-evidencias.js';

/** Calidad de la compresion. Suficiente para que se lea una placa de serie. */
const CALIDAD = 0.6;
const ANCHO_MAXIMO = 1600;

export interface PeticionCaptura {
  readonly idLocal: string;
  readonly idOrden: string;
  readonly clave: string;
  readonly tipo: string;
  /** Archivo tal como lo dejo la camara. */
  readonly rutaOriginal: string;
  readonly latitud?: number | null;
  readonly longitud?: number | null;
}

/** Comprime una imagen; deja pasar lo que no lo sea. */
export async function comprimir(ruta: string, tipo: string): Promise<string> {
  if (tipo !== 'foto') return ruta;

  const resultado = await ImageManipulator.manipulateAsync(
    ruta,
    [{ resize: { width: ANCHO_MAXIMO } }],
    { compress: CALIDAD, format: ImageManipulator.SaveFormat.JPEG },
  );
  return resultado.uri;
}

/** Decodifica base64 a bytes. RN no trae Buffer. */
function aBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binario = globalThis.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function aHexadecimal(resumen: ArrayBuffer): string {
  return Array.from(new Uint8Array(resumen))
    .map((octeto) => octeto.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Huella del archivo, sobre los BYTES CRUDOS.
 *
 * El servidor calcula su SHA-256 leyendo el archivo que recibio
 * (`infraestructura/almacenamiento-objetos.ts`), asi que hay que hashear lo
 * mismo. Hashear la cadena base64 daria un valor que nunca casa, y el
 * resultado no seria un error visible sino un bucle: el servidor rechaza la
 * carga por huella, el motor la reinicia, y la evidencia no sube jamas.
 */
async function huellaYPeso(ruta: string): Promise<{ huellaDigital: string; bytes: number }> {
  const bytes = aBytes(await FileSystem.readAsStringAsync(ruta, {
    encoding: FileSystem.EncodingType.Base64,
  }));
  const resumen = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return { huellaDigital: aHexadecimal(resumen), bytes: bytes.length };
}

/**
 * Comprime y mide. Se usa desde la pantalla de captura, que despues decide
 * con que clave se encola.
 */
export async function prepararEvidencia(
  rutaOriginal: string, tipo: string,
): Promise<{ rutaLocal: string; bytes: number; huellaDigital: string }> {
  const rutaLocal = await comprimir(rutaOriginal, tipo);
  return { rutaLocal, ...(await huellaYPeso(rutaLocal)) };
}

/**
 * Comprime, calcula la huella y deja la evidencia en la segunda cola. A
 * partir de aqui existe aunque la aplicacion se cierre.
 */
export async function capturarEvidencia(
  cola: ColaDeEvidencias, peticion: PeticionCaptura,
): Promise<EvidenciaCapturada> {
  const preparada = await prepararEvidencia(peticion.rutaOriginal, peticion.tipo);

  const evidencia: EvidenciaCapturada = {
    idLocal: peticion.idLocal,
    idOrden: peticion.idOrden,
    clave: peticion.clave,
    tipo: peticion.tipo,
    rutaLocal: preparada.rutaLocal,
    bytes: preparada.bytes,
    huellaDigital: preparada.huellaDigital,
    momentoDispositivo: new Date().toISOString(),
    latitud: peticion.latitud ?? null,
    longitud: peticion.longitud ?? null,
  };

  await cola.encolar(evidencia);
  return evidencia;
}

/** Lector de archivos del dispositivo, para la subida por partes. */
export const archivosDelDispositivo = {
  async leerParte(ruta: string, desplazamiento: number, largo: number): Promise<Uint8Array> {
    return aBytes(await FileSystem.readAsStringAsync(ruta, {
      encoding: FileSystem.EncodingType.Base64,
      position: desplazamiento,
      length: largo,
    }));
  },

  async eliminar(ruta: string): Promise<void> {
    await FileSystem.deleteAsync(ruta, { idempotent: true });
  },
};
