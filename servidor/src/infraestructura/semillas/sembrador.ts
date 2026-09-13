/**
 * Orquestador de la siembra. Todos los pasos corren dentro de una unica
 * transaccion: o queda el juego de datos completo o no queda nada.
 */
import type { PoolClient } from 'pg';
import { Aleatorio, sumarDias } from './aleatorio.js';
import { bitacora } from '../../comun/bitacora.js';
import { enTransaccion } from '../conexion.js';
import { leerSemillaDatos } from '../../comun/configuracion.js';
import type { ContextoSiembra } from './contexto.js';
import { sembrarCatalogos } from './paso-catalogos.js';
import { sembrarSeguridad } from './paso-seguridad.js';
import { sembrarParametros } from './paso-parametros.js';
import { sembrarCoberturas } from './paso-coberturas.js';
import { sembrarInventarioBase } from './paso-inventario-base.js';
import { sembrarClientes } from './paso-clientes.js';
import { sembrarArticulos } from './paso-articulos.js';
import { sembrarOrdenes } from './paso-ordenes.js';
import { sembrarVisitas } from './paso-visitas.js';
import { sembrarDiagnosticos } from './paso-diagnosticos.js';
import { sembrarEvidencias } from './paso-evidencias.js';
import { sembrarMovimientos } from './paso-inventario-movimientos.js';
import { sembrarCobros } from './paso-cobros.js';
import { sembrarSincronizacion } from './paso-sincronizacion.js';

/** Orden inverso al de las dependencias: se vacia de las hojas a la raiz. */
const TABLAS_A_VACIAR = [
  'excepcion_sincronizacion', 'operacion_sincronizada', 'bitacora', 'nota_correccion',
  'expediente_cobro', 'pago', 'solicitud_repuesto', 'existencia', 'movimiento_repuesto',
  'evidencia', 'cotizacion', 'diagnostico_item', 'diagnostico', 'visita', 'evento_orden',
  'orden_servicio', 'cobertura', 'articulo', 'cliente_direccion', 'cliente_telefono', 'cliente',
  'checklist_item_plantilla', 'checklist_plantilla', 'regla_evidencia', 'dia_no_laborable',
  'calendario_laboral', 'regla_plazo', 'regla_cobertura', 'repuesto', 'bodega', 'dispositivo',
  'tecnico', 'usuario', 'rol_permiso', 'permiso', 'rol', 'zona', 'categoria_articulo',
  'tienda_origen', 'marca', 'centro',
] as const;

/** Ventana temporal que cubren los datos: los ultimos doce meses. */
function construirContexto(semilla: number, ahora: Date): ContextoSiembra {
  const azar = new Aleatorio(semilla);
  return {
    azar,
    idCentro: azar.uuid(),
    inicioVentana: sumarDias(ahora, -365),
    finVentana: ahora,
    zonas: [], marcas: [], tiendas: [], categorias: [],
    usuariosPorRol: new Map(), tecnicos: [], dispositivos: [],
    reglasCobertura: [], plantillas: [], bodegas: [],
    idBodegaCentral: azar.uuid(),
    idBodegaPiezasSustituidas: azar.uuid(),
    repuestos: [], clientes: [], articulos: [],
  };
}

export async function vaciarDatos(cliente: PoolClient): Promise<void> {
  await cliente.query(`TRUNCATE TABLE ${TABLAS_A_VACIAR.join(', ')} RESTART IDENTITY CASCADE`);
  await cliente.query('ALTER SEQUENCE orden_numero_seq RESTART');
}

export interface OpcionesSiembra {
  readonly semilla?: number;
  readonly ahora?: Date;
  readonly vaciar?: boolean;
}

export async function sembrar(opciones: OpcionesSiembra = {}): Promise<void> {
  const semilla = opciones.semilla ?? leerSemillaDatos();
  const contexto = construirContexto(semilla, opciones.ahora ?? new Date());
  const inicio = Date.now();

  await enTransaccion(async (cliente) => {
    if (opciones.vaciar !== false) await vaciarDatos(cliente);

    const pasos: readonly (readonly [string, () => Promise<unknown>])[] = [
      ['catalogos', () => sembrarCatalogos(cliente, contexto)],
      ['seguridad', () => sembrarSeguridad(cliente, contexto)],
      ['parametros de proceso', () => sembrarParametros(cliente, contexto)],
      ['reglas de cobertura', () => sembrarCoberturas(cliente, contexto)],
      ['bodegas y repuestos', () => sembrarInventarioBase(cliente, contexto)],
      ['clientes', () => sembrarClientes(cliente, contexto)],
      ['articulos', () => sembrarArticulos(cliente, contexto)],
    ];

    for (const [nombre, ejecutar] of pasos) {
      const marca = Date.now();
      await ejecutar();
      bitacora.informacion(`Sembrado: ${nombre}`, { duracionMs: Date.now() - marca });
    }

    const marcaOrdenes = Date.now();
    const ordenes = await sembrarOrdenes(cliente, contexto);
    bitacora.informacion('Sembrado: ordenes', {
      cantidad: ordenes.length, duracionMs: Date.now() - marcaOrdenes,
    });

    const derivados: readonly (readonly [string, () => Promise<unknown>])[] = [
      ['visitas', () => sembrarVisitas(cliente, contexto, ordenes)],
      ['diagnosticos y cotizaciones', () => sembrarDiagnosticos(cliente, contexto, ordenes)],
      ['evidencias', () => sembrarEvidencias(cliente, contexto, ordenes)],
      ['movimientos de inventario', () => sembrarMovimientos(cliente, contexto, ordenes)],
      ['pagos, expedientes y bitacora', () => sembrarCobros(cliente, contexto, ordenes)],
      ['rastro de sincronizacion', () => sembrarSincronizacion(cliente, contexto, ordenes)],
    ];

    for (const [nombre, ejecutar] of derivados) {
      const marca = Date.now();
      await ejecutar();
      bitacora.informacion(`Sembrado: ${nombre}`, { duracionMs: Date.now() - marca });
    }
  });

  // Fuera de la transaccion: el planificador necesita estadisticas frescas
  // o las consultas de la bandeja saldran con planes absurdos.
  await enTransaccion((cliente) => cliente.query('ANALYZE'));
  bitacora.informacion('Siembra completa', { semilla, duracionMs: Date.now() - inicio });
}
