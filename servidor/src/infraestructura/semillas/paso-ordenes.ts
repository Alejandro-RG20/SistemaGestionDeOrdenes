/**
 * Paso 8: las 30 000 ordenes de servicio con su bitacora de estados.
 *
 * El numero correlativo NO se genera aqui: la columna se omite del COPY y
 * lo asigna la secuencia del servidor, que es la regla del pliego.
 */
import type { PoolClient } from 'pg';
import {
  CODIGO_ROL, ESTADO_ORDEN, ESTADOS_FINALES, MODALIDAD_SERVICIO, TIPO_GARANTIA, type EstadoOrden,
} from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { sumarDias, sumarHoras } from './aleatorio.js';
import { FALLAS_REPORTADAS } from './nombres.js';
import { construirCadena, construirObjetivos } from './distribucion-estados.js';
import { evaluarCobertura } from './garantia-provisional.js';
import { responsableDe } from './responsables.js';
import { CALENDARIO, FERIADOS, PLAZOS_GENERALES } from './paso-parametros.js';
import {
  construirCalendario, restarHorasLaborables, sumarHorasLaborables,
} from '../../dominio/plazos/indice.js';
import { usuariosDe, type ContextoSiembra, type ReferenciaTecnico } from './contexto.js';

export interface ResumenOrden {
  readonly id: string;
  readonly idCliente: string;
  readonly idArticulo: string;
  readonly idCategoria: string;
  readonly idMarca: string;
  readonly tecnico: ReferenciaTecnico | null;
  readonly estados: readonly EstadoOrden[];
  readonly momentos: readonly Date[];
  readonly estadoFinal: EstadoOrden;
  readonly tipoGarantia: string;
  readonly nacioEnRuta: boolean;
  readonly convertida: boolean;
  readonly cargoVisita: number;
  readonly fechaRecepcion: Date;
  readonly idAgenteRegistro: string;
}

const HORAS_POR_ESTADO: Readonly<Partial<Record<EstadoOrden, readonly [number, number]>>> = {
  [ESTADO_ORDEN.REGISTRADA]: [1, 10],
  [ESTADO_ORDEN.ASIGNADA]: [2, 20],
  [ESTADO_ORDEN.EN_RUTA]: [2, 26],
  [ESTADO_ORDEN.EN_COLA_TALLER]: [4, 40],
  [ESTADO_ORDEN.EN_DIAGNOSTICO]: [2, 18],
  [ESTADO_ORDEN.COTIZADA]: [1, 9],
  [ESTADO_ORDEN.ESPERANDO_AUTORIZACION]: [4, 60],
  [ESTADO_ORDEN.ESPERANDO_REPUESTO]: [24, 200],
  [ESTADO_ORDEN.EN_REPARACION]: [3, 36],
  [ESTADO_ORDEN.FINALIZADA]: [2, 30],
};

const MOTIVOS_ANULACION = [
  'El cliente desistio del servicio',
  'Orden duplicada: se atendio en la orden anterior',
  'El articulo ya fue reparado por un tercero',
  'Direccion inexistente tras tres intentos de contacto',
  'El cliente no acepto el cargo por visita',
] as const;

const plazoDe = new Map(PLAZOS_GENERALES.map(([estado, maximas]) => [estado, maximas]));

/**
 * El mismo calendario que se siembra en calendario_laboral, para que
 * plazo_vence_en quede calculado en HORAS LABORABLES desde el primer dia.
 * Con horas corridas, el panel de plazos mostraria en rojo ordenes que
 * llegaron un sabado por la tarde.
 */
const CALENDARIO_LABORAL = construirCalendario(
  CALENDARIO.map(([diaSemana, horaInicio, horaFin]) => ({ diaSemana, horaInicio, horaFin })),
  FERIADOS.map(([fecha]) => fecha),
);

export async function sembrarOrdenes(
  cliente: PoolClient,
  contexto: ContextoSiembra,
): Promise<ResumenOrden[]> {
  const { azar } = contexto;
  const agentes = usuariosDe(contexto, CODIGO_ROL.AGENTE_TELEFONIA);
  const tecnicosRuta = contexto.tecnicos.filter((t) => t.tipo === 'ruta');
  const tecnicosPlanta = contexto.tecnicos.filter((t) => t.tipo === 'planta');
  const articuloPorId = new Map(contexto.articulos.map((a) => [a.id, a]));
  const clientePorId = new Map(contexto.clientes.map((c) => [c.id, c]));
  const zonaPorId = new Map(contexto.zonas.map((z) => [z.id, z]));

  const resumenes: ResumenOrden[] = [];
  const filasOrden: unknown[][] = [];
  const filasEvento: unknown[][] = [];

  for (const objetivo of construirObjetivos(azar)) {
    const cadena = construirCadena(azar, objetivo);
    const articulo = azar.elegir(contexto.articulos);
    const duenio = clientePorId.get(articulo.idCliente)!;
    const zona = zonaPorId.get(duenio.idZona)!;

    // Duracion acumulada del recorrido, para ubicarlo en el tiempo.
    const brincos = cadena.estados.slice(0, -1).map((estado) => {
      const [minimo, maximo] = HORAS_POR_ESTADO[estado] ?? [2, 24];
      return azar.decimal(minimo, maximo, 1);
    });
    const duracionTotal = brincos.reduce((suma, horas) => suma + horas, 0);

    const esFinal = ESTADOS_FINALES.includes(objetivo);

    // Las ordenes cerradas se reparten por toda la ventana; las vivas se
    // pegan al presente, algunas ya vencidas, para que el panel de plazos
    // tenga con que trabajar.
    let fechaRecepcion: Date;
    if (esFinal) {
      fechaRecepcion = azar.fechaEntre(
        contexto.inicioVentana,
        sumarHoras(sumarDias(contexto.finVentana, -2), -duracionTotal),
      );
    } else {
      // La antiguedad del estado se mide en horas LABORABLES, igual que el
      // plazo: si no, ninguna orden apareceria vencida, porque el plazo en
      // horas laborables se estira casi al doble en tiempo corrido.
      const plazo = plazoDe.get(objetivo) ?? 24;
      const factor = azar.elegirPonderado([[0.7, 70], [1.8, 30]]);
      const antiguedad = azar.decimal(0.5, Math.max(1, plazo * factor), 1);
      const inicioDelEstado = restarHorasLaborables(contexto.finVentana, antiguedad, CALENDARIO_LABORAL);
      fechaRecepcion = sumarHoras(inicioDelEstado, -duracionTotal);
    }

    const momentos: Date[] = [fechaRecepcion];
    for (const horas of brincos) momentos.push(sumarHoras(momentos.at(-1)!, horas));

    const tecnico = cadena.estados.includes(ESTADO_ORDEN.ASIGNADA)
      ? azar.elegir(cadena.nacioEnRuta ? tecnicosRuta : tecnicosPlanta)
      : null;

    const cobertura = evaluarCobertura(contexto, articuloPorId.get(articulo.id)!, fechaRecepcion);
    const llegoADiagnostico = cadena.estados.includes(ESTADO_ORDEN.EN_DIAGNOSTICO);
    const levantadaEnCampo = cadena.nacioEnRuta && azar.booleano(0.3);
    // H4: lo levantado en campo entra como por_validar hasta que se confirma.
    const tipoGarantia = levantadaEnCampo && !llegoADiagnostico
      ? TIPO_GARANTIA.POR_VALIDAR
      : cobertura.tipo;

    const modalidad = cadena.nacioEnRuta && !cadena.convertida
      ? MODALIDAD_SERVICIO.RUTA
      : MODALIDAD_SERVICIO.TALLER;
    const cargoVisita = cadena.nacioEnRuta ? zona.cargoVisita : 0;
    const estadoFinal = cadena.estados.at(-1)!;
    const fechaEstadoDesde = momentos.at(-1)!;
    const agenteRegistro = azar.elegir(agentes);

    const total = tipoGarantia === TIPO_GARANTIA.PARTICULAR && llegoADiagnostico
      ? azar.decimal(400, 12_000)
      : 0;

    const idOrden = azar.uuid();
    filasOrden.push([
      idOrden, contexto.idCentro, articulo.idCliente, articulo.id, tecnico?.id ?? null,
      modalidad, estadoFinal, tipoGarantia,
      responsableDe(contexto, estadoFinal, tecnico),
      duenio.telefonoVigente,
      cadena.nacioEnRuta ? duenio.direccion : null,
      cadena.nacioEnRuta ? duenio.referenciaUbicacion : null,
      cadena.nacioEnRuta ? zona.id : null,
      cargoVisita, cobertura.regla.id,
      azar.elegir(FALLAS_REPORTADAS), fechaRecepcion, fechaEstadoDesde,
      esFinal ? null : sumarHorasLaborables(fechaEstadoDesde, plazoDe.get(estadoFinal) ?? 24, CALENDARIO_LABORAL),
      estadoFinal === ESTADO_ORDEN.ENTREGADA ? fechaEstadoDesde : null,
      total, levantadaEnCampo,
      estadoFinal === ESTADO_ORDEN.ANULADA ? azar.elegir(MOTIVOS_ANULACION) : null,
      fechaRecepcion, agenteRegistro.id,
    ]);

    cadena.estados.forEach((estado, indice) => {
      const anterior = indice === 0 ? null : cadena.estados[indice - 1]!;
      const sinConexion = cadena.nacioEnRuta && estado === ESTADO_ORDEN.EN_RUTA && azar.booleano(0.6);
      filasEvento.push([
        azar.uuid(), idOrden, anterior, estado,
        responsableDe(contexto, anterior ?? estado, tecnico) ?? agenteRegistro.id,
        momentos[indice]!,
        sinConexion ? sumarHoras(momentos[indice]!, -azar.decimal(0.5, 6, 1)) : null,
        sinConexion,
        estado === ESTADO_ORDEN.EN_COLA_TALLER && cadena.convertida
          ? 'Conversion de ruta a taller: el articulo se traslada al centro'
          : null,
      ]);
    });

    resumenes.push({
      id: idOrden, idCliente: articulo.idCliente, idArticulo: articulo.id,
      idCategoria: articulo.idCategoria, idMarca: articulo.idMarca, tecnico,
      estados: cadena.estados, momentos, estadoFinal, tipoGarantia,
      nacioEnRuta: cadena.nacioEnRuta, convertida: cadena.convertida,
      cargoVisita, fechaRecepcion, idAgenteRegistro: agenteRegistro.id,
    });
  }

  await copiarFilas(
    cliente,
    'orden_servicio',
    ['id', 'id_centro', 'id_cliente', 'id_articulo', 'id_tecnico', 'modalidad', 'estado',
      'tipo_garantia', 'id_responsable_actual', 'telefono_contacto', 'direccion_servicio',
      'referencia_ubicacion', 'id_zona', 'cargo_visita', 'id_regla_cobertura', 'falla_reportada',
      'fecha_recepcion', 'fecha_estado_desde', 'plazo_vence_en', 'fecha_entrega', 'total',
      'levantada_en_campo', 'motivo_anulacion', 'creado_en', 'creado_por'],
    filasOrden as never,
  );
  await copiarFilas(
    cliente,
    'evento_orden',
    ['id', 'id_orden', 'estado_anterior', 'estado_nuevo', 'id_responsable', 'momento',
      'momento_dispositivo', 'registrado_sin_conexion', 'observacion'],
    filasEvento as never,
  );

  return resumenes;
}
