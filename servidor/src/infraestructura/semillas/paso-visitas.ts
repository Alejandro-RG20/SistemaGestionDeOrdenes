/**
 * Paso 9: visitas de las ordenes de ruta.
 *
 * El indice ux_visita_tecnico_franja prohibe dos visitas vigentes del mismo
 * tecnico en la misma franja: la siembra respeta esa regla reservando
 * franjas libres, no confiando en la suerte. Las reprogramaciones se
 * guardan como visitas no vigentes, que si pueden repetir franja.
 */
import type { PoolClient } from 'pg';
import { ESTADO_ORDEN, RESULTADO_VISITA } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { comoFecha, sumarDias, sumarHoras } from './aleatorio.js';
import type { ContextoSiembra } from './contexto.js';
import type { ResumenOrden } from './paso-ordenes.js';

const FRANJAS = ['08:00-10:00', '10:00-12:00', '13:00-15:00', '15:00-17:00'] as const;
const DIAS_MAXIMOS_DE_CORRIMIENTO = 7;

const MOTIVOS_REPROGRAMACION = [
  'El cliente pidio otro dia',
  'Lluvia: no se pudo acceder al sector',
  'El tecnico quedo retenido en la visita anterior',
] as const;

export async function sembrarVisitas(
  cliente: PoolClient,
  contexto: ContextoSiembra,
  ordenes: readonly ResumenOrden[],
): Promise<void> {
  const { azar } = contexto;
  const franjasOcupadas = new Set<string>();
  const filas: unknown[][] = [];

  /** Reserva la primera franja libre a partir de la fecha pedida. */
  const reservar = (idTecnico: string, desde: Date): { fecha: string; franja: string } | null => {
    for (let corrimiento = 0; corrimiento <= DIAS_MAXIMOS_DE_CORRIMIENTO; corrimiento += 1) {
      const fecha = comoFecha(sumarDias(desde, corrimiento));
      for (const franja of azar.barajar(FRANJAS)) {
        const llave = `${idTecnico}|${fecha}|${franja}`;
        if (franjasOcupadas.has(llave)) continue;
        franjasOcupadas.add(llave);
        return { fecha, franja };
      }
    }
    return null;
  };

  for (const orden of ordenes) {
    const posicionRuta = orden.estados.indexOf(ESTADO_ORDEN.EN_RUTA);
    if (posicionRuta < 0 || orden.tecnico === null) continue;

    const momentoRuta = orden.momentos[posicionRuta]!;
    const reserva = reservar(orden.tecnico.id, momentoRuta);
    if (reserva === null) continue; // agenda saturada: la orden queda sin visita programada

    // Una de cada seis visitas se reprogramo: la anterior queda no vigente.
    if (azar.booleano(1 / 6)) {
      filas.push([
        azar.uuid(), orden.id, orden.tecnico.id, comoFecha(sumarDias(momentoRuta, -azar.entero(1, 4))),
        azar.elegir(FRANJAS), null, null, null, RESULTADO_VISITA.PROGRAMADA, false,
        azar.elegir(MOTIVOS_REPROGRAMACION), orden.fechaRecepcion, orden.idAgenteRegistro,
      ]);
    }

    const resultado = orden.convertida
      ? RESULTADO_VISITA.REQUIERE_TRASLADO_TALLER
      : orden.estadoFinal === ESTADO_ORDEN.EN_RUTA
        ? RESULTADO_VISITA.PROGRAMADA
        : azar.elegirPonderado([
            [RESULTADO_VISITA.RESUELTA_EN_SITIO, 62],
            [RESULTADO_VISITA.CLIENTE_AUSENTE, 12],
            [RESULTADO_VISITA.NO_AUTORIZADA, 10],
            [RESULTADO_VISITA.REQUIERE_TRASLADO_TALLER, 16],
          ]);

    const horaLlegada = resultado === RESULTADO_VISITA.PROGRAMADA ? null : momentoRuta;
    filas.push([
      azar.uuid(), orden.id, orden.tecnico.id, reserva.fecha, reserva.franja,
      azar.entero(1, 6), horaLlegada,
      horaLlegada === null ? null : sumarHoras(horaLlegada, azar.decimal(0.5, 2.5, 1)),
      resultado, true,
      resultado === RESULTADO_VISITA.CLIENTE_AUSENTE ? 'No habia nadie en la vivienda' : null,
      orden.fechaRecepcion, orden.idAgenteRegistro,
    ]);
  }

  await copiarFilas(
    cliente,
    'visita',
    ['id', 'id_orden', 'id_tecnico', 'fecha_programada', 'franja_horaria', 'orden_recorrido',
      'hora_llegada', 'hora_salida', 'resultado', 'vigente', 'motivo', 'creado_en', 'creado_por'],
    filas as never,
  );
}
