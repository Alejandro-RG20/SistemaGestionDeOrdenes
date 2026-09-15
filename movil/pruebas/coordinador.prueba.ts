/**
 * El coordinador decide EN QUE ORDEN se escriben las cosas cuando el
 * tecnico registra algo sin senal. Esa decision es la que separa "se
 * guardo" de "se perdio", asi que se prueba.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ESTADO_ORDEN, TIPO_GARANTIA, TIPO_OPERACION,
  type JornadaDelDispositivo, type Sesion, type UsuarioAutenticado,
} from '@servitotal/compartido';
import type { AlmacenDeSesion } from '../src/api/sesion.js';
import {
  ArchivosEnMemoria, ColaEnMemoria, EspejoEnMemoria, EvidenciasEnMemoria,
} from '../src/datos/almacen-memoria.js';
import { Coordinador } from '../src/app/coordinador.js';
import { ColaDeOperaciones } from '../src/sincronizacion/cola.js';
import { ColaDeEvidencias } from '../src/sincronizacion/cola-evidencias.js';
import { MotorDeSincronizacion } from '../src/sincronizacion/motor.js';
import { ConexionSimulada, ServidorSimulado, generadorSecuencial } from './apoyo.js';

const USUARIO: UsuarioAutenticado = {
  id: 'usuario-1',
  nombreUsuario: 'jperez',
  nombres: 'Juan Perez',
  rol: 'tecnico_ruta',
  permisos: [],
} as unknown as UsuarioAutenticado;

/** Sesion de mentira: sin almacen seguro, que no existe fuera del dispositivo. */
class SesionSimulada implements AlmacenDeSesion {
  usuarioGuardado: UsuarioAutenticado | null = USUARIO;
  identificador: string | null = 'dispositivo-1';
  cerrada = false;

  async tokenAcceso(): Promise<string | null> { return 'token'; }
  async renovar(): Promise<string | null> { return 'token'; }
  async guardar(sesion: Sesion): Promise<void> { this.usuarioGuardado = sesion.usuario; }
  async usuario(): Promise<UsuarioAutenticado | null> { return this.usuarioGuardado; }
  async cerrar(): Promise<void> { this.cerrada = true; this.usuarioGuardado = null; }
  async identificadorDelDispositivo(): Promise<string | null> { return this.identificador; }
  async recordarDispositivo(identificador: string): Promise<void> { this.identificador = identificador; }
}

function jornadaConUnaOrden(): JornadaDelDispositivo {
  return {
    descargadaEn: '2026-09-15T13:00:00.000Z',
    idTecnico: 'tecnico-1',
    tecnico: 'Juan Perez',
    bodega: { id: 'bodega-1', nombre: 'Movil Juan Perez' },
    ordenes: [{
      id: 'orden-1',
      numero: 10001,
      estado: ESTADO_ORDEN.EN_RUTA,
      modalidad: 'ruta',
      tipoGarantia: TIPO_GARANTIA.PROVEEDOR,
      idCliente: 'cliente-1',
      cliente: 'Maria Lopez',
      idArticulo: 'articulo-1',
      articulo: 'LG Refrigeradora',
      fallaReportada: 'No enfria.',
      telefonoContacto: '88887777',
      direccionServicio: 'Distrito VI, de la rotonda 2c al sur',
      referenciaUbicacion: 'Porton verde',
      zona: 'Distrito VI',
      plazoVenceEn: '2026-09-16T20:00:00.000Z',
    }],
    repuestos: [
      { id: 'repuesto-1', codigo: 'RPT-00001', descripcion: 'Termostato', precio: 450 },
    ],
    existencias: [{ idRepuesto: 'repuesto-1', cantidad: 3 }],
    reglasEvidencia: [{
      clave: 'foto_articulo',
      etiqueta: 'Foto del articulo',
      tipo: TIPO_GARANTIA.PROVEEDOR,
      momento: 'diagnostico',
      tipoArchivo: 'foto',
      bloqueaAvance: true,
    }],
  };
}

describe('coordinador de la aplicacion', () => {
  let servidor: ServidorSimulado;
  let cola: ColaEnMemoria;
  let almacenEvidencias: EvidenciasEnMemoria;
  let espejo: EspejoEnMemoria;
  let sesion: SesionSimulada;
  let coordinador: Coordinador;

  beforeEach(async () => {
    servidor = new ServidorSimulado();
    servidor.jornada = jornadaConUnaOrden();
    cola = new ColaEnMemoria();
    almacenEvidencias = new EvidenciasEnMemoria();
    espejo = new EspejoEnMemoria();
    sesion = new SesionSimulada();

    const identificador = generadorSecuencial('id');
    const colaOperaciones = new ColaDeOperaciones(cola, identificador);
    const colaEvidencias = new ColaDeEvidencias(almacenEvidencias, new ArchivosEnMemoria());
    const motor = new MotorDeSincronizacion(
      servidor, colaOperaciones, colaEvidencias, new ConexionSimulada(),
    );

    coordinador = new Coordinador(
      servidor, sesion, colaOperaciones, colaEvidencias, espejo, motor, identificador,
    );
    await coordinador.descargarJornada();
  });

  it('la descarga deja el espejo listo para trabajar sin senal', async () => {
    const ordenes = await coordinador.misOrdenes();
    expect(ordenes).toHaveLength(1);
    expect(ordenes[0]?.numero).toBe(10001);

    const repuestos = await coordinador.repuestos();
    expect(repuestos[0]?.cantidad).toBe(3);
  });

  it('mover una orden la encola y ademas la muestra movida al instante', async () => {
    await coordinador.moverOrden('orden-1', ESTADO_ORDEN.EN_DIAGNOSTICO);

    // Lo que viaja al servidor.
    const encoladas = cola.todas();
    expect(encoladas).toHaveLength(1);
    expect(encoladas[0]?.tipoOperacion).toBe(TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO);

    // Y lo que el tecnico ve, sin esperar a tener senal.
    const orden = await coordinador.orden('orden-1');
    expect(orden?.estado).toBe(ESTADO_ORDEN.EN_DIAGNOSTICO);
  });

  it('el consumo descuenta de la bodega local y encola el precio firmado', async () => {
    await coordinador.consumirRepuesto('orden-1', 'repuesto-1', 2, 450);

    const repuestos = await coordinador.repuestos();
    expect(repuestos[0]?.cantidad).toBe(1);
    expect(cola.todas()[0]?.carga['precioUnitario']).toBe(450);
    expect(cola.todas()[0]?.carga['idBodegaOrigen']).toBe('bodega-1');
  });

  it('descargar mas de lo que hay se registra igual y el saldo local no queda negativo', async () => {
    // Pasa de verdad: se lo presto un companero, lo trae de otra orden.
    await coordinador.consumirRepuesto('orden-1', 'repuesto-1', 5, 450);

    expect(cola.todas()[0]?.carga['cantidad']).toBe(5);
    const repuestos = await coordinador.repuestos();
    expect(repuestos[0]?.cantidad).toBe(0);
  });

  it('sin bodega movil no deja registrar consumo, y lo dice', async () => {
    servidor.jornada = { ...jornadaConUnaOrden(), bodega: null };
    await coordinador.descargarJornada();

    await expect(coordinador.consumirRepuesto('orden-1', 'repuesto-1', 1, 450))
      .rejects.toThrow(/bodega movil/i);
    expect(cola.todas()).toHaveLength(0);
  });

  it('sin jornada descargada no deja registrar diagnostico: no sabe que tecnico es', async () => {
    const solo = new Coordinador(
      servidor, sesion,
      new ColaDeOperaciones(new ColaEnMemoria(), generadorSecuencial('x')),
      new ColaDeEvidencias(new EvidenciasEnMemoria(), new ArchivosEnMemoria()),
      new EspejoEnMemoria(),
      new MotorDeSincronizacion(
        servidor,
        new ColaDeOperaciones(new ColaEnMemoria(), generadorSecuencial('y')),
        new ColaDeEvidencias(new EvidenciasEnMemoria(), new ArchivosEnMemoria()),
        new ConexionSimulada(),
      ),
      generadorSecuencial('z'),
    );

    await expect(solo.registrarDiagnostico('orden-1', 'Compresor quemado'))
      .rejects.toThrow(/jornada/i);
  });

  it('la evidencia encola primero la ficha y despues el archivo', async () => {
    await coordinador.registrarEvidencia({
      idOrden: 'orden-1',
      clave: 'foto_articulo',
      tipo: 'foto',
      rutaLocal: '/tmp/foto.jpg',
      bytes: 1024,
      huellaDigital: 'abc',
    });

    // La ficha, por la cola de operaciones.
    expect(cola.todas()[0]?.tipoOperacion).toBe(TIPO_OPERACION.EVIDENCIA_REGISTRAR);
    // El archivo, por la segunda cola. Un binario sin ficha no se sabe de quien es.
    expect(await almacenEvidencias.contarPorEstado(['capturada'])).toBe(1);
  });

  it('cerrar sesion no toca la cola: el trabajo pendiente sigue en la tableta', async () => {
    await coordinador.moverOrden('orden-1', ESTADO_ORDEN.EN_DIAGNOSTICO);
    await coordinador.cerrarSesion();

    expect(sesion.cerrada).toBe(true);
    expect(cola.todas()).toHaveLength(1);
  });

  it('al volver al taller sube primero y baja despues', async () => {
    await coordinador.moverOrden('orden-1', ESTADO_ORDEN.EN_DIAGNOSTICO);
    const descargasAntes = servidor.descargas;

    await coordinador.sincronizarYDescargar();

    // Lo del dia llego al servidor...
    expect(servidor.procesadas.size).toBe(1);
    // ...y solo despues se pidio la jornada nueva.
    expect(servidor.descargas).toBe(descargasAntes + 1);
  });

  it('si no hay senal no se baja la jornada: pisaria el espejo con estados viejos', async () => {
    const sinSenal = new ConexionSimulada(false);
    const colaLocal = new ColaEnMemoria();
    const colaOperaciones = new ColaDeOperaciones(colaLocal, generadorSecuencial('s'));
    const otro = new Coordinador(
      servidor, sesion, colaOperaciones,
      new ColaDeEvidencias(new EvidenciasEnMemoria(), new ArchivosEnMemoria()),
      espejo,
      new MotorDeSincronizacion(
        servidor, colaOperaciones,
        new ColaDeEvidencias(new EvidenciasEnMemoria(), new ArchivosEnMemoria()),
        sinSenal,
      ),
      generadorSecuencial('t'),
    );

    await otro.moverOrden('orden-1', ESTADO_ORDEN.EN_DIAGNOSTICO);
    const descargasAntes = servidor.descargas;
    const resumen = await otro.sincronizarYDescargar();

    expect(resumen.interrumpidaPorConexion).toBe(true);
    expect(servidor.descargas).toBe(descargasAntes);
    // Y el estado que el tecnico vio sigue siendo el que el puso.
    expect((await espejo.orden('orden-1'))?.estado).toBe(ESTADO_ORDEN.EN_DIAGNOSTICO);
  });

  it('la evidencia exigida sale de la garantia de la orden', async () => {
    const orden = await coordinador.orden('orden-1');
    const reglas = await coordinador.evidenciaRequerida(orden!);
    expect(reglas.map((regla) => regla.clave)).toEqual(['foto_articulo']);
  });

  it('con garantia por validar se pide lo de particular, para no quedarse sin nada', async () => {
    const jornada = jornadaConUnaOrden();
    servidor.jornada = {
      ...jornada,
      ordenes: [{ ...jornada.ordenes[0]!, tipoGarantia: TIPO_GARANTIA.POR_VALIDAR }],
      reglasEvidencia: [{
        clave: 'foto_recepcion',
        etiqueta: 'Foto de recepcion',
        tipo: TIPO_GARANTIA.PARTICULAR,
        momento: 'recepcion',
        tipoArchivo: 'foto',
        bloqueaAvance: true,
      }],
    };
    await coordinador.descargarJornada();

    const orden = await coordinador.orden('orden-1');
    const reglas = await coordinador.evidenciaRequerida(orden!);
    expect(reglas.map((regla) => regla.clave)).toEqual(['foto_recepcion']);
  });
});
