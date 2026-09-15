/** Reglas de forma de los movimientos de repuesto, sin base de datos. */
import { describe, expect, it } from 'vitest';
import { TIPO_BODEGA, TIPO_MOVIMIENTO, type TipoMovimiento } from '@servitotal/compartido';
import {
  TODAS_LAS_REGLAS, efectoSobreExistencia, reglaDe, validarMovimiento,
  type PeticionMovimiento, type TiposDeBodega,
} from '../../src/dominio/inventario/indice.js';

const CENTRAL = 'bodega-central';
const MOVIL = 'bodega-movil';

function pedir(
  tipo: TipoMovimiento, ajustes: Partial<PeticionMovimiento> = {},
): PeticionMovimiento {
  return {
    tipo,
    idBodegaOrigen: null,
    idBodegaDestino: null,
    cantidad: 1,
    idOrden: null,
    justificacion: null,
    registradoSinConexion: false,
    ...ajustes,
  };
}

const tipos = (origen: string | null, destino: string | null): TiposDeBodega => ({ origen, destino });

describe('tabla de reglas', () => {
  it('declara los seis tipos del esquema', () => {
    expect(TODAS_LAS_REGLAS).toHaveLength(6);
    for (const tipo of Object.values(TIPO_MOVIMIENTO)) {
      expect(() => reglaDe(tipo)).not.toThrow();
    }
  });
});

describe('forma de cada movimiento', () => {
  it('un ingreso lleva destino y no lleva origen', () => {
    expect(validarMovimiento(
      pedir(TIPO_MOVIMIENTO.INGRESO, { idBodegaDestino: CENTRAL }), tipos(null, TIPO_BODEGA.CENTRAL),
    ).valido).toBe(true);

    const conOrigen = validarMovimiento(
      pedir(TIPO_MOVIMIENTO.INGRESO, { idBodegaOrigen: CENTRAL, idBodegaDestino: MOVIL }),
      tipos(TIPO_BODEGA.CENTRAL, TIPO_BODEGA.MOVIL),
    );
    expect(conOrigen.valido).toBe(false);
    expect(conOrigen.campo).toBe('idBodegaOrigen');
  });

  it('un consumo lleva origen y nunca destino', () => {
    expect(validarMovimiento(
      pedir(TIPO_MOVIMIENTO.CONSUMO, { idBodegaOrigen: CENTRAL, idOrden: 'orden-1' }),
      tipos(TIPO_BODEGA.CENTRAL, null),
    ).valido).toBe(true);

    const sinOrigen = validarMovimiento(
      pedir(TIPO_MOVIMIENTO.CONSUMO, { idOrden: 'orden-1' }), tipos(null, null),
    );
    expect(sinOrigen.valido).toBe(false);
    expect(sinOrigen.campo).toBe('idBodegaOrigen');
  });

  it('todo consumo tiene que ir atado a una orden', () => {
    const veredicto = validarMovimiento(
      pedir(TIPO_MOVIMIENTO.CONSUMO, { idBodegaOrigen: CENTRAL }), tipos(TIPO_BODEGA.CENTRAL, null),
    );
    expect(veredicto.valido).toBe(false);
    expect(veredicto.motivo).toMatch(/atado a la orden/);
    expect(veredicto.campo).toBe('idOrden');
  });

  it('un despacho tiene que ir a una bodega movil', () => {
    expect(validarMovimiento(
      pedir(TIPO_MOVIMIENTO.DESPACHO_A_MOVIL, { idBodegaOrigen: CENTRAL, idBodegaDestino: MOVIL }),
      tipos(TIPO_BODEGA.CENTRAL, TIPO_BODEGA.MOVIL),
    ).valido).toBe(true);

    const aCentral = validarMovimiento(
      pedir(TIPO_MOVIMIENTO.DESPACHO_A_MOVIL, { idBodegaOrigen: MOVIL, idBodegaDestino: CENTRAL }),
      tipos(TIPO_BODEGA.MOVIL, TIPO_BODEGA.CENTRAL),
    );
    expect(aCentral.valido).toBe(false);
    expect(aCentral.motivo).toMatch(/bodega movil/);
  });

  it('una devolucion tiene que llegar a la central', () => {
    expect(validarMovimiento(
      pedir(TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL, { idBodegaOrigen: MOVIL, idBodegaDestino: CENTRAL }),
      tipos(TIPO_BODEGA.MOVIL, TIPO_BODEGA.CENTRAL),
    ).valido).toBe(true);

    expect(validarMovimiento(
      pedir(TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL, { idBodegaOrigen: CENTRAL, idBodegaDestino: MOVIL }),
      tipos(TIPO_BODEGA.CENTRAL, TIPO_BODEGA.MOVIL),
    ).valido).toBe(false);
  });

  it('no se mueve repuesto de una bodega a si misma', () => {
    const veredicto = validarMovimiento(
      pedir(TIPO_MOVIMIENTO.DESPACHO_A_MOVIL, { idBodegaOrigen: MOVIL, idBodegaDestino: MOVIL }),
      tipos(TIPO_BODEGA.MOVIL, TIPO_BODEGA.MOVIL),
    );
    expect(veredicto.valido).toBe(false);
    expect(veredicto.motivo).toMatch(/no pueden ser la misma/);
  });

  it('la cantidad tiene que ser un entero positivo', () => {
    for (const cantidad of [0, -3, 1.5, Number.NaN]) {
      const veredicto = validarMovimiento(
        pedir(TIPO_MOVIMIENTO.INGRESO, { idBodegaDestino: CENTRAL, cantidad }),
        tipos(null, TIPO_BODEGA.CENTRAL),
      );
      expect(veredicto.valido, String(cantidad)).toBe(false);
      expect(veredicto.campo).toBe('cantidad');
    }
  });
});

describe('ajustes', () => {
  it('un ajuste no se acepta sin justificacion escrita', () => {
    const veredicto = validarMovimiento(
      pedir(TIPO_MOVIMIENTO.AJUSTE, { idBodegaDestino: CENTRAL, justificacion: 'ups' }),
      tipos(null, TIPO_BODEGA.CENTRAL),
    );
    expect(veredicto.valido).toBe(false);
    expect(veredicto.motivo).toMatch(/ajuste justificado/);
  });

  it('suma con destino o resta con origen, pero no las dos', () => {
    const justificacion = 'Conteo fisico del trimestre';
    expect(validarMovimiento(
      pedir(TIPO_MOVIMIENTO.AJUSTE, { idBodegaDestino: CENTRAL, justificacion }),
      tipos(null, TIPO_BODEGA.CENTRAL),
    ).valido).toBe(true);

    expect(validarMovimiento(
      pedir(TIPO_MOVIMIENTO.AJUSTE, { idBodegaOrigen: CENTRAL, justificacion }),
      tipos(TIPO_BODEGA.CENTRAL, null),
    ).valido).toBe(true);

    const ambas = validarMovimiento(
      pedir(TIPO_MOVIMIENTO.AJUSTE, { idBodegaOrigen: CENTRAL, idBodegaDestino: MOVIL, justificacion }),
      tipos(TIPO_BODEGA.CENTRAL, TIPO_BODEGA.MOVIL),
    );
    expect(ambas.valido).toBe(false);

    const ninguna = validarMovimiento(pedir(TIPO_MOVIMIENTO.AJUSTE, { justificacion }), tipos(null, null));
    expect(ninguna.valido).toBe(false);
  });
});

describe('la central solo se descuenta en linea', () => {
  it('un consumo sin conexion desde la central se rechaza', () => {
    const veredicto = validarMovimiento(
      pedir(TIPO_MOVIMIENTO.CONSUMO, {
        idBodegaOrigen: CENTRAL, idOrden: 'orden-1', registradoSinConexion: true,
      }),
      tipos(TIPO_BODEGA.CENTRAL, null),
    );
    expect(veredicto.valido).toBe(false);
    expect(veredicto.motivo).toMatch(/solo se descuenta en linea/);
  });

  it('desde la bodega movil si se puede, que es el punto de la bodega movil', () => {
    expect(validarMovimiento(
      pedir(TIPO_MOVIMIENTO.CONSUMO, {
        idBodegaOrigen: MOVIL, idOrden: 'orden-1', registradoSinConexion: true,
      }),
      tipos(TIPO_BODEGA.MOVIL, null),
    ).valido).toBe(true);
  });
});

describe('efecto sobre la existencia', () => {
  it('un consumo resta de la bodega de origen y no suma en ningun lado', () => {
    const efectos = efectoSobreExistencia(
      pedir(TIPO_MOVIMIENTO.CONSUMO, { idBodegaOrigen: CENTRAL, cantidad: 3, idOrden: 'o' }),
    );
    expect(efectos).toEqual([{ idBodega: CENTRAL, delta: -3 }]);
  });

  it('un despacho resta en la central y suma en la movil', () => {
    const efectos = efectoSobreExistencia(
      pedir(TIPO_MOVIMIENTO.DESPACHO_A_MOVIL, {
        idBodegaOrigen: CENTRAL, idBodegaDestino: MOVIL, cantidad: 5,
      }),
    );
    expect(efectos).toEqual([
      { idBodega: CENTRAL, delta: -5 },
      { idBodega: MOVIL, delta: 5 },
    ]);
  });

  it('un ingreso solo suma', () => {
    expect(efectoSobreExistencia(
      pedir(TIPO_MOVIMIENTO.INGRESO, { idBodegaDestino: CENTRAL, cantidad: 10 }),
    )).toEqual([{ idBodega: CENTRAL, delta: 10 }]);
  });

  it('los traslados no crean ni destruyen unidades', () => {
    const efectos = efectoSobreExistencia(
      pedir(TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL, {
        idBodegaOrigen: MOVIL, idBodegaDestino: CENTRAL, cantidad: 7,
      }),
    );
    expect(efectos.reduce((suma, efecto) => suma + efecto.delta, 0)).toBe(0);
  });
});
