/**
 * Paso 14: proveedores, compras, validacion tecnica y entregas.
 *
 * Los cuatro cierran el proceso que el pliego describe y que hasta aqui
 * quedaba a medias: quien surte la pieza, quien revisa el trabajo antes de
 * darlo por bueno, y a quien se le puso el equipo en las manos.
 *
 * Nada de esto se siembra «bonito». Hay compras canceladas, recepciones a
 * medias y reparaciones rechazadas, porque una base de datos donde todo
 * salio bien no sirve para probar las pantallas que existen precisamente
 * para lo que sale mal.
 */
import type { PoolClient } from 'pg';
import { CODIGO_ROL, ESTADO_ORDEN } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { sumarDias } from './aleatorio.js';
import { usuariosDe, type ContextoSiembra } from './contexto.js';
import type { ResumenOrden } from './paso-ordenes.js';

/** Proveedores reales del rubro, con nombre cambiado. */
const PROVEEDORES: readonly (readonly [
  codigo: string, nombre: string, contacto: string, atiendeGarantias: boolean,
])[] = [
  ['PRV-001', 'Repuestos Centroamericanos S.A.', 'Ventas corporativas', false],
  ['PRV-002', 'Distribuidora Electrofrio', 'Mostrador mayoreo', false],
  ['PRV-003', 'Importaciones Tecnicas del Pacifico', 'Departamento de pedidos', false],
  ['PRV-004', 'LG Servicio Autorizado Centroamerica', 'Garantias regionales', true],
  ['PRV-005', 'Samsung Post Venta CA', 'Reclamos de garantia', true],
  ['PRV-006', 'Whirlpool Service Partners', 'Atencion a talleres', true],
  ['PRV-007', 'Suministros Electricos del Norte', 'Bodega central', false],
  ['PRV-008', 'Mabe Servicio Tecnico', 'Garantias', true],
];

const TOTAL_COMPRAS = 48;

/**
 * Como se reparten las compras. Son CANTIDADES EXACTAS, no porcentajes que
 * se sortean.
 *
 * Sortear por porcentaje parece equivalente y no lo es: con 48 compras y un
 * 5 % de canceladas, hay casi una posibilidad entre doce de que no salga
 * ninguna, y entonces la pantalla de compras canceladas no tiene nada que
 * mostrar y nadie se entera hasta que un usuario la abre. Una siembra debe
 * producir siempre el mismo juego de casos, incluidos los raros.
 */
const REPARTO_ESTADO: readonly (readonly [estado: string, cuantas: number])[] = [
  ['recibida', 26],
  ['recibida_parcial', 5],
  ['confirmada', 6],
  ['enviada', 6],
  ['borrador', 3],
  ['cancelada', 2],
];

const MOTIVOS_CANCELACION = [
  'El proveedor descontinuo la pieza y no ofrecio equivalente.',
  'El cliente retiro el equipo sin reparar; la compra quedo sin destino.',
  'Se consiguio la pieza en plaza a mejor precio y tiempo.',
];

const OBSERVACIONES_VALIDACION: readonly (readonly [aprobada: boolean, texto: string])[] = [
  [true, 'Diagnostico coherente con la falla reportada; evidencia completa y reparacion probada.'],
  [true, 'Mediciones dentro de rango tras la sustitucion. Repuestos declarados coinciden con el consumo.'],
  [true, 'Trabajo conforme. La fotografia de la pieza retirada sustenta el reclamo al proveedor.'],
  [false, 'Falta la fotografia de la pieza sustituida; sin ella el proveedor rechaza el expediente.'],
  [false, 'El diagnostico no explica por que se cambio el compresor. Ampliar antes de cerrar.'],
  [false, 'El consumo declarado no coincide con lo despachado a la bodega movil. Revisar.'],
];

const RELACION_CON_EL_CLIENTE = [
  'Hijo del titular', 'Esposa del titular', 'Vecino autorizado', 'Empleado del negocio',
];

export async function sembrarComprasYEntregas(
  cliente: PoolClient,
  contexto: ContextoSiembra,
  ordenes: readonly ResumenOrden[],
): Promise<void> {
  const { azar } = contexto;
  const jefesCompras = usuariosDe(contexto, CODIGO_ROL.JEFE_COMPRAS);
  const bodegueros = usuariosDe(contexto, CODIGO_ROL.BODEGUERO);
  const jefesTecnicos = usuariosDe(contexto, CODIGO_ROL.JEFE_TECNICOS);
  const mostrador = [
    ...usuariosDe(contexto, CODIGO_ROL.AGENTE_TELEFONIA),
    ...usuariosDe(contexto, CODIGO_ROL.USUARIO_TIENDA),
  ];

  // ── proveedores ──
  const proveedores = PROVEEDORES.map(([codigo, nombre, contacto, atiendeGarantias]) => ({
    id: azar.uuid(), codigo, nombre, contacto, atiendeGarantias,
  }));
  await copiarFilas(
    cliente,
    'proveedor',
    ['id', 'codigo', 'nombre', 'contacto', 'telefono', 'correo', 'direccion',
      'atiende_garantias', 'activo', 'creado_por'],
    proveedores.map((proveedor) => [
      proveedor.id, proveedor.codigo, proveedor.nombre, proveedor.contacto,
      `2${azar.entero(200, 299)}-${azar.entero(1000, 9999)}`,
      `pedidos@${proveedor.codigo.toLowerCase()}-ejemplo.com`,
      'Managua, Nicaragua',
      proveedor.atiendeGarantias, true,
      jefesCompras[0]?.id ?? null,
    ]),
  );

  // ── compras ──
  const bolsaDeEstados: string[] = [];
  for (const [estado, cuantas] of REPARTO_ESTADO) {
    for (let i = 0; i < cuantas; i += 1) bolsaDeEstados.push(estado);
  }
  // Se barajan para que no queden agrupadas por estado en la lista, pero la
  // baraja es la del generador sembrado: dos siembras dan lo mismo.
  const estados = azar.barajar(bolsaDeEstados);

  const filasCompra: unknown[][] = [];
  const filasDetalle: unknown[][] = [];

  for (let i = 0; i < TOTAL_COMPRAS; i += 1) {
    const idCompra = azar.uuid();
    const estado = estados[i]!;
    const proveedor = azar.elegir(proveedores);
    // Repartidas a lo largo del año, con las recientes todavia en camino.
    const fechaPedido = sumarDias(contexto.finVentana, -azar.entero(1, 330));
    const lineas = azar.entero(1, 5);
    const elegidos = new Set<string>();
    let total = 0;

    for (let linea = 0; linea < lineas; linea += 1) {
      const repuesto = azar.elegir(contexto.repuestos);
      // La restriccion de unicidad no admite el mismo repuesto dos veces en
      // una compra: si sale repetido, esa linea simplemente no va.
      if (elegidos.has(repuesto.id)) continue;
      elegidos.add(repuesto.id);

      const cantidad = azar.entero(1, 12);
      const precioUnitario = Number((repuesto.precio * azar.decimal(0.55, 0.75)).toFixed(2));
      total += cantidad * precioUnitario;

      const recibida = estado === 'recibida'
        ? cantidad
        : estado === 'recibida_parcial'
          ? azar.entero(1, Math.max(1, cantidad - 1))
          : 0;

      filasDetalle.push([
        azar.uuid(), idCompra, repuesto.id, cantidad, recibida, precioUnitario, null,
      ]);
    }

    filasCompra.push([
      idCompra, proveedor.id, estado, fechaPedido,
      // Lo importado tarda; lo local llega en la semana.
      sumarDias(fechaPedido, azar.entero(5, 45)),
      Number(total.toFixed(2)),
      null,
      estado === 'cancelada' ? azar.elegir(MOTIVOS_CANCELACION) : null,
      fechaPedido,
      azar.elegir(jefesCompras)?.id ?? null,
    ]);
  }

  await copiarFilas(
    cliente,
    'compra',
    ['id', 'id_proveedor', 'estado', 'fecha_pedido', 'fecha_estimada', 'total',
      'observacion', 'motivo_cancelacion', 'creado_en', 'creado_por'],
    filasCompra as never,
  );
  await copiarFilas(
    cliente,
    'compra_detalle',
    ['id', 'id_compra', 'id_repuesto', 'cantidad', 'cantidad_recibida', 'precio_unitario',
      'id_solicitud'],
    filasDetalle as never,
  );

  // ── validacion tecnica y entregas ──
  const filasValidacion: unknown[][] = [];
  const filasEntrega: unknown[][] = [];

  const REVISADAS: readonly EstadoRevisable[] = [ESTADO_ORDEN.FINALIZADA, ESTADO_ORDEN.ENTREGADA];

  for (const orden of ordenes) {
    if (!REVISADAS.includes(orden.estadoFinal as EstadoRevisable)) continue;
    const momentoCierre = orden.momentos.at(-1)!;
    // El jefe de tecnicos nunca es tecnico, asi que el disparador que
    // impide validarse a uno mismo no se dispara jamas aqui. Es a
    // proposito: la siembra no debe depender de tener suerte.
    const validador = azar.elegir(jefesTecnicos);
    if (validador === undefined) continue;

    // Una de cada seis se rechazo antes de aprobarse. Esa fila anterior es
    // lo que hace util el historial: sin ella parece que todo sale bien a
    // la primera, y las pantallas de reincidencia no tendrian que mostrar.
    if (azar.decimal(0, 1) < 0.17) {
      const rechazo = azar.elegir(OBSERVACIONES_VALIDACION.filter(([aprobada]) => !aprobada));
      filasValidacion.push([
        azar.uuid(), orden.id, null, 'requiere_correccion', rechazo[1],
        true, true, true, false, validador.id, sumarDias(momentoCierre, -1),
      ]);
    }

    const aprobacion = azar.elegir(OBSERVACIONES_VALIDACION.filter(([aprobada]) => aprobada));
    filasValidacion.push([
      azar.uuid(), orden.id, null, 'aprobada', aprobacion[1],
      true, true, true, true, validador.id, momentoCierre,
    ]);

    if (orden.estadoFinal !== ESTADO_ORDEN.ENTREGADA) continue;

    // Uno de cada cuatro equipos lo retira alguien que no es el titular.
    // Es lo normal en un centro de servicio y es justo lo que despues se
    // reclama, asi que el dato tiene que existir.
    const loRetiraOtro = azar.decimal(0, 1) < 0.25;
    filasEntrega.push([
      azar.uuid(), orden.id,
      loRetiraOtro ? azar.elegir(RELACION_CON_EL_CLIENTE) : 'El titular de la orden',
      loRetiraOtro ? `${azar.entero(100, 999)}-${azar.entero(100000, 999999)}-0000${azar.entero(0, 9)}U` : null,
      !loRetiraOtro,
      null,
      null,
      azar.elegir(mostrador)?.id ?? validador.id,
      momentoCierre,
    ]);
  }

  await copiarFilas(
    cliente,
    'validacion_tecnica',
    ['id', 'id_orden', 'id_diagnostico', 'resultado', 'observacion',
      'reviso_diagnostico', 'reviso_reparacion', 'reviso_evidencias', 'reviso_repuestos',
      'id_validador', 'momento'],
    filasValidacion as never,
  );
  await copiarFilas(
    cliente,
    'entrega',
    ['id', 'id_orden', 'recibido_por', 'documento_receptor', 'es_el_cliente',
      'id_evidencia_firma', 'observacion', 'id_responsable', 'momento'],
    filasEntrega as never,
  );
}

type EstadoRevisable = typeof ESTADO_ORDEN.FINALIZADA | typeof ESTADO_ORDEN.ENTREGADA;
