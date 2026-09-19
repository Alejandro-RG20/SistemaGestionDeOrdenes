/**
 * El coordinador: el orden en que se escriben las cosas cuando el tecnico
 * registra trabajo sin señal.
 *
 * Todo lo que se comprueba aqui tiene el mismo peso: son las reglas que
 * deciden si el trabajo de una jornada llega al servidor o se pierde.
 *
 *   - PRIMERO LA COLA, DESPUES EL ESPEJO. La cola es la unica copia del
 *     trabajo; el espejo se vuelve a bajar.
 *   - La evidencia entra en DOS colas y en este orden: la ficha por la de
 *     operaciones, el archivo por la de cargas.
 *   - La identidad sale del espejo, no de memoria, porque en la web recargar
 *     la pagina destruye el objeto y la jornada sigue en IndexedDB.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ESTADO_ORDEN, MODALIDAD_SERVICIO, RESULTADO_VISITA, TIPO_GARANTIA, TIPO_OPERACION,
  type JornadaDelDispositivo,
} from '@servitotal/compartido';
import { ColaDeOperaciones } from '../src/campo/cola.js';
import { ColaDeEvidencias } from '../src/campo/cola-evidencias.js';
import { Coordinador } from '../src/campo/coordinador.js';
import { MotorDeSincronizacion } from '../src/campo/motor.js';
import {
  ArchivosEnMemoria, ColaEnMemoria, EvidenciasEnMemoria, EspejoEnMemoria,
} from '../src/campo/almacen-memoria.js';
import type { ClienteApi } from '../src/api/cliente.js';
import {
  ConexionSimulada, ServidorSimulado, generadorSecuencial, jornadaVacia,
} from './apoyo.js';

const JORNADA: JornadaDelDispositivo = {
  ...jornadaVacia(),
  idTecnico: 'tecnico-1',
  tecnico: 'R. Mejia',
  bodega: { id: 'bodega-1', nombre: 'Moto 4' },
  ordenes: [{
    id: 'orden-1',
    numero: 10482,
    estado: ESTADO_ORDEN.EN_RUTA,
    modalidad: MODALIDAD_SERVICIO.RUTA,
    tipoGarantia: TIPO_GARANTIA.PROVEEDOR,
    idCliente: 'cliente-1',
    cliente: 'Ana Munguia',
    idArticulo: 'articulo-1',
    articulo: 'Refrigeradora LG',
    fallaReportada: 'No enfria',
    telefonoContacto: '8845-2210',
    direccionServicio: 'Bo. Larreynaga',
    referenciaUbicacion: null,
    zona: 'Norte',
    plazoVenceEn: null,
    evidenciasRegistradas: [],
  }],
  repuestos: [{ id: 'rep-1', codigo: 'REF-GAS-001', descripcion: 'Gas R-600a', precio: 220 }],
  existencias: [{ idRepuesto: 'rep-1', cantidad: 4 }],
  reglasEvidencia: [
    {
      clave: 'foto_articulo',
      etiqueta: 'Fotografia del articulo',
      tipo: TIPO_GARANTIA.PROVEEDOR,
      momento: 'recepcion',
      tipoArchivo: 'foto',
      bloqueaAvance: true,
    },
    {
      clave: 'foto_falla',
      etiqueta: 'Fotografia del componente con la falla',
      tipo: TIPO_GARANTIA.PROVEEDOR,
      momento: 'diagnostico',
      tipoArchivo: 'foto',
      bloqueaAvance: true,
    },
    {
      clave: 'firma_cliente',
      etiqueta: 'Firma de conformidad',
      tipo: TIPO_GARANTIA.PROVEEDOR,
      momento: 'entrega',
      tipoArchivo: 'firma',
      bloqueaAvance: true,
    },
  ],
};

interface Armado {
  readonly coordinador: Coordinador;
  readonly cola: ColaDeOperaciones;
  readonly evidencias: ColaDeEvidencias;
  readonly espejo: EspejoEnMemoria;
  readonly servidor: ServidorSimulado;
}

function armar(): Armado {
  const servidor = new ServidorSimulado();
  servidor.jornada = JORNADA;

  const almacen = new ColaEnMemoria();
  const cola = new ColaDeOperaciones(almacen, generadorSecuencial());
  const archivos = new ArchivosEnMemoria();
  const evidencias = new ColaDeEvidencias(new EvidenciasEnMemoria(), archivos);
  const espejo = new EspejoEnMemoria();
  const motor = new MotorDeSincronizacion(servidor, cola, evidencias, new ConexionSimulada(true));

  const coordinador = new Coordinador(
    // El coordinador solo usa del cliente lo que `ClienteDeCampo` declara
    // mas la descarga de jornada; el simulador cubre ambas.
    servidor as unknown as ClienteApi,
    cola, evidencias, espejo, motor, generadorSecuencial('ev'),
  );
  return { coordinador, cola, evidencias, espejo, servidor };
}

describe('coordinador de campo', () => {
  let a: Armado;

  beforeEach(async () => {
    a = armar();
    await a.coordinador.descargarJornada();
  });

  it('mover una orden encola primero y despues refleja en el espejo', async () => {
    await a.coordinador.moverOrden('orden-1', ESTADO_ORDEN.EN_DIAGNOSTICO, 'Llegue a la casa.');

    const [fila] = await a.cola.siguienteLote();
    expect(fila?.tipoOperacion).toBe(TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO);
    expect(fila?.carga).toEqual({
      idOrden: 'orden-1', hacia: ESTADO_ORDEN.EN_DIAGNOSTICO, observacion: 'Llegue a la casa.',
    });
    expect((await a.espejo.orden('orden-1'))?.estado).toBe(ESTADO_ORDEN.EN_DIAGNOSTICO);
  });

  it('el diagnostico sale con el tecnico que dice el espejo', async () => {
    await a.coordinador.registrarDiagnostico('orden-1', 'Compresor con baja presion', 'Compresor');

    const [fila] = await a.cola.siguienteLote();
    expect(fila?.carga).toEqual({
      idOrden: 'orden-1',
      idTecnico: 'tecnico-1',
      fallaReal: 'Compresor con baja presion',
      componente: 'Compresor',
    });
  });

  /**
   * Sin jornada descargada no se sabe que tecnico es. Antes que mandar una
   * operacion sin autor —que termina en la bandeja de excepciones— se le
   * dice al tecnico lo unico que puede hacer al respecto.
   */
  it('sin jornada descargada el diagnostico se niega con una razon accionable', async () => {
    const limpio = armar();
    await expect(limpio.coordinador.registrarDiagnostico('orden-1', 'Lo que sea'))
      .rejects.toThrow(/descargado la jornada/);
    expect(await limpio.cola.pendientes()).toBe(0);
  });

  it('el traslado al taller son dos operaciones, y la visita va primero', async () => {
    await a.coordinador.trasladarAlTaller('orden-1', '2026-09-16T10:00:00.000Z', 'No cabe en la moto');

    const filas = await a.cola.siguienteLote();
    expect(filas.map((fila) => fila.tipoOperacion)).toEqual([
      TIPO_OPERACION.VISITA_REGISTRAR,
      TIPO_OPERACION.ORDEN_CAMBIAR_ESTADO,
    ]);
    expect((await a.espejo.orden('orden-1'))?.estado).toBe(ESTADO_ORDEN.EN_COLA_TALLER);
  });

  it('la visita normal no mueve la orden', async () => {
    await a.coordinador.registrarVisita(
      'orden-1', RESULTADO_VISITA.CLIENTE_AUSENTE, '2026-09-16T10:00:00.000Z', 'Nadie abrio',
    );
    expect((await a.espejo.orden('orden-1'))?.estado).toBe(ESTADO_ORDEN.EN_RUTA);
  });

  it('el consumo descuenta de la bodega movil y lleva el precio firmado', async () => {
    await a.coordinador.consumirRepuesto('orden-1', 'rep-1', 2, 220);

    const [fila] = await a.cola.siguienteLote();
    expect(fila?.carga).toEqual({
      idOrden: 'orden-1',
      idRepuesto: 'rep-1',
      idBodegaOrigen: 'bodega-1',
      cantidad: 2,
      precioUnitario: 220,
    });
    expect((await a.espejo.repuestos())[0]?.cantidad).toBe(2);
  });

  it('sin bodega movil el consumo se niega antes de encolar nada', async () => {
    const sinBodega = armar();
    sinBodega.servidor.jornada = { ...JORNADA, bodega: null };
    await sinBodega.coordinador.descargarJornada();

    await expect(sinBodega.coordinador.consumirRepuesto('orden-1', 'rep-1', 1, 220))
      .rejects.toThrow(/bodega movil/);
    expect(await sinBodega.cola.pendientes()).toBe(0);
  });

  it('la evidencia entra en las dos colas y queda anotada en el espejo', async () => {
    await a.coordinador.registrarEvidencia({
      idOrden: 'orden-1',
      clave: 'foto_articulo',
      tipo: 'foto',
      rutaLocal: 'evidencia/ev-1',
      bytes: 2048,
      huellaDigital: 'huella',
      latitud: 12.1,
      longitud: -86.2,
    });

    const [ficha] = await a.cola.siguienteLote();
    expect(ficha?.tipoOperacion).toBe(TIPO_OPERACION.EVIDENCIA_REGISTRAR);
    expect(await a.evidencias.pendientes()).toBe(1);

    // Y la lista de comprobacion la da por hecha aunque el archivo aun no
    // haya subido: para el tecnico ya esta tomada.
    expect((await a.espejo.orden('orden-1'))?.evidenciasRegistradas).toEqual(['foto_articulo']);
  });

  it('la orden levantada en el domicilio usa su id como clave de idempotencia', async () => {
    const idOrden = await a.coordinador.levantarOrdenEnCampo({
      idCliente: 'cliente-1',
      idArticulo: 'articulo-1',
      modalidad: MODALIDAD_SERVICIO.RUTA,
      fallaReportada: 'No enciende',
    });

    const [fila] = await a.cola.siguienteLote();
    // Reenviar no puede crear dos ordenes: la clave ES el identificador.
    expect(fila?.idOperacion).toBe(idOrden);
    expect(fila?.carga['id']).toBe(idOrden);
  });

  it('la cola pendiente se cuenta con nombre, incluida la evidencia', async () => {
    await a.coordinador.moverOrden('orden-1', ESTADO_ORDEN.EN_DIAGNOSTICO);
    await a.coordinador.registrarEvidencia({
      idOrden: 'orden-1',
      clave: 'foto_articulo',
      tipo: 'foto',
      rutaLocal: 'evidencia/ev-1',
      bytes: 2048,
      huellaDigital: 'huella',
    });

    const cola = await a.coordinador.colaPendiente();
    expect(cola).toHaveLength(3);
    // Cada fila dice de que orden es: «3 pendientes» a secas no le sirve al
    // tecnico para decidir si se va o se queda a buscar señal.
    expect(cola.every((fila) => fila.numeroOrden === 10482)).toBe(true);
    expect(cola.map((fila) => fila.descripcion)).toContain('Cambio de estado');
    expect(cola.map((fila) => fila.descripcion)).toContain('Evidencia: foto articulo');
  });

  /**
   * La lista de comprobacion se corta por DONDE ESTA LA ORDEN, no solo por
   * el tipo de garantia. Pedirle hoy al tecnico la firma de entrega —que
   * se recoge en el mostrador semanas despues— es lo que hace que deje de
   * leer la lista, y una lista que nadie lee no bloquea nada.
   */
  it('en ruta solo pide la evidencia de recepcion, no la de mas adelante', async () => {
    const orden = await a.coordinador.orden('orden-1');
    const reglas = await a.coordinador.evidenciaRequerida(orden!);
    expect(reglas.map((regla) => regla.clave)).toEqual(['foto_articulo']);
  });

  it('al entrar en diagnostico se suma su evidencia, sin perder la anterior', async () => {
    await a.coordinador.moverOrden('orden-1', ESTADO_ORDEN.EN_DIAGNOSTICO);
    const orden = await a.coordinador.orden('orden-1');
    const reglas = await a.coordinador.evidenciaRequerida(orden!);
    // Acumulativa: lo de recepcion se sigue debiendo.
    expect(reglas.map((regla) => regla.clave)).toEqual(['foto_articulo', 'foto_falla']);
    // Y la entrega sigue fuera: esa no es de la tableta.
    expect(reglas.map((regla) => regla.clave)).not.toContain('firma_cliente');
  });

  /**
   * Volver al taller: primero sube lo del dia y solo despues baja lo nuevo.
   * Al reves, la descarga pisaria el espejo con estados viejos y el tecnico
   * veria retroceder ordenes que el mismo movio.
   */
  it('sincronizar y descargar deja el espejo con lo que el servidor ya sabe', async () => {
    await a.coordinador.moverOrden('orden-1', ESTADO_ORDEN.EN_DIAGNOSTICO);
    await a.coordinador.sincronizarYDescargar();

    expect(a.servidor.envios).toBeGreaterThan(0);
    expect(a.servidor.descargas).toBe(2);
    expect(await a.cola.pendientes()).toBe(0);
  });
});
