/**
 * El motor de garantias, probado sin base de datos.
 *
 * Cada prueba fija una regla del pliego. Si alguna deja de pasar, es que
 * cambio una regla del negocio, no un detalle de implementacion.
 */
import { describe, expect, it } from 'vitest';
import { TIPO_GARANTIA } from '@servitotal/compartido';
import {
  elegirReglaAplicable, evaluarCobertura, mesesTranscurridos, reevaluarTrasDiagnostico,
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
    regla: ajustes.regla ?? REGLA,
    idClienteSolicitante: ajustes.idClienteSolicitante ?? CLIENTE,
    momento: ajustes.momento ?? HOY,
    fallaReal: ajustes.fallaReal,
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

describe('evaluacion inicial', () => {
  it('poliza extendida vigente manda sobre todo lo demas', () => {
    const resultado = evaluarCobertura(contexto({ polizas: [polizaVigente(CLIENTE)] }));
    expect(resultado.tipo).toBe(TIPO_GARANTIA.ADICIONAL);
    expect(resultado.idReglaCobertura).toBe('regla-v2');
  });

  it('tienda del grupo y dentro de plazo da garantia del fabricante', () => {
    expect(evaluarCobertura(contexto()).tipo).toBe(TIPO_GARANTIA.PROVEEDOR);
  });

  it('fuera del plazo de la regla lo paga el cliente', () => {
    const viejo = contexto({ articulo: { fechaCompra: new Date('2023-01-14T00:00:00.000Z') } });
    const resultado = evaluarCobertura(viejo);
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(resultado.motivo).toMatch(/24 meses/);
  });

  it('comprado fuera del grupo lo paga el cliente', () => {
    const externo = contexto({ articulo: { tiendaPerteneceAlGrupo: false } });
    const resultado = evaluarCobertura(externo);
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(resultado.motivo).toMatch(/tienda del grupo/);
  });

  it('sin fecha de compra lo paga el cliente, e invita a presentar la factura', () => {
    const resultado = evaluarCobertura(contexto({ articulo: { fechaCompra: null } }));
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(resultado.motivo).toMatch(/factura/);
  });

  it('si la regla no exige tienda del grupo, una externa si queda cubierta', () => {
    const resultado = evaluarCobertura(contexto({
      articulo: { tiendaPerteneceAlGrupo: false },
      regla: { ...REGLA, exigeTiendaGrupo: false },
    }));
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PROVEEDOR);
  });

  it('respeta los meses de la regla y no un numero fijo en el codigo', () => {
    // El mismo articulo de 15 meses: cubierto con 24, no con 12.
    expect(evaluarCobertura(contexto({ regla: { ...REGLA, mesesCobertura: 24 } })).tipo)
      .toBe(TIPO_GARANTIA.PROVEEDOR);
    expect(evaluarCobertura(contexto({ regla: { ...REGLA, mesesCobertura: 12 } })).tipo)
      .toBe(TIPO_GARANTIA.PARTICULAR);
  });

  it('el ultimo dia del plazo todavia esta cubierto, el primero de mas ya no', () => {
    const justoDentro = contexto({
      articulo: { fechaCompra: new Date('2024-09-15T00:00:00.000Z') }, // 23 meses y algo
    });
    const justoFuera = contexto({
      articulo: { fechaCompra: new Date('2024-09-14T00:00:00.000Z') }, // 24 meses exactos
    });
    expect(evaluarCobertura(justoDentro).tipo).toBe(TIPO_GARANTIA.PROVEEDOR);
    expect(evaluarCobertura(justoFuera).tipo).toBe(TIPO_GARANTIA.PARTICULAR);
  });

  it('explica la decision condicion por condicion', () => {
    const resultado = evaluarCobertura(contexto());
    const nombres = resultado.desglose.map((parte) => parte.nombre);
    expect(nombres.length).toBeGreaterThan(4);
    expect(resultado.desglose.find((p) => p.nombre.includes('comprador registrado'))?.seCumplio).toBe(true);
  });
});

describe('la garantia no se traslada al revenderse el articulo', () => {
  it('quien no es el comprador registrado paga la reparacion', () => {
    const resultado = evaluarCobertura(contexto({ idClienteSolicitante: OTRO_CLIENTE }));
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(resultado.motivo).toMatch(/cambia de dueno|otra persona/i);
  });

  it('la poliza extendida tampoco se traslada', () => {
    const resultado = evaluarCobertura({
      ...contexto({ polizas: [polizaVigente(CLIENTE)] }),
      idClienteSolicitante: OTRO_CLIENTE,
    });
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
  });

  it('una poliza contratada por otra persona no cubre al dueno actual', () => {
    const resultado = evaluarCobertura(contexto({ polizas: [polizaVigente(OTRO_CLIENTE)] }));
    // Sigue cubierto por fabricante, pero no por la poliza ajena.
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PROVEEDOR);
  });

  it('una poliza vencida no cubre', () => {
    const vencida: PolizaParaCobertura = {
      ...polizaVigente(CLIENTE),
      vigenteDesde: new Date('2023-01-01T00:00:00.000Z'),
      vigenteHasta: new Date('2024-01-01T00:00:00.000Z'),
    };
    const fueraDePlazo = contexto({
      polizas: [vencida], articulo: { fechaCompra: new Date('2022-01-01T00:00:00.000Z') },
    });
    expect(evaluarCobertura(fueraDePlazo).tipo).toBe(TIPO_GARANTIA.PARTICULAR);
  });

  it('una poliza desactivada no cubre', () => {
    const resultado = evaluarCobertura(contexto({
      polizas: [{ ...polizaVigente(CLIENTE), activa: false }],
      articulo: { fechaCompra: new Date('2020-01-01T00:00:00.000Z') },
    }));
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
  });
});

describe('reevaluacion tras el diagnostico', () => {
  it('una falla excluida pasa la orden a particular y la detiene', () => {
    const resultado = reevaluarTrasDiagnostico(
      contexto({ fallaReal: 'Tarjeta quemada por sobrecarga electrica en la red' }),
      TIPO_GARANTIA.PROVEEDOR,
    );
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(resultado.detieneLaOrden).toBe(true);
    expect(resultado.motivo).toMatch(/detenida/);
  });

  it('compara sin acentos, sin guiones bajos y sin importar mayusculas', () => {
    for (const falla of ['SOBRECARGA ELECTRICA', 'sobrecarga_electrica', 'Sobrecarga eléctrica']) {
      const resultado = reevaluarTrasDiagnostico(contexto({ fallaReal: falla }), TIPO_GARANTIA.PROVEEDOR);
      expect(resultado.tipo, falla).toBe(TIPO_GARANTIA.PARTICULAR);
    }
  });

  it('una falla cubierta deja la garantia como estaba y no detiene nada', () => {
    const resultado = reevaluarTrasDiagnostico(
      contexto({ fallaReal: 'Compresor en corto por desgaste' }), TIPO_GARANTIA.PROVEEDOR,
    );
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PROVEEDOR);
    expect(resultado.detieneLaOrden).toBe(false);
  });

  it('una orden que ya era particular no se detiene por el diagnostico', () => {
    const resultado = reevaluarTrasDiagnostico(
      contexto({ fallaReal: 'Golpe en la puerta' }), TIPO_GARANTIA.PARTICULAR,
    );
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(resultado.detieneLaOrden).toBe(false);
  });

  it('la reevaluacion nunca mejora la cobertura por su cuenta', () => {
    // Articulo fuera de plazo que entro como particular: aunque la falla
    // este cubierta, sigue siendo particular.
    const viejo = contexto({
      articulo: { fechaCompra: new Date('2020-01-01T00:00:00.000Z') },
      fallaReal: 'Compresor en corto',
    });
    expect(reevaluarTrasDiagnostico(viejo, TIPO_GARANTIA.PARTICULAR).tipo).toBe(TIPO_GARANTIA.PARTICULAR);
  });

  it('detiene la orden si la reevaluacion la degrada por otro motivo', () => {
    // La ficha se corrigio: ahora consta comprada fuera del grupo.
    const corregido = contexto({
      articulo: { tiendaPerteneceAlGrupo: false },
      fallaReal: 'Compresor en corto',
    });
    const resultado = reevaluarTrasDiagnostico(corregido, TIPO_GARANTIA.PROVEEDOR);
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PARTICULAR);
    expect(resultado.detieneLaOrden).toBe(true);
  });

  it('sin falla real no excluye nada', () => {
    const resultado = reevaluarTrasDiagnostico(contexto({ fallaReal: '   ' }), TIPO_GARANTIA.PROVEEDOR);
    expect(resultado.tipo).toBe(TIPO_GARANTIA.PROVEEDOR);
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
