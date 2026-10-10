/**
 * Estado de las dos garantias de un articulo, para mostrarlo antes de abrir
 * la orden y en la ficha del articulo.
 *
 * Distingue dos preguntas que no son la misma:
 *   - VIGENCIA por fecha: ¿la garantia esta dentro de sus fechas?
 *   - APLICABILIDAD: ¿cubre a ESTE solicitante? (comprador registrado,
 *     tienda exigida por la regla, poliza a su nombre).
 * Una garantia puede estar vigente por fecha y no aplicar (el aparato
 * cambio de dueno). Y ninguna de las dos dice que una reparacion concreta
 * este cubierta: eso lo decide el diagnostico (golpes, mal uso, fallas
 * excluidas).
 *
 * Usa las mismas especificaciones que el motor: no es un segundo sistema
 * de decision. Codigo puro.
 */
import { TIPO_GARANTIA, mesesDeLaVigencia, ultimoDiaCubierto } from '@servitotal/compartido';
import type { ContextoCobertura } from './contexto-cobertura.js';
import {
  cubreElDia, cumpleLaExigenciaDeTienda, dentroDelPlazoDeFabrica, esElCompradorRegistrado,
  garantiasDeProveedorRegistradas, tienePolizaExtendidaVigente,
} from './especificaciones-cobertura.js';

export type VigenciaGarantia = 'vigente' | 'vencida' | 'no_registrada';

export interface EstadoDeGarantia {
  readonly vigencia: VigenciaGarantia;
  /** Desde cuando cubre: compra o contratacion (AAAA-MM-DD). */
  readonly desde: string | null;
  /** Duracion en meses, si las fechas corresponden a meses exactos. */
  readonly meses: number | null;
  /** Ultimo dia cubierto (AAAA-MM-DD), si se conoce. */
  readonly venceEl: string | null;
  /** De donde sale la fecha: registrada en la ficha, o calculada por la regla. */
  readonly origen: 'registrada' | 'regla' | null;
  /** Si se puede elegir para esta orden. */
  readonly aplicable: boolean;
  /** Por que no aplica, si no aplica. */
  readonly motivo: string | null;
}

export interface ResumenGarantias {
  readonly proveedor: EstadoDeGarantia;
  readonly adicional: EstadoDeGarantia;
}

const fecha = (valor: Date): string => valor.toISOString().slice(0, 10);

function vigenciaEntre(desde: Date, hasta: Date, momento: Date): VigenciaGarantia {
  return cubreElDia(desde, hasta, momento) ? 'vigente' : 'vencida';
}

export function resumirGarantias(contexto: ContextoCobertura): ResumenGarantias {
  const comprador = esElCompradorRegistrado.seCumple(contexto);

  // ── proveedor ──
  const registradas = [...garantiasDeProveedorRegistradas(contexto)]
    .sort((una, otra) => otra.vigenteHasta.getTime() - una.vigenteHasta.getTime());
  let proveedorBase: Pick<EstadoDeGarantia, 'vigencia' | 'venceEl' | 'origen' | 'desde' | 'meses'>;
  if (registradas.length > 0) {
    const vigente = registradas.find((p) => vigenciaEntre(p.vigenteDesde, p.vigenteHasta, contexto.momento) === 'vigente');
    const elegida = vigente ?? registradas[0]!;
    proveedorBase = {
      vigencia: vigente === undefined ? 'vencida' : 'vigente',
      desde: fecha(elegida.vigenteDesde),
      meses: mesesDeLaVigencia(fecha(elegida.vigenteDesde), fecha(elegida.vigenteHasta)),
      venceEl: fecha(elegida.vigenteHasta),
      origen: 'registrada',
    };
  } else if (contexto.articulo.fechaCompra !== null) {
    // El mismo computo que la regla: cubre mientras no se cumplan los meses.
    const compra = fecha(contexto.articulo.fechaCompra);
    const meses = contexto.regla.mesesCobertura;
    proveedorBase = {
      vigencia: dentroDelPlazoDeFabrica.seCumple(contexto) ? 'vigente' : 'vencida',
      desde: compra,
      meses,
      venceEl: meses >= 1 ? ultimoDiaCubierto(compra, meses) : null,
      origen: 'regla',
    };
  } else {
    proveedorBase = { vigencia: 'no_registrada', desde: null, meses: null, venceEl: null, origen: null };
  }
  const tienda = cumpleLaExigenciaDeTienda.seCumple(contexto);
  const proveedorAplica = proveedorBase.vigencia === 'vigente' && comprador && tienda;
  const proveedor: EstadoDeGarantia = {
    ...proveedorBase,
    aplicable: proveedorAplica,
    motivo: proveedorAplica ? null
      : proveedorBase.vigencia === 'no_registrada' ? 'No hay fecha de compra ni garantia de proveedor registrada.'
      : proveedorBase.vigencia === 'vencida' ? `Vencio el ${proveedorBase.venceEl ?? ''}.`
      : !comprador ? 'El articulo esta a nombre de otra persona; la garantia no se traslada.'
      : 'La regla exige que se haya comprado en una tienda del grupo.',
  };

  // ── adicional (poliza extendida) ──
  const polizas = contexto.polizas
    .filter((p) => p.activa && p.tipo === TIPO_GARANTIA.ADICIONAL)
    .sort((una, otra) => otra.vigenteHasta.getTime() - una.vigenteHasta.getTime());
  const adicionalAplica = tienePolizaExtendidaVigente.seCumple(contexto);
  let adicional: EstadoDeGarantia;
  if (polizas.length === 0) {
    adicional = {
      vigencia: 'no_registrada', desde: null, meses: null, venceEl: null, origen: null, aplicable: false,
      motivo: 'El articulo no tiene garantia adicional registrada.',
    };
  } else {
    const vigente = polizas.find((p) => vigenciaEntre(p.vigenteDesde, p.vigenteHasta, contexto.momento) === 'vigente');
    const elegida = vigente ?? polizas[0]!;
    adicional = {
      vigencia: vigente === undefined ? 'vencida' : 'vigente',
      desde: fecha(elegida.vigenteDesde),
      meses: mesesDeLaVigencia(fecha(elegida.vigenteDesde), fecha(elegida.vigenteHasta)),
      venceEl: fecha(elegida.vigenteHasta),
      origen: 'registrada',
      aplicable: adicionalAplica,
      motivo: adicionalAplica ? null
        : vigente === undefined ? `Vencio el ${fecha(elegida.vigenteHasta)}.`
        : 'La poliza esta a nombre de otra persona.',
    };
  }

  return { proveedor, adicional };
}
