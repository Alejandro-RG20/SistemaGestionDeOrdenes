/**
 * Armado de la aplicacion: donde se conectan las piezas reales.
 *
 * Es el unico lugar que conoce a la vez expo-sqlite, el almacen seguro y la
 * red. Todo lo demas —las colas, el motor, el coordinador— habla contra
 * interfaces, que es lo que permite probarlas sin un dispositivo.
 */
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { ClienteHttp } from '../api/cliente.js';
import { SesionDelDispositivo } from '../api/sesion.js';
import { ColaSqlite, EvidenciasSqlite, prepararBaseLocal } from '../datos/almacen-sqlite.js';
import { EspejoSqlite } from '../datos/espejo.js';
import { ColaDeOperaciones } from '../sincronizacion/cola.js';
import { ColaDeEvidencias } from '../sincronizacion/cola-evidencias.js';
import { ConexionDelDispositivo } from '../sincronizacion/conexion.js';
import { archivosDelDispositivo } from '../sincronizacion/captura-evidencia.js';
import { MotorDeSincronizacion } from '../sincronizacion/motor.js';
import { Coordinador } from './coordinador.js';

/** Nombre del archivo local. Vive en el sandbox de la app. */
const BASE_LOCAL = 'servitotal.db';

export async function armarAplicacion(raizApi: string): Promise<Coordinador> {
  const base = await SQLite.openDatabaseAsync(BASE_LOCAL);
  await prepararBaseLocal(base);

  const sesion = new SesionDelDispositivo();
  const cliente = new ClienteHttp(raizApi, sesion);
  // El cliente se inyecta despues: la sesion lo necesita para refrescar y el
  // cliente necesita la sesion para firmar. Romper el ciclo aqui es mas
  // honesto que un singleton mutuo.
  sesion.usarCliente(cliente);

  const identificador = (): string => Crypto.randomUUID();
  const cola = new ColaDeOperaciones(new ColaSqlite(base), identificador);
  const evidencias = new ColaDeEvidencias(new EvidenciasSqlite(base), archivosDelDispositivo);
  const espejo = new EspejoSqlite(base);
  const motor = new MotorDeSincronizacion(
    cliente, cola, evidencias, new ConexionDelDispositivo(),
  );

  return new Coordinador(cliente, sesion, cola, evidencias, espejo, motor, identificador);
}
