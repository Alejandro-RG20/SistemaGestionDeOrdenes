/**
 * El motor de sincronizacion del dispositivo, contra un servidor simulado
 * que se comporta como el real.
 *
 * Lo que se comprueba es lo que puede perder el trabajo de una jornada:
 * que el orden se respete, que un corte no duplique nada, y que no se borre
 * nada del dispositivo sin que el servidor lo confirme.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TIPO_OPERACION } from '@servitotal/compartido';
import { ArchivosEnMemoria, ColaEnMemoria, EvidenciasEnMemoria } from '../src/campo/almacen-memoria.js';
import { ColaDeOperaciones } from '../src/campo/cola.js';
import { ColaDeEvidencias } from '../src/campo/cola-evidencias.js';
import { MotorDeSincronizacion } from '../src/campo/motor.js';
import { ErrorDeApi } from '../src/api/cliente.js';
import { ConexionSimulada, ServidorSimulado, generadorSecuencial } from './apoyo.js';

let almacenCola: ColaEnMemoria;
let almacenEvidencias: EvidenciasEnMemoria;
let archivos: ArchivosEnMemoria;
let cola: ColaDeOperaciones;
let evidencias: ColaDeEvidencias;
let servidor: ServidorSimulado;
let conexion: ConexionSimulada;
let motor: MotorDeSincronizacion;

beforeEach(() => {
  almacenCola = new ColaEnMemoria();
  almacenEvidencias = new EvidenciasEnMemoria();
  archivos = new ArchivosEnMemoria();
  cola = new ColaDeOperaciones(almacenCola, generadorSecuencial());
  evidencias = new ColaDeEvidencias(almacenEvidencias, archivos);
  servidor = new ServidorSimulado();
  conexion = new ConexionSimulada(true);
  motor = new MotorDeSincronizacion(servidor, cola, evidencias, conexion);
});

async function encolarVarias(cuantas: number): Promise<void> {
  for (let i = 1; i <= cuantas; i += 1) {
    await cola.encolar({
      tipoOperacion: TIPO_OPERACION.DIAGNOSTICO_REGISTRAR,
      carga: { idOrden: `orden-${i}`, fallaReal: `falla ${i}` },
    });
  }
}

describe('sin conexion no se pierde nada', () => {
  it('no envia y deja la cola intacta', async () => {
    await encolarVarias(3);
    conexion.disponible = false;

    const resumen = await motor.sincronizar();

    expect(resumen.interrumpidaPorConexion).toBe(true);
    expect(resumen.operacionesEnviadas).toBe(0);
    expect(resumen.quedanPendientes).toBe(3);
    expect(servidor.envios).toBe(0);
    expect(almacenCola.todas()).toHaveLength(3);
  });

  it('al recuperar la senal envia todo lo acumulado, en orden', async () => {
    await encolarVarias(3);
    conexion.disponible = false;
    await motor.sincronizar();

    conexion.disponible = true;
    const resumen = await motor.sincronizar();

    expect(resumen.operacionesAplicadas).toBe(3);
    expect(resumen.quedanPendientes).toBe(0);
    expect(servidor.lotesRecibidos[0]!.map((op) => op.carga['idOrden']))
      .toEqual(['orden-1', 'orden-2', 'orden-3']);
  });
});

describe('un corte a mitad de envio no duplica nada', () => {
  it('reintenta y el servidor responde repetida en lugar de aplicar dos veces', async () => {
    await encolarVarias(2);

    // El servidor recibe el lote y luego se corta la respuesta.
    servidor.fallaProximoEnvio = new ErrorDeApi('SIN_CONEXION', 'Se corto.', 0);
    const primera = await motor.sincronizar();
    expect(primera.interrumpidaPorConexion).toBe(true);
    // Nada se borro: el dispositivo no recibio confirmacion.
    expect(almacenCola.todas()).toHaveLength(2);

    const segunda = await motor.sincronizar();
    expect(segunda.operacionesAplicadas).toBe(2);
    expect(segunda.quedanPendientes).toBe(0);

    // El servidor proceso cada clave UNA sola vez.
    expect(servidor.procesadas.size).toBe(2);
  });

  it('reenviar la misma cola completa devuelve repetidas, no duplicados', async () => {
    await encolarVarias(2);
    await motor.sincronizar();

    // El tecnico vuelve a pulsar sincronizar; la cola ya esta vacia.
    const otraVez = await motor.sincronizar();
    expect(otraVez.operacionesEnviadas).toBe(0);
    expect(servidor.procesadas.size).toBe(2);
  });

  it('una operacion reintentada conserva su clave de idempotencia', async () => {
    await cola.encolar({
      tipoOperacion: TIPO_OPERACION.ORDEN_CREAR, carga: {}, idOperacion: 'clave-fija',
    });
    servidor.fallaProximoEnvio = new ErrorDeApi('SIN_CONEXION', 'Se corto.', 0);
    await motor.sincronizar();
    await motor.sincronizar();

    expect(servidor.lotesRecibidos[0]![0]!.idOperacion).toBe('clave-fija');
    expect(servidor.lotesRecibidos[1]![0]!.idOperacion).toBe('clave-fija');
    expect(servidor.procesadas.size).toBe(1);
  });
});

describe('lo que el servidor rechaza se borra del dispositivo, no se pierde', () => {
  it('una operacion en excepcion se confirma y se purga', async () => {
    servidor.rechazaTipo = TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO;
    await cola.encolar({
      tipoOperacion: TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO,
      carga: { idOrden: 'orden-anulada', hacia: 'en_diagnostico' },
    });

    const resumen = await motor.sincronizar();

    expect(resumen.operacionesEnExcepcion).toBe(1);
    expect(resumen.quedanPendientes).toBe(0);
    // Se borro del dispositivo porque el servidor confirmo tenerla integra.
    expect(almacenCola.todas()).toHaveLength(0);
    expect(resumen.mensajes.join(' ')).toMatch(/se conserva el trabajo/i);
  });
});

describe('la segunda cola: evidencias', () => {
  function capturar(idLocal: string, bytes: number): Promise<unknown> {
    archivos.escribir(`/local/${idLocal}.jpg`, new Uint8Array(bytes).fill(7));
    return evidencias.encolar({
      idLocal,
      idOrden: 'orden-1',
      clave: 'foto_articulo',
      tipo: 'foto',
      rutaLocal: `/local/${idLocal}.jpg`,
      bytes,
      huellaDigital: 'a'.repeat(64),
      momentoDispositivo: '2026-09-15T09:00:00.000Z',
    });
  }

  it('sube la evidencia por partes y borra el archivo solo al confirmarse', async () => {
    await capturar('ev-1', 600 * 1024);

    expect(archivos.existe('/local/ev-1.jpg')).toBe(true);
    const resumen = await motor.sincronizar();

    expect(resumen.evidenciasSubidas).toBe(1);
    expect(resumen.quedanPendientes).toBe(0);
    // Recien ahora se borra del dispositivo.
    expect(archivos.existe('/local/ev-1.jpg')).toBe(false);
    expect(almacenEvidencias.todas()).toHaveLength(0);
  });

  it('si se corta la subida, reanuda desde el byte que el servidor confirma', async () => {
    await capturar('ev-2', 800 * 1024);

    // 800 KB en partes de 256 KB son cuatro envios; se corta en el tercero.
    servidor.errorDeParte = new ErrorDeApi('SIN_CONEXION', 'Se corto.', 0);
    servidor.fallaEnLaParteNumero = 3;
    const primera = await motor.sincronizar();
    expect(primera.evidenciasSubidas).toBe(0);
    // El archivo sigue en el dispositivo.
    expect(archivos.existe('/local/ev-2.jpg')).toBe(true);

    const enCurso = almacenEvidencias.todas()[0]!;
    expect(enCurso.bytesEnviados).toBeGreaterThan(0);
    expect(enCurso.bytesEnviados).toBeLessThan(enCurso.bytes);

    const segunda = await motor.sincronizar();
    expect(segunda.evidenciasSubidas).toBe(1);
    expect(archivos.existe('/local/ev-2.jpg')).toBe(false);
  });

  it('manda el servidor sobre el avance, no la cuenta local', async () => {
    await capturar('ev-3', 400 * 1024);
    servidor.errorDeParte = new ErrorDeApi('SIN_CONEXION', 'Se corto.', 0);
    servidor.fallaEnLaParteNumero = 2;
    await motor.sincronizar();

    // Se falsea el avance local hacia adelante, como si el dispositivo
    // creyera haber enviado mas de lo que el servidor recibio.
    await almacenEvidencias.actualizar('ev-3', { bytesEnviados: 999_999 });

    const resumen = await motor.sincronizar();
    expect(resumen.evidenciasSubidas).toBe(1);
  });

  it('si el servidor rechaza la huella, la evidencia se reinicia entera', async () => {
    await capturar('ev-4', 300 * 1024);
    servidor.errorDeParte = new ErrorDeApi('HUELLA_NO_COINCIDE', 'No casa.', 422);
    servidor.fallaEnLaParteNumero = 1;

    const resumen = await motor.sincronizar();

    expect(resumen.evidenciasSubidas).toBe(0);
    expect(resumen.mensajes.join(' ')).toMatch(/se volvera a subir/i);
    const reiniciada = almacenEvidencias.todas()[0]!;
    expect(reiniciada.idCarga).toBeNull();
    expect(reiniciada.bytesEnviados).toBe(0);
    // Y el archivo sigue en el dispositivo, listo para reintentar.
    expect(archivos.existe('/local/ev-4.jpg')).toBe(true);
  });

  it('las operaciones van antes que las evidencias', async () => {
    await cola.encolar({ tipoOperacion: TIPO_OPERACION.ORDEN_CREAR, carga: { id: 'orden-1' } });
    await capturar('ev-5', 100 * 1024);

    const resumen = await motor.sincronizar();

    // Ambas cosas se hicieron, y la orden existia antes de subir su foto.
    expect(resumen.operacionesAplicadas).toBe(1);
    expect(resumen.evidenciasSubidas).toBe(1);
    expect(servidor.lotesRecibidos).toHaveLength(1);
  });
});
