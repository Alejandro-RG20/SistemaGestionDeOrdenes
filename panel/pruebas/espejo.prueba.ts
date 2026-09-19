/**
 * El espejo sobre IndexedDB, probado contra IndexedDB de verdad (una
 * implementacion en memoria del mismo API, no un doble escrito por
 * nosotros).
 *
 * Se prueba aqui, y no sobre el espejo en memoria, porque lo que puede
 * fallar es justo lo que el doble no tiene: que reemplazar la jornada sea
 * una escritura y no cuatro, que un registro guardado por una version vieja
 * de la aplicacion no rompa la lectura, y que los ajustes locales
 * sobrevivan a cerrar la pestaña.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ESTADO_ORDEN, MODALIDAD_SERVICIO, TIPO_GARANTIA,
  type JornadaDelDispositivo, type OrdenDeJornada,
} from '@servitotal/compartido';
import { EspejoIndexedDB } from '../src/campo/espejo.js';
import { baseLimpia } from './apoyo-navegador.js';

function orden(parcial: Partial<OrdenDeJornada> = {}): OrdenDeJornada {
  return {
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
    ...parcial,
  };
}

function jornada(parcial: Partial<JornadaDelDispositivo> = {}): JornadaDelDispositivo {
  return {
    descargadaEn: '2026-09-16T13:05:00.000Z',
    idTecnico: 'tecnico-1',
    tecnico: 'R. Mejia',
    bodega: { id: 'bodega-1', nombre: 'Moto 4' },
    ordenes: [orden()],
    repuestos: [
      { id: 'rep-1', codigo: 'REF-CMP-003', descripcion: 'Compresor 1/3 HP', precio: 4850 },
      { id: 'rep-2', codigo: 'REF-GAS-001', descripcion: 'Gas R-600a', precio: 220 },
    ],
    existencias: [{ idRepuesto: 'rep-2', cantidad: 4 }],
    reglasEvidencia: [
      {
        clave: 'foto_articulo',
        etiqueta: 'Fotografia del articulo',
        tipo: TIPO_GARANTIA.PROVEEDOR,
        momento: 'diagnostico',
        tipoArchivo: 'foto',
        bloqueaAvance: true,
      },
      {
        clave: 'foto_recepcion',
        etiqueta: 'Fotografia de recepcion',
        tipo: TIPO_GARANTIA.PARTICULAR,
        momento: 'recepcion',
        tipoArchivo: 'foto',
        bloqueaAvance: false,
      },
    ],
    ...parcial,
  };
}

describe('espejo sobre IndexedDB', () => {
  let espejo: EspejoIndexedDB;

  beforeEach(async () => {
    // Base nueva por prueba: el estado de una no puede filtrarse a otra.
    espejo = new EspejoIndexedDB(await baseLimpia());
  });

  it('sin jornada descargada no inventa nada', async () => {
    expect(await espejo.ordenes()).toEqual([]);
    expect(await espejo.repuestos()).toEqual([]);
    expect(await espejo.descargadaEn()).toBeNull();
    expect(await espejo.identidad()).toEqual({ idTecnico: null, idBodega: null });
  });

  it('guarda la identidad, que es lo que la app necesita tras recargar la pagina', async () => {
    await espejo.reemplazar(jornada());
    expect(await espejo.identidad()).toEqual({ idTecnico: 'tecnico-1', idBodega: 'bodega-1' });
  });

  it('aplica el estado cambiado sin conexion sobre lo descargado', async () => {
    await espejo.reemplazar(jornada());
    await espejo.cambiarEstadoLocal('orden-1', ESTADO_ORDEN.EN_DIAGNOSTICO);

    const [guardada] = await espejo.ordenes();
    expect(guardada?.estado).toBe(ESTADO_ORDEN.EN_DIAGNOSTICO);
    // Y por el atajo de una sola orden, que es el que usan las pantallas.
    expect((await espejo.orden('orden-1'))?.estado).toBe(ESTADO_ORDEN.EN_DIAGNOSTICO);
  });

  it('descuenta el consumo local y nunca deja la existencia negativa', async () => {
    await espejo.reemplazar(jornada());
    await espejo.descontarExistencia('rep-2', 3);
    expect((await espejo.repuestos()).find((r) => r.id === 'rep-2')?.cantidad).toBe(1);

    // El tecnico pone una pieza que su bodega no registraba: pasa, y el
    // servidor lo concilia. Lo que no puede es mostrarsele «-2».
    await espejo.descontarExistencia('rep-2', 9);
    expect((await espejo.repuestos()).find((r) => r.id === 'rep-2')?.cantidad).toBe(0);
  });

  it('una pieza que no viene en las existencias cuenta como cero, no como ausente', async () => {
    await espejo.reemplazar(jornada());
    const compresor = (await espejo.repuestos()).find((r) => r.id === 'rep-1');
    expect(compresor).toBeDefined();
    expect(compresor?.cantidad).toBe(0);
  });

  it('suma la evidencia capturada sin señal a la que ya traia el servidor', async () => {
    await espejo.reemplazar(jornada({
      ordenes: [orden({ evidenciasRegistradas: ['foto_articulo'] })],
    }));
    await espejo.anotarEvidenciaLocal('orden-1', 'foto_serie');

    const guardada = await espejo.orden('orden-1');
    expect(guardada?.evidenciasRegistradas).toEqual(['foto_articulo', 'foto_serie']);
  });

  it('no repite una clave anotada dos veces', async () => {
    await espejo.reemplazar(jornada());
    await espejo.anotarEvidenciaLocal('orden-1', 'foto_serie');
    await espejo.anotarEvidenciaLocal('orden-1', 'foto_serie');

    expect((await espejo.orden('orden-1'))?.evidenciasRegistradas).toEqual(['foto_serie']);
  });

  it('filtra las reglas de evidencia por el tipo de garantia', async () => {
    await espejo.reemplazar(jornada());
    const deProveedor = await espejo.reglasEvidencia(TIPO_GARANTIA.PROVEEDOR);
    expect(deProveedor.map((regla) => regla.clave)).toEqual(['foto_articulo']);
  });

  /**
   * Esta es la que justifica el diseño: la jornada se reemplaza ENTERA.
   * Los ajustes locales se van con ella porque lo que baja del servidor ya
   * los incluye si la cola llego a subir, y si no llego, la cola sigue
   * intacta. La cola es la copia del trabajo; el espejo, una comodidad.
   */
  it('reemplazar borra los ajustes locales junto con lo anterior', async () => {
    await espejo.reemplazar(jornada());
    await espejo.cambiarEstadoLocal('orden-1', ESTADO_ORDEN.EN_REPARACION);
    await espejo.descontarExistencia('rep-2', 2);
    await espejo.anotarEvidenciaLocal('orden-1', 'foto_serie');

    await espejo.reemplazar(jornada({ descargadaEn: '2026-09-16T18:00:00.000Z' }));

    const guardada = await espejo.orden('orden-1');
    expect(guardada?.estado).toBe(ESTADO_ORDEN.EN_RUTA);
    expect(guardada?.evidenciasRegistradas).toEqual([]);
    expect((await espejo.repuestos()).find((r) => r.id === 'rep-2')?.cantidad).toBe(4);
    expect(await espejo.descargadaEn()).toBe('2026-09-16T18:00:00.000Z');
  });

  it('anotar sobre una orden que no esta en el espejo no rompe nada', async () => {
    await espejo.reemplazar(jornada());
    await espejo.anotarEvidenciaLocal('orden-inexistente', 'foto_serie');
    await espejo.cambiarEstadoLocal('orden-inexistente', ESTADO_ORDEN.FINALIZADA);
    expect((await espejo.ordenes()).length).toBe(1);
  });
});
