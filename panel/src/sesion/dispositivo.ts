/**
 * Identidad del navegador como DISPOSITIVO.
 *
 * El pliego exige poder revocar a distancia el acceso de un dispositivo de
 * campo (RF-05): una tableta que se pierde deja de sincronizar esa misma
 * tarde, sin esperar a cambiar contraseñas. Esa regla no desaparece porque
 * el sistema pase a ser web — lo que cambia es que el dispositivo ya no es
 * una tableta con una aplicacion instalada, sino ESTE NAVEGADOR, EN ESTE
 * TELEFONO.
 *
 * Por eso el navegador se identifica con una cadena estable que se guarda
 * aqui y que la jefatura vincula una sola vez desde Administracion. Sin
 * vincular no se sincroniza, igual que antes.
 *
 * DOS COSAS QUE NO SON ACCIDENTALES:
 *
 *  - El identificador se genera en el dispositivo, no en el servidor. Asi
 *    el tecnico puede leerselo a la jefatura por telefono antes de que
 *    exista ninguna sesion atada.
 *  - Vive en `localStorage`, no en la base local de campo. Si un dia hay
 *    que vaciar IndexedDB para recuperar la aplicacion, el dispositivo
 *    sigue siendo el mismo y no hay que volver a vincularlo.
 *
 * NO ES UN SECRETO y no pretende serlo: cualquiera que abra las
 * herramientas del navegador lo ve. Lo que protege no es el identificador
 * sino la vinculacion, que solo la jefatura puede hacer y deshacer.
 */

const CLAVE = 'servitotal.dispositivo';

function nuevoIdentificador(): string {
  const azar = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((octeto) => octeto.toString(16).padStart(2, '0')).join('');
  // El prefijo es para quien lo lee en la tabla de Administracion: dice de
  // un vistazo que es un navegador y no una tableta con la aplicacion.
  return `web-${azar}`;
}

/**
 * El identificador de este navegador, creandolo la primera vez.
 *
 * Si `localStorage` no esta disponible —modo privado de algunos
 * navegadores, almacenamiento bloqueado— se devuelve `null` en vez de
 * inventar uno nuevo en cada carga: un identificador distinto cada vez
 * llenaria la tabla de dispositivos de basura y no se podria vincular
 * ninguno.
 */
export function identificadorDeEsteDispositivo(): string | null {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado !== null && guardado !== '') return guardado;
    const nuevo = nuevoIdentificador();
    localStorage.setItem(CLAVE, nuevo);
    return nuevo;
  } catch {
    return null;
  }
}
