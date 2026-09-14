/**
 * Contratos del modulo de clientes.
 *
 * Los datos del cliente son vivos: cambiarlos aqui los cambia en todas
 * partes. Lo que la orden copio al crearse —direccion de servicio, zona,
 * cargo por visita— queda congelado en la orden y no se toca hacia atras.
 */

export interface TelefonoCliente {
  readonly id: string;
  readonly numero: string;
  readonly tipo: string | null;
  readonly vigente: boolean;
  readonly desde: string;
  readonly hasta: string | null;
}

export interface DireccionCliente {
  readonly id: string;
  readonly idZona: string | null;
  readonly zona: string | null;
  readonly detalle: string;
  readonly referencia: string | null;
  readonly principal: boolean;
  readonly vigente: boolean;
  readonly desde: string;
  readonly hasta: string | null;
}

export interface ResumenCliente {
  readonly id: string;
  readonly nombres: string;
  readonly apellidos: string | null;
  readonly identificacion: string | null;
  readonly correo: string | null;
  readonly telefonoVigente: string | null;
  readonly direccionPrincipal: string | null;
  readonly activo: boolean;
  /** Cliente al que fue fusionado, si es un duplicado absorbido. */
  readonly idClientePrincipal: string | null;
  readonly creadoEn: string;
}

export interface FichaCliente extends ResumenCliente {
  readonly telefonos: readonly TelefonoCliente[];
  readonly direcciones: readonly DireccionCliente[];
  readonly cantidadArticulos: number;
  readonly cantidadOrdenes: number;
}

export interface PeticionCrearCliente {
  readonly nombres: string;
  readonly apellidos?: string | null;
  readonly identificacion?: string | null;
  readonly correo?: string | null;
  readonly telefono: string;
  readonly direccion?: {
    readonly detalle: string;
    readonly referencia?: string | null;
    readonly idZona?: string | null;
  } | null;
}

export interface PeticionActualizarCliente {
  readonly nombres?: string;
  readonly apellidos?: string | null;
  readonly identificacion?: string | null;
  readonly correo?: string | null;
}

export interface PeticionAgregarTelefono {
  readonly numero: string;
  readonly tipo?: string | null;
  /** Si es true, el telefono vigente anterior pasa a historico. */
  readonly reemplazaAlVigente: boolean;
}

export interface PeticionAgregarDireccion {
  readonly detalle: string;
  readonly referencia?: string | null;
  readonly idZona?: string | null;
  /** Si es true, la direccion principal anterior deja de serlo. */
  readonly esPrincipal: boolean;
}

export interface PeticionFusionarClientes {
  /** Cliente duplicado que queda absorbido. */
  readonly idClienteAbsorbido: string;
  readonly motivo: string;
}

export interface ResultadoFusion {
  readonly idClientePrincipal: string;
  readonly idClienteAbsorbido: string;
  readonly articulosTrasladados: number;
  readonly ordenesTrasladadas: number;
}
