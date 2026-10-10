/**
 * Estado informativo de las garantias, probado sin base de datos.
 *
 * Ya no hay motor que decida quien paga: la garantia de la orden la elige
 * una persona. Lo que se prueba aqui es la INFORMACION que se le muestra
 * (vigencia, vencimiento, si aplica a quien pide el servicio) y las
 * advertencias, que no sustituyen la decision.
 */
import { describe, expect, it } from 'vitest';
import { TIPO_GARANTIA } from '@servitotal/compartido';
import {
  advertenciasDeGarantias, elegirReglaAplicable, mesesTranscurridos, resumirGarantias,
  type ContextoCobertura, type PolizaParaCobertura, type ReglaCoberturaVigente,
} from '../../src/dominio/garantias/indice.js';

const CLIENTE = 'cliente-comprador';
const OTRO_CLIENTE = 'cliente-que-lo-compro-de-segunda-mano';
const HOY = new Date('2026-09-14T10:00:00.000Z');

const REGLA: ReglaCoberturaVigente = {
  id: 'regla-v2',
  idMarca: 'marca-lg',
  idCategoria: 'categoria-refrigeracion',
  mesesCobertura: 24,
  exigeTiendaGrupo: true,
  fallasExcluidas: ['golpe', 'sobrecarga_electrica', 'humedad'],
  version: 2,
};

/** Los ajustes del articulo son parciales; el resto del contexto, opcional. */
type AjustesContexto = Partial<Omit<ContextoCobertura, 'articulo'>> & {
  articulo?: Partial<ContextoCobertura['articulo']>;
};

function contexto(ajustes: AjustesContexto = {}): ContextoCobertura {
  return {
    articulo: {
      id: 'articulo-1',
      idCliente: CLIENTE,
      idMarca: 'marca-lg',
      idCategoria: 'categoria-refrigeracion',
      idTiendaOrigen: 'tienda-curacao',
      tiendaPerteneceAlGrupo: true,
      fechaCompra: new Date('2025-06-14T00:00:00.000Z'), // 15 meses antes de HOY
      ...ajustes.articulo,
    },
    polizas: ajustes.polizas ?? [],
    regla: ajustes.regla === undefined ? REGLA : ajustes.regla,
    idClienteSolicitante: ajustes.idClienteSolicitante ?? CLIENTE,
    momento: ajustes.momento ?? HOY,
  };
}

const polizaVigente = (idClienteContratante: string | null): PolizaParaCobertura => ({
  id: 'poliza-1',
  tipo: TIPO_GARANTIA.ADICIONAL,
  vigenteDesde: new Date('2026-06-14T00:00:00.000Z'),
  vigenteHasta: new Date('2028-06-14T00:00:00.000Z'),
  idClienteContratante,
  activa: true,
});

describe('vigencia de la garantia del proveedor', () => {
  it('tienda del grupo y dentro de plazo: vigente y aplicable, sin advertencias', () => {
    const resumen = resumirGarantias(contexto());
    expect(resumen.proveedor.vigencia).toBe('vigente');
    expect(resumen.proveedor.aplicable).toBe(true);
    expect(resumen.proveedor.origen).toBe('regla');
    expect(resumen.proveedor.venceEl).toBe('2027-06-13');
    expect(advertenciasDeGarantias(resumen, TIPO_GARANTIA.PROVEEDOR)).toEqual([]);
  });

  it('respeta los meses de la regla de referencia, no un numero fijo en el codigo', () => {
    expect(resumirGarantias(contexto({ regla: { ...REGLA, mesesCobertura: 24 } })).proveedor.vigencia).toBe('vigente');
    expect(resumirGarantias(contexto({ regla: { ...REGLA, mesesCobertura: 12 } })).proveedor.vigencia).toBe('vencida');
  });

  it('el ultimo dia del plazo todavia esta vigente, el primero de mas ya no', () => {
    const justoDentro = contexto({ articulo: { fechaCompra: new Date('2024-09-15T00:00:00.000Z') } });
    const justoFuera = contexto({ articulo: { fechaCompra: new Date('2024-09-14T00:00:00.000Z') } });
    expect(resumirGarantias(justoDentro).proveedor.vigencia).toBe('vigente');
    expect(resumirGarantias(justoFuera).proveedor.vigencia).toBe('vencida');
  });

  it('comprado fuera del grupo: vigente por fecha pero con advertencia', () => {
    const resumen = resumirGarantias(contexto({ articulo: { tiendaPerteneceAlGrupo: false } }));
    expect(resumen.proveedor.aplicable).toBe(false);
    expect(advertenciasDeGarantias(resumen, TIPO_GARANTIA.PROVEEDOR)[0]).toMatch(/la elegida.*tienda del grupo/i);
  });

  it('sin fecha de compra: no registrada, y lo advierte', () => {
    const resumen = resumirGarantias(contexto({ articulo: { fechaCompra: null } }));
    expect(resumen.proveedor.vigencia).toBe('no_registrada');
    expect(advertenciasDeGarantias(resumen)[0]).toMatch(/fecha de compra/i);
  });

  it('sin regla de referencia no inventa duracion: muestra la compra y lo advierte', () => {
    const resumen = resumirGarantias(contexto({ regla: null }));
    expect(resumen.proveedor.vigencia).toBe('no_registrada');
    expect(resumen.proveedor.desde).toBe('2025-06-14');
    expect(resumen.proveedor.venceEl).toBeNull();
    expect(resumen.proveedor.motivo).toMatch(/duracion de referencia/i);
  });

  it('una garantia registrada en la ficha manda sobre la regla', () => {
    const registrada: PolizaParaCobertura = {
      id: 'prov-1', tipo: TIPO_GARANTIA.PROVEEDOR,
      vigenteDesde: new Date('2025-06-14T00:00:00.000Z'), vigenteHasta: new Date('2026-06-13T00:00:00.000Z'),
      idClienteContratante: CLIENTE, activa: true,
    };
    const resumen = resumirGarantias(contexto({ polizas: [registrada] }));
    expect(resumen.proveedor.origen).toBe('registrada');
    expect(resumen.proveedor.vigencia).toBe('vencida');
    expect(resumen.proveedor.venceEl).toBe('2026-06-13');
  });
});

describe('la garantia no se traslada al revenderse el articulo (advertencia)', () => {
  it('quien no es el comprador registrado: no aplica y lo dice', () => {
    const resumen = resumirGarantias(contexto({ idClienteSolicitante: OTRO_CLIENTE }));
    expect(resumen.proveedor.vigencia).toBe('vigente');
    expect(resumen.proveedor.aplicable).toBe(false);
    expect(resumen.proveedor.motivo).toMatch(/otra persona/i);
  });

  it('la poliza extendida tampoco se traslada', () => {
    const resumen = resumirGarantias({ ...contexto({ polizas: [polizaVigente(CLIENTE)] }), idClienteSolicitante: OTRO_CLIENTE });
    expect(resumen.adicional.vigencia).toBe('vigente');
    expect(resumen.adicional.aplicable).toBe(false);
  });

  it('una poliza contratada por otra persona no aplica al dueno actual', () => {
    const resumen = resumirGarantias(contexto({ polizas: [polizaVigente(OTRO_CLIENTE)] }));
    expect(resumen.adicional.aplicable).toBe(false);
    expect(resumen.proveedor.aplicable).toBe(true);
  });

  it('una poliza que todavia no empieza no esta vencida: esta por iniciar', () => {
    const futura: PolizaParaCobertura = {
      ...polizaVigente(CLIENTE),
      vigenteDesde: new Date('2027-02-28T00:00:00.000Z'),
      vigenteHasta: new Date('2029-02-27T00:00:00.000Z'),
    };
    const resumen = resumirGarantias(contexto({ polizas: [futura] }));
    expect(resumen.adicional).toMatchObject({ vigencia: 'por_iniciar', aplicable: false, desde: '2027-02-28' });
    expect(resumen.adicional.motivo).toMatch(/Todavia no esta vigente: cubre desde el 2027-02-28/);
  });

  it('una poliza vencida o desactivada no aplica', () => {
    const vencida: PolizaParaCobertura = {
      ...polizaVigente(CLIENTE),
      vigenteDesde: new Date('2023-01-01T00:00:00.000Z'),
      vigenteHasta: new Date('2024-01-01T00:00:00.000Z'),
    };
    expect(resumirGarantias(contexto({ polizas: [vencida] })).adicional.vigencia).toBe('vencida');
    expect(resumirGarantias(contexto({ polizas: [{ ...polizaVigente(CLIENTE), activa: false }] })).adicional.vigencia)
      .toBe('no_registrada');
  });
});

describe('advertencias', () => {
  it('la que afecta a la garantia elegida va primero', () => {
    const resumen = resumirGarantias(contexto({
      articulo: { fechaCompra: new Date('2020-01-01T00:00:00.000Z') },
      polizas: [polizaVigente(OTRO_CLIENTE)],
    }));
    const advertencias = advertenciasDeGarantias(resumen, TIPO_GARANTIA.ADICIONAL);
    expect(advertencias[0]).toMatch(/^Garantia adicional \(la elegida\)/);
    expect(advertencias.some((texto) => texto.startsWith('Garantia del proveedor'))).toBe(true);
  });

  it('que no haya garantia adicional no es advertencia si no se eligio', () => {
    expect(advertenciasDeGarantias(resumirGarantias(contexto()), TIPO_GARANTIA.PARTICULAR)).toEqual([]);
  });
});

describe('eleccion de la regla aplicable', () => {
  const reglas = [
    { id: 'general', idMarca: null, idCategoria: null },
    { id: 'por-categoria', idMarca: null, idCategoria: 'cat-1' },
    { id: 'por-marca', idMarca: 'marca-1', idCategoria: null },
    { id: 'especifica', idMarca: 'marca-1', idCategoria: 'cat-1' },
  ];

  it('prefiere la mas especifica y va bajando', () => {
    expect(elegirReglaAplicable(reglas, 'marca-1', 'cat-1')?.id).toBe('especifica');
    expect(elegirReglaAplicable(reglas, 'marca-2', 'cat-1')?.id).toBe('por-categoria');
    expect(elegirReglaAplicable(reglas, 'marca-1', 'cat-2')?.id).toBe('por-marca');
    expect(elegirReglaAplicable(reglas, 'marca-2', 'cat-2')?.id).toBe('general');
  });

  it('sin ninguna regla aplicable devuelve nulo en lugar de inventar una', () => {
    expect(elegirReglaAplicable([], 'marca-1', 'cat-1')).toBeNull();
  });
});

describe('conteo de meses', () => {
  it('cuenta meses completos, no fracciones', () => {
    expect(mesesTranscurridos(new Date('2025-01-15'), new Date('2026-01-15'))).toBe(12);
    expect(mesesTranscurridos(new Date('2025-01-15'), new Date('2026-01-14'))).toBe(11);
    expect(mesesTranscurridos(new Date('2025-01-31'), new Date('2025-02-28'))).toBe(0);
  });
});
