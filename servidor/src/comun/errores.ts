/**
 * Errores de la aplicacion.
 *
 * Los mensajes los lee el asistente del taller, no un programador: se
 * escriben en terminos del negocio. El detalle tecnico viaja en `causa` y
 * se registra en la bitacora, nunca se devuelve al cliente.
 *
 * Ningun error de aqui conoce codigos HTTP. La traduccion a HTTP ocurre en
 * un unico lugar: comun/manejador-errores.ts.
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

/** Los datos recibidos no cumplen el contrato. */
export class ErrorValidacion extends ErrorAplicacion {
  readonly campos: Readonly<Record<string, string>>;

  constructor(mensaje: string, campos: Readonly<Record<string, string>> = {}) {
    super('DATOS_INVALIDOS', mensaje);
    this.campos = campos;
  }
}

/** Quien pide no ha demostrado quien es, o su credencial ya no sirve. */
export class ErrorAutenticacion extends ErrorAplicacion {
  constructor(mensaje: string, codigo = 'NO_AUTENTICADO', causa?: unknown) {
    super(codigo, mensaje, causa);
  }
}

/** Sabemos quien es, pero no tiene el permiso que la operacion exige. */
export class ErrorAutorizacion extends ErrorAplicacion {
  constructor(mensaje: string, causa?: unknown) {
    super('SIN_PERMISO', mensaje, causa);
  }
}

/** El registro pedido no existe, o quien pide no tiene por que verlo. */
export class ErrorNoEncontrado extends ErrorAplicacion {
  constructor(mensaje: string, causa?: unknown) {
    super('NO_ENCONTRADO', mensaje, causa);
  }
}

/** La operacion choca con algo que ya existe. */
export class ErrorConflicto extends ErrorAplicacion {
  constructor(mensaje: string, causa?: unknown) {
    super('CONFLICTO', mensaje, causa);
  }
}

/** El estado de las migraciones no permite continuar sin intervencion humana. */
export class ErrorMigracion extends ErrorAplicacion {
  constructor(mensaje: string, causa?: unknown) {
    super('MIGRACION_INCONSISTENTE', mensaje, causa);
  }
}
