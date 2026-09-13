import { describe, expect, it } from 'vitest';
import { ESTADO_ORDEN, ESTADOS_ORDEN, type EstadoOrden } from '@servitotal/compartido';
import { Aleatorio } from '../../src/infraestructura/semillas/aleatorio.js';
import {
  CANTIDAD_ORDENES, REPARTO_ESTADOS, construirCadena, construirObjetivos,
} from '../../src/infraestructura/semillas/distribucion-estados.js';

describe('reparto de estados', () => {
  it('cubre los 13 estados del esquema, sin sobrar ni faltar ninguno', () => {
    expect(Object.keys(REPARTO_ESTADOS).sort()).toEqual([...ESTADOS_ORDEN].sort());
    expect(ESTADOS_ORDEN).toHaveLength(13);
  });

  it('suma exactamente las 30 000 ordenes pedidas', () => {
    const total = Object.values(REPARTO_ESTADOS).reduce((suma, cantidad) => suma + cantidad, 0);
    expect(total).toBe(CANTIDAD_ORDENES);
  });

  it('genera la lista de objetivos con el reparto exacto', () => {
    const objetivos = construirObjetivos(new Aleatorio(1));
    expect(objetivos).toHaveLength(CANTIDAD_ORDENES);
    for (const [estado, cantidad] of Object.entries(REPARTO_ESTADOS)) {
      expect(objetivos.filter((objetivo) => objetivo === estado)).toHaveLength(cantidad);
    }
  });
});

describe('cadena de estados', () => {
  const azar = new Aleatorio(42);
  const cadenas = Array.from({ length: 4_000 }, () =>
    construirCadena(azar, azar.elegir(ESTADOS_ORDEN)));

  it('siempre empieza en registrada', () => {
    for (const cadena of cadenas) expect(cadena.estados[0]).toBe(ESTADO_ORDEN.REGISTRADA);
  });

  it('termina en el estado objetivo pedido', () => {
    for (const estado of ESTADOS_ORDEN) {
      const cadena = construirCadena(new Aleatorio(estado.length * 13), estado);
      expect(cadena.estados.at(-1)).toBe(estado);
    }
  });

  it('nunca repite un estado dentro de la misma cadena', () => {
    for (const cadena of cadenas) {
      expect(new Set(cadena.estados).size).toBe(cadena.estados.length);
    }
  });

  it('convierte de ruta a taller, nunca al reves', () => {
    for (const cadena of cadenas) {
      const posicionRuta = cadena.estados.indexOf(ESTADO_ORDEN.EN_RUTA);
      const posicionTaller = cadena.estados.indexOf(ESTADO_ORDEN.EN_COLA_TALLER);
      if (posicionRuta >= 0 && posicionTaller >= 0) {
        expect(posicionRuta).toBeLessThan(posicionTaller);
      }
      // Una orden que nunca estuvo en ruta no puede marcarse como convertida.
      if (cadena.convertida) expect(posicionRuta).toBeGreaterThanOrEqual(0);
    }
  });

  it('no espera autorizacion de una cotizacion que no existe', () => {
    for (const cadena of cadenas) {
      const posicionEspera = cadena.estados.indexOf(ESTADO_ORDEN.ESPERANDO_AUTORIZACION);
      if (posicionEspera < 0) continue;
      const posicionCotizada = cadena.estados.indexOf(ESTADO_ORDEN.COTIZADA);
      expect(posicionCotizada).toBeGreaterThanOrEqual(0);
      expect(posicionCotizada).toBeLessThan(posicionEspera);
    }
  });

  it('detiene a las anuladas antes de la entrega', () => {
    const anuladas: EstadoOrden[][] = [];
    for (let i = 0; i < 500; i += 1) {
      anuladas.push([...construirCadena(azar, ESTADO_ORDEN.ANULADA).estados]);
    }
    for (const cadena of anuladas) {
      expect(cadena).not.toContain(ESTADO_ORDEN.ENTREGADA);
      expect(cadena.at(-1)).toBe(ESTADO_ORDEN.ANULADA);
    }
  });
});
