/**
 * Paso 6: 3 000 clientes con su historico de telefonos y direcciones.
 *
 * Los datos del cliente son vivos: un telefono anterior queda con
 * vigente = false y fecha de cierre, no se borra (RN-22).
 */
import type { PoolClient } from 'pg';
import { CODIGO_ROL } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { comoFecha, sumarDias } from './aleatorio.js';
import { APELLIDOS, NOMBRES_PILA, REFERENCIAS_UBICACION } from './nombres.js';
import { usuariosDe, type ContextoSiembra, type ReferenciaCliente } from './contexto.js';

export const CANTIDAD_CLIENTES = 3_000;

const CORREOS = ['gmail.com', 'hotmail.com', 'yahoo.es', 'outlook.com'] as const;

function telefonoNicaragua(azar: ContextoSiembra['azar']): string {
  const prefijo = azar.elegir(['8', '7', '5']);
  return `${prefijo}${String(azar.entero(0, 9_999_999)).padStart(7, '0')}`;
}

export async function sembrarClientes(cliente: PoolClient, contexto: ContextoSiembra): Promise<void> {
  const { azar } = contexto;
  const agentes = usuariosDe(contexto, CODIGO_ROL.AGENTE_TELEFONIA);

  const clientes: ReferenciaCliente[] = [];
  const filasCliente: unknown[][] = [];
  const filasTelefono: unknown[][] = [];
  const filasDireccion: unknown[][] = [];
  const telefonosVigentes = new Set<string>();

  for (let i = 0; i < CANTIDAD_CLIENTES; i += 1) {
    const id = azar.uuid();
    const nombres = azar.elegir(NOMBRES_PILA);
    const apellidos = `${azar.elegir(APELLIDOS)} ${azar.elegir(APELLIDOS)}`;
    const creadoEn = azar.fechaEntre(sumarDias(contexto.inicioVentana, -500), contexto.finVentana);

    filasCliente.push([
      id, contexto.idCentro, nombres, apellidos,
      azar.booleano(0.8) ? `${azar.entero(100, 999)}-${azar.entero(100_000, 999_999)}-${azar.entero(1000, 9999)}X` : null,
      azar.booleano(0.45) ? `${nombres.toLowerCase()}${azar.entero(1, 99)}@${azar.elegir(CORREOS)}` : null,
      null, true, creadoEn, azar.elegir(agentes).id,
    ]);

    // Telefono vigente. El indice unico ux_telefono_vigente lo exige distinto
    // por cliente; se evita ademas repetirlo entre clientes.
    let vigente = telefonoNicaragua(azar);
    while (telefonosVigentes.has(vigente)) vigente = telefonoNicaragua(azar);
    telefonosVigentes.add(vigente);
    filasTelefono.push([azar.uuid(), id, vigente, 'celular', true, comoFecha(creadoEn), null]);

    // Uno de cada cinco clientes cambio de numero: el anterior se conserva.
    if (azar.booleano(0.2)) {
      const cierre = azar.fechaEntre(creadoEn, contexto.finVentana);
      filasTelefono.push([
        azar.uuid(), id, telefonoNicaragua(azar), 'celular', false,
        comoFecha(creadoEn), comoFecha(cierre),
      ]);
    }

    const zona = azar.elegir(contexto.zonas);
    const detalle = `${zona.nombre}, casa ${azar.entero(1, 480)}`;
    const referencia = azar.elegir(REFERENCIAS_UBICACION);
    filasDireccion.push([azar.uuid(), id, zona.id, detalle, referencia, true, true, comoFecha(creadoEn), null]);

    // Uno de cada ocho se mudo: la direccion anterior queda cerrada.
    if (azar.booleano(0.125)) {
      const zonaAnterior = azar.elegir(contexto.zonas);
      const cierre = azar.fechaEntre(creadoEn, contexto.finVentana);
      filasDireccion.push([
        azar.uuid(), id, zonaAnterior.id, `${zonaAnterior.nombre}, casa ${azar.entero(1, 480)}`,
        azar.elegir(REFERENCIAS_UBICACION), false, false, comoFecha(creadoEn), comoFecha(cierre),
      ]);
    }

    clientes.push({ id, telefonoVigente: vigente, direccion: detalle, referenciaUbicacion: referencia, idZona: zona.id });
  }

  await copiarFilas(
    cliente,
    'cliente',
    ['id', 'id_centro', 'nombres', 'apellidos', 'identificacion', 'correo',
      'id_cliente_principal', 'activo', 'creado_en', 'creado_por'],
    filasCliente as never,
  );
  await copiarFilas(
    cliente,
    'cliente_telefono',
    ['id', 'id_cliente', 'numero', 'tipo', 'vigente', 'desde', 'hasta'],
    filasTelefono as never,
  );
  await copiarFilas(
    cliente,
    'cliente_direccion',
    ['id', 'id_cliente', 'id_zona', 'detalle', 'referencia', 'principal', 'vigente', 'desde', 'hasta'],
    filasDireccion as never,
  );

  contexto.clientes = clientes;
}
