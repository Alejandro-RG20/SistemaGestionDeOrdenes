/**
 * Que puede mover el tecnico desde la tableta, sin conexion.
 *
 * Esto NO es una segunda maquina de estados. La maquina vive en el servidor
 * y es la unica que decide; esto es el subconjunto que la app se atreve a
 * OFRECER, y existe por una razon concreta: un boton que el servidor va a
 * rechazar no se convierte en un mensaje de error, se convierte en una
 * excepcion de sincronizacion que alguien tiene que reconciliar a mano un
 * dia despues, con el tecnico ya en otra casa.
 *
 * El criterio es el del servidor: solo se ofrecen las transiciones cuyo
 * estado de origen tiene al TECNICO ASIGNADO como responsable. Quedan
 * fuera, a proposito:
 *
 *  - `en_cola_taller -> en_diagnostico`, que la mueve la jefatura de
 *    tecnicos cuando reparte el trabajo del taller;
 *  - `cotizada -> esperando_autorizacion`, que exige una cotizacion
 *    registrada y esa no se levanta desde la tableta;
 *  - anular y cerrar sin reparar, que son decisiones de cierre. Tomarlas en
 *    el domicilio, solo y sin senal, es justo lo que no debe pasar: el
 *    tecnico registra el resultado de la visita y la jefatura cierra.
 */
import { ESTADO_ORDEN, type EstadoOrden } from '@servitotal/compartido';

export interface OpcionDeAvance {
  readonly hacia: EstadoOrden;
  /** Lo que el tecnico lee en el boton. */
  readonly etiqueta: string;
  /** Lo que tiene que haber hecho antes, dicho en su idioma. */
  readonly advertencia?: string;
}

const AVANCES: Readonly<Partial<Record<EstadoOrden, readonly OpcionDeAvance[]>>> = {
  [ESTADO_ORDEN.EN_RUTA]: [
    { hacia: ESTADO_ORDEN.EN_DIAGNOSTICO, etiqueta: 'Empezar diagnostico aqui' },
    {
      hacia: ESTADO_ORDEN.EN_COLA_TALLER,
      etiqueta: 'Llevar el articulo al taller',
      advertencia: 'Registre antes el resultado de la visita.',
    },
  ],
  [ESTADO_ORDEN.EN_DIAGNOSTICO]: [
    {
      hacia: ESTADO_ORDEN.EN_REPARACION,
      etiqueta: 'Reparar ahora',
      advertencia: 'Necesita el diagnostico registrado y la evidencia del diagnostico.',
    },
    {
      hacia: ESTADO_ORDEN.ESPERANDO_REPUESTO,
      etiqueta: 'Falta un repuesto',
      advertencia: 'Necesita el diagnostico registrado.',
    },
  ],
  [ESTADO_ORDEN.EN_REPARACION]: [
    {
      hacia: ESTADO_ORDEN.FINALIZADA,
      etiqueta: 'Terminar la reparacion',
      advertencia: 'Necesita la evidencia de reparacion completa.',
    },
    {
      hacia: ESTADO_ORDEN.ESPERANDO_REPUESTO,
      etiqueta: 'Aparecio otra falla: falta repuesto',
    },
  ],
};

export function avancesDisponibles(estado: EstadoOrden): readonly OpcionDeAvance[] {
  return AVANCES[estado] ?? [];
}

/**
 * Por que una orden no se puede mover desde la tableta. Se muestra en vez
 * de una pantalla sin botones, que no explica nada.
 */
export function porQueNoSePuedeMover(estado: EstadoOrden): string | null {
  if (avancesDisponibles(estado).length > 0) return null;
  switch (estado) {
    case ESTADO_ORDEN.REGISTRADA:
    case ESTADO_ORDEN.ASIGNADA:
      return 'Todavia no esta en sus manos: la jefatura de tecnicos la despacha.';
    case ESTADO_ORDEN.EN_COLA_TALLER:
      return 'Esta en la cola del taller. La jefatura de tecnicos la asigna a diagnostico.';
    case ESTADO_ORDEN.COTIZADA:
      return 'Esta cotizada. La autorizacion del cliente se gestiona desde el panel.';
    case ESTADO_ORDEN.ESPERANDO_AUTORIZACION:
      return 'Esperando que el cliente autorice la cotizacion.';
    case ESTADO_ORDEN.ESPERANDO_REPUESTO:
      return 'Esperando el repuesto. Bodega la libera cuando entra.';
    case ESTADO_ORDEN.FINALIZADA:
      return 'Ya esta terminada. La entrega al cliente se registra en el mostrador.';
    default:
      return 'Esta orden ya esta cerrada y no se modifica.';
  }
}

/** Estados en los que tiene sentido consumir un repuesto contra la orden. */
export function admiteConsumo(estado: EstadoOrden): boolean {
  return estado === ESTADO_ORDEN.EN_REPARACION
    || estado === ESTADO_ORDEN.EN_DIAGNOSTICO
    || estado === ESTADO_ORDEN.EN_RUTA;
}

/** Estados en los que el diagnostico todavia se puede registrar. */
export function admiteDiagnostico(estado: EstadoOrden): boolean {
  return estado === ESTADO_ORDEN.EN_DIAGNOSTICO || estado === ESTADO_ORDEN.EN_RUTA;
}

/** La visita solo se registra en las ordenes de ruta, y solo yendo a ellas. */
export function admiteVisita(estado: EstadoOrden): boolean {
  return estado === ESTADO_ORDEN.EN_RUTA;
}
