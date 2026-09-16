/**
 * Contratos del portal publico de consulta.
 *
 * Aqui entra gente sin sesion, asi que la regla es una sola: SE DEVUELVE LO
 * MINIMO PARA QUE EL CLIENTE SEPA COMO VA SU ARTICULO, Y NADA MAS.
 *
 * No viaja el telefono, ni la direccion, ni el nombre completo, ni la falla
 * real diagnosticada, ni montos, ni quien es el tecnico. Quien consulta ya
 * sabe su propio telefono —lo acaba de teclear— y todo lo demas seria
 * regalarle datos de un cliente a cualquiera que pruebe numeros de orden.
 */

export interface PeticionConsultaPublica {
  readonly numeroOrden: number;
  /**
   * RF-66: se acepta el telefono vigente del cliente o el que quedo
   * congelado en la orden. La gente cambia de numero y no tiene por que
   * recordar cual dio hace tres semanas.
   */
  readonly telefono: string;
}

/** Un paso del recorrido, en lenguaje de cliente y no de sistema. */
export interface PasoPublico {
  readonly etapa: string;
  readonly descripcion: string;
  readonly momento: string;
  readonly alcanzado: boolean;
  readonly actual: boolean;
}

export interface EstadoPublicoOrden {
  readonly numeroOrden: number;
  /** Iniciales del cliente, para que sepa que es la suya sin exponer el nombre. */
  readonly cliente: string;
  readonly articulo: string;
  readonly recibidoEn: string;
  /** Texto para el cliente, no el nombre interno del estado. */
  readonly situacion: string;
  readonly explicacion: string;
  /** Null cuando todavia no hay fecha comprometida o la orden ya cerro. */
  readonly entregaEstimada: string | null;
  readonly entregadoEn: string | null;
  readonly cerrada: boolean;
  /** RF-68: cuando se espera el repuesto, si es lo que la detiene. */
  readonly repuestoEsperadoPara: string | null;
  readonly recorrido: readonly PasoPublico[];
  readonly actualizadoEn: string;
}
