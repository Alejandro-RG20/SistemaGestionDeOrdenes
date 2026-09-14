/** Filas de cliente y su traduccion a los contratos publicos. */
import type {
  DireccionCliente, FichaCliente, ResumenCliente, TelefonoCliente,
} from '@servitotal/compartido';

export interface FilaCliente {
  readonly id: string;
  readonly nombres: string;
  readonly apellidos: string | null;
  readonly identificacion: string | null;
  readonly correo: string | null;
  readonly telefono_vigente: string | null;
  readonly direccion_principal: string | null;
  readonly activo: boolean;
  readonly id_cliente_principal: string | null;
  readonly creado_en: Date;
}

export interface FilaTelefono {
  readonly id: string;
  readonly id_cliente: string;
  readonly numero: string;
  readonly tipo: string | null;
  readonly vigente: boolean;
  readonly desde: Date;
  readonly hasta: Date | null;
}

export interface FilaDireccion {
  readonly id: string;
  readonly id_cliente: string;
  readonly id_zona: string | null;
  readonly zona: string | null;
  readonly detalle: string;
  readonly referencia: string | null;
  readonly principal: boolean;
  readonly vigente: boolean;
  readonly desde: Date;
  readonly hasta: Date | null;
}

const comoFecha = (valor: Date | null): string | null => valor?.toISOString().slice(0, 10) ?? null;

export function aResumenCliente(fila: FilaCliente): ResumenCliente {
  return {
    id: fila.id,
    nombres: fila.nombres,
    apellidos: fila.apellidos,
    identificacion: fila.identificacion,
    correo: fila.correo,
    telefonoVigente: fila.telefono_vigente,
    direccionPrincipal: fila.direccion_principal,
    activo: fila.activo,
    idClientePrincipal: fila.id_cliente_principal,
    creadoEn: fila.creado_en.toISOString(),
  };
}

export function aTelefono(fila: FilaTelefono): TelefonoCliente {
  return {
    id: fila.id, numero: fila.numero, tipo: fila.tipo, vigente: fila.vigente,
    desde: comoFecha(fila.desde)!, hasta: comoFecha(fila.hasta),
  };
}

export function aDireccion(fila: FilaDireccion): DireccionCliente {
  return {
    id: fila.id, idZona: fila.id_zona, zona: fila.zona, detalle: fila.detalle,
    referencia: fila.referencia, principal: fila.principal, vigente: fila.vigente,
    desde: comoFecha(fila.desde)!, hasta: comoFecha(fila.hasta),
  };
}

export function aFichaCliente(
  fila: FilaCliente,
  telefonos: readonly FilaTelefono[],
  direcciones: readonly FilaDireccion[],
  cantidadArticulos: number,
  cantidadOrdenes: number,
): FichaCliente {
  return {
    ...aResumenCliente(fila),
    telefonos: telefonos.map(aTelefono),
    direcciones: direcciones.map(aDireccion),
    cantidadArticulos,
    cantidadOrdenes,
  };
}
