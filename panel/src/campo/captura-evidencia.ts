/**
 * Captura de evidencia desde el navegador.
 *
 * SIN INSTALAR NADA. La foto entra por `<input type="file" capture>`, que
 * en un celular abre la camara directamente y en una laptop abre el
 * selector de archivos. Es la misma pantalla para los dos, que es justo lo
 * que se pidio: que no importe si el tecnico lleva celular o computadora.
 *
 * Se comprime ANTES de encolar, con un canvas. Una foto de celular pesa
 * varios megas y por la red de un barrio no sube nunca; comprimir una vez
 * al capturarla evita reintentar tres megas cada vez.
 *
 * La huella se calcula sobre el archivo YA COMPRIMIDO y sobre sus BYTES
 * CRUDOS, porque es lo que el servidor rehashea al cerrar la carga.
 * Calcularla sobre el original daria un valor que no casa nunca, y el
 * sintoma no seria un error visible sino un bucle: el servidor rechaza, el
 * motor reinicia, y la evidencia no sube jamas.
 */
import type { ArchivosIndexedDB } from './almacen-indexeddb.js';

/** Calidad de la compresion. Suficiente para que se lea una placa de serie. */
const CALIDAD = 0.6;
const ANCHO_MAXIMO = 1600;

/** Comprime una imagen con el canvas del navegador. */
export async function comprimir(archivo: File): Promise<Blob> {
  // Lo que no es imagen pasa tal cual: un PDF de factura no se redimensiona.
  if (!archivo.type.startsWith('image/')) return archivo;

  const mapa = await crearMapaDeBits(archivo);
  const escala = Math.min(1, ANCHO_MAXIMO / mapa.width);
  const ancho = Math.round(mapa.width * escala);
  const alto = Math.round(mapa.height * escala);

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const contexto = lienzo.getContext('2d');
  if (contexto === null) return archivo;
  contexto.drawImage(mapa, 0, 0, ancho, alto);

  const comprimida = await new Promise<Blob | null>((resolver) => {
    lienzo.toBlob(resolver, 'image/jpeg', CALIDAD);
  });
  // Si el navegador no pudo comprimir, se sube el original antes que nada.
  return comprimida ?? archivo;
}

async function crearMapaDeBits(archivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(archivo);
  // Navegadores viejos: se carga por URL temporal.
  const url = URL.createObjectURL(archivo);
  try {
    return await new Promise<HTMLImageElement>((resolver, rechazar) => {
      const imagen = new Image();
      imagen.onload = () => resolver(imagen);
      imagen.onerror = () => rechazar(new Error('No se pudo leer la imagen.'));
      imagen.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function aHexadecimal(resumen: ArrayBuffer): string {
  return Array.from(new Uint8Array(resumen))
    .map((octeto) => octeto.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA-256 sobre los bytes crudos, con la API del navegador.
 *
 * `crypto.subtle` solo existe en contextos seguros: HTTPS, o localhost. En
 * HTTP plano no esta, y por eso el servidor del centro tiene que servir el
 * panel por HTTPS si los tecnicos van a cargar evidencia desde la calle.
 */
async function huellaDe(contenido: Blob): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error(
      'Este navegador no puede calcular la huella de la evidencia porque la pagina no se '
      + 'esta sirviendo por HTTPS. Avise al taller: sin HTTPS no se puede cargar evidencia.',
    );
  }
  const resumen = await crypto.subtle.digest('SHA-256', await contenido.arrayBuffer());
  return aHexadecimal(resumen);
}

export interface PeticionCaptura {
  readonly idLocal: string;
  readonly idOrden: string;
  readonly clave: string;
  readonly tipo: string;
  readonly archivo: File;
  readonly latitud?: number | null;
  readonly longitud?: number | null;
}

/** Lo que queda listo para encolar, una vez comprimido y medido. */
export interface EvidenciaPreparada {
  readonly idOrden: string;
  readonly clave: string;
  readonly tipo: string;
  readonly rutaLocal: string;
  readonly bytes: number;
  readonly huellaDigital: string;
  readonly latitud: number | null;
  readonly longitud: number | null;
}

/**
 * Comprime, mide, calcula la huella y guarda el binario en el dispositivo.
 *
 * NO ENCOLA. Encolar es del coordinador, que es quien sabe que la ficha va
 * por la cola de operaciones antes que el archivo por la de cargas. Si esta
 * funcion encolara tambien, la evidencia entraria dos veces en la segunda
 * cola: una aqui y otra alli.
 */
export async function prepararEvidencia(
  archivos: ArchivosIndexedDB,
  peticion: PeticionCaptura,
): Promise<EvidenciaPreparada> {
  const comprimida = await comprimir(peticion.archivo);
  // La clave del binario es el identificador local: el resto del codigo
  // sigue hablando de «ruta» sin saber que aqui no hay disco.
  const rutaLocal = `evidencia/${peticion.idLocal}`;
  await archivos.guardarArchivo(rutaLocal, comprimida);

  return {
    idOrden: peticion.idOrden,
    clave: peticion.clave,
    tipo: peticion.tipo,
    rutaLocal,
    bytes: comprimida.size,
    huellaDigital: await huellaDe(comprimida),
    latitud: peticion.latitud ?? null,
    longitud: peticion.longitud ?? null,
  };
}

/** Cuanto se espera por el GPS antes de seguir sin el. */
const ESPERA_UBICACION_MS = 4000;

/**
 * La ubicacion se adjunta SI LLEGA RAPIDO, y si no, no.
 *
 * Bajo un techo de zinc el GPS puede tardar un minuto. Detener al tecnico
 * por una coordenada seria cambiar algo util —el registro— por algo
 * accesorio.
 */
export async function ubicacionSiLlegaRapido(): Promise<
{ latitud: number; longitud: number } | null
> {
  if (navigator.geolocation === undefined) return null;
  return new Promise((resolver) => {
    const temporizador = setTimeout(() => resolver(null), ESPERA_UBICACION_MS);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        clearTimeout(temporizador);
        resolver({ latitud: posicion.coords.latitude, longitud: posicion.coords.longitude });
      },
      () => { clearTimeout(temporizador); resolver(null); },
      { enableHighAccuracy: false, timeout: ESPERA_UBICACION_MS },
    );
  });
}
