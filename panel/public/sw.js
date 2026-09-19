/*
 * Trabajador de servicio: lo que hace que la aplicacion ABRA sin señal.
 *
 * Sin esto, todo lo demas es decorado. El tecnico puede tener la jornada
 * entera guardada en IndexedDB y la cola llena de trabajo, pero si al tocar
 * el icono el navegador intenta bajar el HTML y no hay red, lo que ve es la
 * pantalla del dinosaurio. Este archivo guarda el armazon —HTML, JavaScript,
 * estilos, tipografias— y lo sirve de la cache cuando la red no responde.
 *
 * NO precarga una lista de archivos con sus nombres: Vite les pone una
 * huella distinta en cada compilacion y esa lista quedaria vieja al primer
 * despliegue. Guarda lo que se va usando. Eso significa que el dispositivo
 * tiene que haber abierto la aplicacion CON SEÑAL al menos una vez, lo cual
 * no es una limitacion real: la jornada tambien hay que bajarla con señal
 * antes de salir del taller.
 *
 * Lo que NUNCA se guarda es `/api`. Una respuesta vieja del servidor
 * mostrada como si fuera de ahora es peor que un error: el tecnico creeria
 * que su trabajo subio. Lo que la aplicacion muestra sin red sale del
 * espejo local, que si sabe cuando se bajo.
 */

const CACHE = 'servitotal-armazon-v1';

self.addEventListener('install', (evento) => {
  // El documento raiz, para que la aplicacion arranque sin red. El resto
  // entra solo segun se use.
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/'])).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((nombre) => nombre !== CACHE).map((nombre) => caches.delete(nombre)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Lo que jamas se sirve de la cache. */
function esDelServidor(url) {
  return url.pathname.startsWith('/api');
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (esDelServidor(url)) return;

  /*
   * Una navegacion se resuelve SIEMPRE contra el documento raiz.
   *
   * Las rutas son del navegador, no del servidor: `/campo/ordenes/abc` no
   * es un archivo. Si el tecnico recarga estando en esa direccion y no hay
   * red, hay que devolverle el mismo HTML de siempre y dejar que React
   * decida que pintar.
   */
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone();
          void caches.open(CACHE).then((cache) => cache.put('/', copia));
          return respuesta;
        })
        .catch(() => caches.match('/').then(
          (guardada) => guardada ?? new Response(
            '<h1>ServiTotal</h1><p>Abra la aplicacion una vez con señal para poder usarla '
            + 'despues sin ella.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
          ),
        )),
    );
    return;
  }

  // Todo lo demas —JavaScript, estilos, tipografias— lleva huella en el
  // nombre, asi que lo guardado nunca esta desactualizado: si esta, sirve.
  evento.respondWith(
    caches.match(peticion).then((guardada) => {
      if (guardada !== undefined) return guardada;
      return fetch(peticion).then((respuesta) => {
        if (respuesta.ok && respuesta.type !== 'opaque') {
          const copia = respuesta.clone();
          void caches.open(CACHE).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      });
    }),
  );
});
