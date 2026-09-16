/**
 * El catalogo no es decoracion: de el dependen el plazo que se le promete
 * al cliente (si la pieza se consigue hoy o se importa), lo que se le
 * reclama a la marca y cuanto dinero queda inmovilizado en bodega. Estas
 * pruebas cuidan que siga siendo coherente cuando alguien lo edite.
 */
import { describe, expect, it } from 'vitest';
import { VIA_ABASTECIMIENTO } from '@servitotal/compartido';
import {
  CATEGORIAS_POR_MARCA, FAMILIAS, PREFIJO_CATEGORIA, generarCatalogo,
} from '../../src/infraestructura/semillas/catalogo-repuestos.js';

const MARCAS = Object.keys(CATEGORIAS_POR_MARCA);

describe('catalogo de repuestos', () => {
  const catalogo = generarCatalogo(MARCAS);

  it('no repite codigos', () => {
    // `repuesto.codigo` es UNIQUE: un choque rompe la siembra entera.
    expect(new Set(catalogo.map((repuesto) => repuesto.codigo)).size).toBe(catalogo.length);
  });

  it('los codigos se leen sin manual: categoria, familia, correlativo', () => {
    for (const repuesto of catalogo) {
      expect(repuesto.codigo).toMatch(/^[A-Z]{3}-[A-Z0-9]{3}-\d{3}$/);
      expect(repuesto.codigo.startsWith(`${PREFIJO_CATEGORIA[repuesto.categoria]}-`)).toBe(true);
    }
  });

  it('cada familia declara una categoria que existe', () => {
    for (const familia of FAMILIAS) {
      expect(Object.keys(PREFIJO_CATEGORIA)).toContain(familia.categoria);
    }
  });

  it('no inventa un compresor Sony ni una television Oster', () => {
    // Pedir una pieza que el fabricante no hace es una orden parada dos
    // semanas por nada.
    for (const repuesto of catalogo) {
      if (repuesto.marca === null) continue;
      expect(
        CATEGORIAS_POR_MARCA[repuesto.marca],
        `${repuesto.codigo}: ${repuesto.marca} no fabrica ${repuesto.categoria}`,
      ).toContain(repuesto.categoria);
    }
  });

  it('la pieza universal se cataloga una sola vez y sin marca', () => {
    for (const familia of FAMILIAS.filter((una) => una.universal)) {
      const generados = catalogo.filter((repuesto) =>
        repuesto.codigo.startsWith(`${PREFIJO_CATEGORIA[familia.categoria]}-${familia.sigla}-`));
      expect(generados).toHaveLength(1);
      expect(generados[0]?.marca).toBeNull();
    }
  });

  it('la pieza de marca se cataloga una vez por cada marca que la fabrica', () => {
    for (const familia of FAMILIAS.filter((una) => !una.universal)) {
      const esperadas = MARCAS.filter((marca) =>
        (CATEGORIAS_POR_MARCA[marca] ?? []).includes(familia.categoria));
      const generados = catalogo.filter((repuesto) =>
        repuesto.codigo.startsWith(`${PREFIJO_CATEGORIA[familia.categoria]}-${familia.sigla}-`));
      expect(generados).toHaveLength(esperadas.length);
    }
  });

  it('los rangos de precio son rangos: minimo positivo y no mayor que el maximo', () => {
    for (const familia of FAMILIAS) {
      expect(familia.precioMinimo).toBeGreaterThan(0);
      expect(familia.precioMaximo).toBeGreaterThanOrEqual(familia.precioMinimo);
    }
  });

  it('lo caro e importado no se acumula en bodega', () => {
    // Una tarjeta de C$7000 con minimo 6 es capital muerto; el minimo alto
    // es para lo barato y de alta rotacion.
    for (const familia of FAMILIAS) {
      if (familia.via === VIA_ABASTECIMIENTO.PEDIDO_PROVEEDOR) {
        expect(
          familia.stockMinimo,
          `${familia.sigla} se importa y declara minimo ${familia.stockMinimo}`,
        ).toBeLessThanOrEqual(3);
      }
      if (familia.precioMinimo >= 2000) {
        expect(familia.stockMinimo).toBeLessThanOrEqual(3);
      }
    }
  });

  it('cubre las siete categorias de articulo que atiende el taller', () => {
    const cubiertas = new Set(FAMILIAS.map((familia) => familia.categoria));
    expect([...cubiertas].sort()).toEqual(Object.keys(PREFIJO_CATEGORIA).sort());
  });

  it('el gas se mide en libras, no en unidades', () => {
    const gases = catalogo.filter((repuesto) => repuesto.descripcion.includes('Gas refrigerante'));
    expect(gases.length).toBeGreaterThan(0);
    for (const gas of gases) expect(gas.unidad).toBe('lb');
  });

  it('una marca desconocida no aporta repuestos en vez de romper la siembra', () => {
    const conIntrusa = generarCatalogo([...MARCAS, 'MarcaQueNadieRegistro']);
    expect(conIntrusa.filter((repuesto) => repuesto.marca === 'MarcaQueNadieRegistro')).toHaveLength(0);
  });
});
