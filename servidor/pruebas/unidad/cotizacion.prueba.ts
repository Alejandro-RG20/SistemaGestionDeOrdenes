/**
 * Calculo de la cotizacion (paquete compartido): el mismo que usa el panel
 * para la vista previa y el servidor para guardar.
 */
import { describe, expect, it } from 'vitest';
import {
  ErrorDeCotizacion, TIPO_GARANTIA, calcularConcepto, calcularCotizacion, hayAjustes, responsableDePago,
} from '@servitotal/compartido';

const linea = (codigo: string, cantidad: number, precio: number | null) => ({
  idRepuesto: `id-${codigo}`, codigo, descripcion: codigo, cantidad,
  precioInventario: precio, precioUnitario: precio, motivoPrecio: null,
});

describe('cantidades, subtotales y totales', () => {
  it('subtotal = cantidad x precio; total = mano de obra + visita + repuestos', () => {
    const detalle = calcularCotizacion({
      tipoGarantia: TIPO_GARANTIA.PARTICULAR, manoObra: 500, visita: 150,
      lineas: [linea('CAP-01', 2, 125.5), linea('TER-02', 3, 33.33)],
    });
    expect(detalle.repuestos.lineas.map((l) => l.subtotal)).toEqual([251, 99.99]);
    expect(detalle.repuestos.final).toBe(350.99);
    expect(detalle.totalOriginal).toBe(1000.99);
    expect(detalle.totalFinal).toBe(1000.99);
    expect(detalle.pagaCliente).toBe(1000.99);
  });

  it('sin errores de coma flotante', () => {
    const detalle = calcularCotizacion({
      tipoGarantia: TIPO_GARANTIA.PARTICULAR, manoObra: 0.1, visita: 0.2, lineas: [],
    });
    expect(detalle.totalFinal).toBe(0.3);
  });

  it('un repuesto sin precio queda pendiente y no suma un importe inventado', () => {
    const detalle = calcularCotizacion({
      tipoGarantia: TIPO_GARANTIA.PARTICULAR, manoObra: 100, visita: 0,
      lineas: [linea('SIN-01', 1, null), linea('CON-01', 1, 40)],
    });
    expect(detalle.preciosPendientes).toEqual(['SIN-01']);
    expect(detalle.repuestos.lineas[0]!.subtotal).toBeNull();
    expect(detalle.repuestos.final).toBe(40);
  });
});

describe('quien paga', () => {
  it('proveedor y garantia adicional cubren todo: el cliente paga 0', () => {
    for (const tipo of [TIPO_GARANTIA.PROVEEDOR, TIPO_GARANTIA.ADICIONAL]) {
      const detalle = calcularCotizacion({ tipoGarantia: tipo, manoObra: 400, visita: 150, lineas: [linea('A', 1, 60)] });
      expect(detalle.totalFinal).toBe(610);
      expect(detalle.pagaCliente).toBe(0);
    }
    expect(responsableDePago(TIPO_GARANTIA.PROVEEDOR)).toBe('proveedor');
    expect(responsableDePago(TIPO_GARANTIA.ADICIONAL)).toBe('garantia_adicional');
    expect(responsableDePago(TIPO_GARANTIA.PARTICULAR)).toBe('cliente');
  });
});

describe('descuentos y exoneraciones', () => {
  const base = { tipoGarantia: TIPO_GARANTIA.PARTICULAR, manoObra: 500, visita: 200, lineas: [linea('A', 2, 100)] };

  it('precio completo', () => {
    const detalle = calcularCotizacion(base);
    expect(detalle.totalFinal).toBe(900);
    expect(hayAjustes(base)).toBe(false);
  });

  it('mano de obra exonerada', () => {
    const detalle = calcularCotizacion({ ...base, ajustes: { manoObra: { tipo: 'exoneracion_total' } } });
    expect(detalle.manoObra).toMatchObject({ original: 500, descuento: 500, final: 0 });
    expect(detalle.totalOriginal).toBe(900);
    expect(detalle.totalFinal).toBe(400);
  });

  it('visita exonerada', () => {
    const detalle = calcularCotizacion({ ...base, ajustes: { visita: { tipo: 'exoneracion_total' } } });
    expect(detalle.visita.final).toBe(0);
    expect(detalle.totalFinal).toBe(700);
  });

  it('descuentos parciales por porcentaje y por importe', () => {
    const detalle = calcularCotizacion({
      ...base,
      ajustes: { manoObra: { tipo: 'porcentaje', valor: 10 }, repuestos: { tipo: 'importe', valor: 50 } },
    });
    expect(detalle.manoObra.final).toBe(450);
    expect(detalle.repuestos.final).toBe(150);
    expect(detalle.totalFinal).toBe(800);
    expect(hayAjustes({ ...base, ajustes: { manoObra: { tipo: 'porcentaje', valor: 10 } } })).toBe(true);
  });

  it('no permite descuentos mayores que el concepto, porcentajes fuera de rango ni importes negativos', () => {
    expect(() => calcularConcepto('visita', 200, { tipo: 'importe', valor: 250 })).toThrow(ErrorDeCotizacion);
    expect(() => calcularConcepto('visita', 200, { tipo: 'porcentaje', valor: 120 })).toThrow(/100 %/);
    expect(() => calcularConcepto('manoObra', -1)).toThrow(ErrorDeCotizacion);
    expect(() => calcularCotizacion({ ...base, lineas: [linea('A', 0, 10)] })).toThrow(/entero positivo/);
  });

  it('un precio cotizado distinto del inventario es un ajuste', () => {
    expect(hayAjustes({ lineas: [{ ...linea('A', 1, 100), precioUnitario: 80 }] })).toBe(true);
  });
});
