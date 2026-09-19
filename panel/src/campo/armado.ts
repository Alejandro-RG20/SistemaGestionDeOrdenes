/**
 * Armado de la capa de campo: donde se conectan las piezas del navegador.
 *
 * Es el unico archivo que conoce IndexedDB. Las colas, el motor y el
 * coordinador hablan contra puertos, y por eso pasar de una aplicacion
 * nativa a la web no toco una sola regla de la cola: solo cambiaron los
 * adaptadores que se enchufan aqui.
 */
import { RAIZ_API, type ClienteApi } from '../api/cliente.js';
import {
  ArchivosIndexedDB, ColaIndexedDB, EvidenciasIndexedDB,
  abrirBaseLocal, pedirAlmacenamientoPersistente,
} from './almacen-indexeddb.js';
import { EspejoIndexedDB } from './espejo.js';
import { ColaDeOperaciones } from './cola.js';
import { ColaDeEvidencias } from './cola-evidencias.js';
import { ConexionDelNavegador } from './conexion.js';
import { MotorDeSincronizacion } from './motor.js';
import { Coordinador } from './coordinador.js';

export interface CampoArmado {
  readonly coordinador: Coordinador;
  readonly archivos: ArchivosIndexedDB;
  readonly colaEvidencias: ColaDeEvidencias;
  /** El navegador acepto no borrar el trabajo del dia para hacer sitio. */
  readonly almacenamientoPersistente: boolean;
}

/** UUID del navegador. En contexto seguro siempre esta; si no, se compone. */
function nuevoIdentificador(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Reserva para navegadores viejos o paginas servidas sin HTTPS. Sirve
  // igual como clave de idempotencia: lo que importa es que no se repita.
  const azar = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(azar).map((octeto) => octeto.toString(16).padStart(2, '0')).join('');
}

export async function armarCampo(cliente: ClienteApi): Promise<CampoArmado> {
  const base = await abrirBaseLocal();
  const almacenamientoPersistente = await pedirAlmacenamientoPersistente();

  const cola = new ColaDeOperaciones(new ColaIndexedDB(base), nuevoIdentificador);
  const archivos = new ArchivosIndexedDB(base);
  const colaEvidencias = new ColaDeEvidencias(new EvidenciasIndexedDB(base), archivos);
  const espejo = new EspejoIndexedDB(base);
  const motor = new MotorDeSincronizacion(
    cliente, cola, colaEvidencias, new ConexionDelNavegador(RAIZ_API),
  );

  return {
    coordinador: new Coordinador(cliente, cola, colaEvidencias, espejo, motor, nuevoIdentificador),
    archivos,
    colaEvidencias,
    almacenamientoPersistente,
  };
}
