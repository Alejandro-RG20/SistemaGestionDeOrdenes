/**
 * Que exige cada tipo de movimiento de repuesto.
 *
 * Es una tabla, no una cascada de condicionales: agregar un tipo de
 * movimiento es agregar una fila aqui. Codigo puro, sin base de datos.
 *
 * La regla que mas importa es la ultima columna: la bodega CENTRAL es
 * concurrente y solo se descuenta en linea; la MOVIL pertenece a un solo
 * tecnico, no tiene concurrencia y por eso puede descontarse sin conexion.
 */
import { TIPO_BODEGA, TIPO_MOVIMIENTO, type TipoMovimiento } from '@servitotal/compartido';

export interface ReglaMovimiento {
  readonly tipo: TipoMovimiento;
  /** De donde sale el repuesto. `null` significa que el tipo no lo admite. */
  readonly origen: 'obligatorio' | 'prohibido';
  readonly destino: 'obligatorio' | 'prohibido';
  readonly exigeOrden: boolean;
  readonly exigeJustificacion: boolean;
  readonly descripcion: string;
}

const REGLAS: readonly ReglaMovimiento[] = [
  {
    tipo: TIPO_MOVIMIENTO.INGRESO,
    origen: 'prohibido', destino: 'obligatorio',
    exigeOrden: false, exigeJustificacion: false,
    descripcion: 'entrada de repuesto comprado o pedido al proveedor',
  },
  {
    tipo: TIPO_MOVIMIENTO.DESPACHO_A_MOVIL,
    origen: 'obligatorio', destino: 'obligatorio',
    exigeOrden: false, exigeJustificacion: false,
    descripcion: 'traslado de la central a la bodega movil de un tecnico',
  },
  {
    tipo: TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL,
    origen: 'obligatorio', destino: 'obligatorio',
    exigeOrden: false, exigeJustificacion: false,
    descripcion: 'devolucion de lo que el tecnico no uso en la ruta',
  },
  {
    tipo: TIPO_MOVIMIENTO.CONSUMO,
    origen: 'obligatorio', destino: 'prohibido',
    // RN-12: todo consumo queda atado a la orden que lo consumio.
    exigeOrden: true, exigeJustificacion: false,
    descripcion: 'repuesto instalado en un articulo',
  },
  {
    tipo: TIPO_MOVIMIENTO.DEVOLUCION_PIEZA_SUSTITUIDA,
    origen: 'prohibido', destino: 'obligatorio',
    exigeOrden: true, exigeJustificacion: false,
    descripcion: 'pieza retirada del articulo, resguardada para el fabricante',
  },
  {
    tipo: TIPO_MOVIMIENTO.AJUSTE,
    // Un ajuste suma o resta: lleva la bodega en origen o en destino, y la
    // validacion de abajo exige exactamente una de las dos.
    origen: 'prohibido', destino: 'prohibido',
    exigeOrden: false, exigeJustificacion: true,
    descripcion: 'correccion justificada de la existencia',
  },
];

const POR_TIPO = new Map<TipoMovimiento, ReglaMovimiento>(REGLAS.map((regla) => [regla.tipo, regla]));

export function reglaDe(tipo: TipoMovimiento): ReglaMovimiento {
  const regla = POR_TIPO.get(tipo);
  if (regla === undefined) {
    throw new Error(`El tipo de movimiento ${tipo} no esta declarado.`);
  }
  return regla;
}

export const TODAS_LAS_REGLAS: readonly ReglaMovimiento[] = REGLAS;

export interface PeticionMovimiento {
  readonly tipo: TipoMovimiento;
  readonly idBodegaOrigen: string | null;
  readonly idBodegaDestino: string | null;
  readonly cantidad: number;
  readonly idOrden: string | null;
  readonly justificacion: string | null;
  readonly registradoSinConexion: boolean;
}

export interface TiposDeBodega {
  readonly origen: string | null;
  readonly destino: string | null;
}

export interface VeredictoMovimiento {
  readonly valido: boolean;
  readonly motivo?: string;
  readonly campo?: string;
}

const VALIDO: VeredictoMovimiento = { valido: true };

/**
 * Comprueba la forma del movimiento. No mira existencias: de eso se ocupa
 * el servicio, que es quien puede bloquear la fila.
 */
export function validarMovimiento(
  peticion: PeticionMovimiento,
  bodegas: TiposDeBodega,
): VeredictoMovimiento {
  const regla = reglaDe(peticion.tipo);

  if (!Number.isInteger(peticion.cantidad) || peticion.cantidad <= 0) {
    return { valido: false, motivo: 'La cantidad debe ser un numero entero mayor que cero.', campo: 'cantidad' };
  }

  if (peticion.tipo === TIPO_MOVIMIENTO.AJUSTE) {
    const tieneOrigen = peticion.idBodegaOrigen !== null;
    const tieneDestino = peticion.idBodegaDestino !== null;
    if (tieneOrigen === tieneDestino) {
      return {
        valido: false,
        motivo: 'Un ajuste suma o resta: indique la bodega de destino si sobra, o la de origen si falta. No las dos.',
        campo: 'idBodegaDestino',
      };
    }
  } else {
    const problema = comprobarBodega('origen', regla.origen, peticion.idBodegaOrigen, regla)
      ?? comprobarBodega('destino', regla.destino, peticion.idBodegaDestino, regla);
    if (problema !== null) return problema;
  }

  if (peticion.idBodegaOrigen !== null && peticion.idBodegaOrigen === peticion.idBodegaDestino) {
    return { valido: false, motivo: 'La bodega de origen y la de destino no pueden ser la misma.', campo: 'idBodegaDestino' };
  }

  if (regla.exigeOrden && peticion.idOrden === null) {
    return {
      valido: false,
      motivo: 'Todo consumo tiene que quedar atado a la orden que lo consumio.',
      campo: 'idOrden',
    };
  }

  if (regla.exigeJustificacion && (peticion.justificacion ?? '').trim().length < 10) {
    return {
      valido: false,
      motivo: 'Un movimiento no se edita: se corrige con un ajuste justificado. Escriba la justificacion.',
      campo: 'justificacion',
    };
  }

  // La central es concurrente: descontarla exige estar en linea.
  if (peticion.registradoSinConexion && bodegas.origen === TIPO_BODEGA.CENTRAL) {
    return {
      valido: false,
      motivo: 'La bodega central solo se descuenta en linea. Sin conexion solo se puede consumir de la bodega movil.',
      campo: 'idBodegaOrigen',
    };
  }

  if (peticion.tipo === TIPO_MOVIMIENTO.DESPACHO_A_MOVIL && bodegas.destino !== TIPO_BODEGA.MOVIL) {
    return { valido: false, motivo: 'Un despacho a movil tiene que ir a una bodega movil.', campo: 'idBodegaDestino' };
  }

  if (peticion.tipo === TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL && bodegas.destino !== TIPO_BODEGA.CENTRAL) {
    return { valido: false, motivo: 'Una devolucion a central tiene que ir a una bodega central.', campo: 'idBodegaDestino' };
  }

  return VALIDO;
}

function comprobarBodega(
  papel: 'origen' | 'destino',
  exigencia: 'obligatorio' | 'prohibido',
  valor: string | null,
  regla: ReglaMovimiento,
): VeredictoMovimiento | null {
  const campo = papel === 'origen' ? 'idBodegaOrigen' : 'idBodegaDestino';

  if (exigencia === 'obligatorio' && valor === null) {
    return { valido: false, motivo: `Indique la bodega de ${papel}: un ${regla.descripcion} la necesita.`, campo };
  }
  if (exigencia === 'prohibido' && valor !== null) {
    return { valido: false, motivo: `Un ${regla.descripcion} no lleva bodega de ${papel}.`, campo };
  }
  return null;
}

/**
 * Como afecta el movimiento a cada bodega. Es la misma cuenta con la que se
 * reconstruye `existencia` desde `movimiento_repuesto`.
 */
export function efectoSobreExistencia(
  peticion: PeticionMovimiento,
): readonly { readonly idBodega: string; readonly delta: number }[] {
  const efectos: { idBodega: string; delta: number }[] = [];
  if (peticion.idBodegaOrigen !== null) {
    efectos.push({ idBodega: peticion.idBodegaOrigen, delta: -peticion.cantidad });
  }
  if (peticion.idBodegaDestino !== null) {
    efectos.push({ idBodega: peticion.idBodegaDestino, delta: peticion.cantidad });
  }
  return efectos;
}
