/**
 * Errores de la aplicacion.
 *
 * Los mensajes los lee el asistente del taller, no un programador: se
 * escriben en terminos del negocio. El detalle tecnico viaja en `causa` y
 * se registra en la bitacora, nunca se devuelve al cliente.
 */

export class ErrorAplicacion extends Error {
  readonly codigo: string;
  readonly causa?: unknown;

  constructor(codigo: string, mensaje: string, causa?: unknown) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
    this.causa = causa;
  }
}

/** Configuracion ausente o invalida: impide arrancar. */
export class ErrorConfiguracion extends ErrorAplicacion {
  constructor(mensaje: string, causa?: unknown) {
    super('CONFIGURACION_INVALIDA', mensaje, causa);
  }
}

/** Una regla del negocio impide la operacion. */
export class ErrorDominio extends ErrorAplicacion {
  constructor(codigo: string, mensaje: string, causa?: unknown) {
    super(codigo, mensaje, causa);
  }
}

/** El estado de las migraciones no permite continuar sin intervencion humana. */
export class ErrorMigracion extends ErrorAplicacion {
  constructor(mensaje: string, causa?: unknown) {
    super('MIGRACION_INCONSISTENTE', mensaje, causa);
  }
}
