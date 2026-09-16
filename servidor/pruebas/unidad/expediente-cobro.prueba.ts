/**
 * La maquina del expediente y la regla del monto.
 *
 * Lo que se cuida aqui es plata: un expediente que sale incompleto vuelve
 * rechazado con el articulo ya entregado, y el repuesto se lo come el
 * taller.
 */
import { describe, expect, it } from 'vitest';
import {
  ESTADO_EXPEDIENTE, MODALIDAD_SERVICIO, TIPO_GARANTIA, type EstadoExpediente,
} from '@servitotal/compartido';
import {
  CODIGO_EXPEDIENTE, calcularReclamo, destinatarioDe, destinosPosibles,
  estadoSegunEvidencia, evaluarTransicion,
} from '../../src/dominio/cobros/indice.js';

function contexto(cambios: Partial<Parameters<typeof evaluarTransicion>[0]> = {}) {
  return {
    estado: ESTADO_EXPEDIENTE.EN_CONFORMACION as EstadoExpediente,
    hacia: ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR as EstadoExpediente,
    evidenciaCompleta: true,
    montoReclamado: 5000,
    montoCobrado: null,
    motivoRechazo: null,
    ...cambios,
  };
}

describe('a quien se le cobra', () => {
  it('la garantia de proveedor se le reclama a la marca', () => {
    expect(destinatarioDe(TIPO_GARANTIA.PROVEEDOR)).toMatchObject({
      reclamable: true, destinatario: 'proveedor',
    });
  });

  it('la garantia adicional se le reclama a la poliza', () => {
    expect(destinatarioDe(TIPO_GARANTIA.ADICIONAL)).toMatchObject({
      reclamable: true, destinatario: 'poliza',
    });
  });

  it('la particular no tiene expediente: la paga el cliente', () => {
    const veredicto = destinatarioDe(TIPO_GARANTIA.PARTICULAR);
    expect(veredicto.reclamable).toBe(false);
    expect(veredicto.motivo).toMatch(/paga el cliente/i);
  });

  it('con la garantia por validar todavia no se sabe a quien reclamarle', () => {
    expect(destinatarioDe(TIPO_GARANTIA.POR_VALIDAR).reclamable).toBe(false);
  });
});

describe('maquina del expediente', () => {
  it('RF-57: un expediente con evidencia incompleta no se alista para enviar', () => {
    const veredicto = evaluarTransicion(contexto({ evidenciaCompleta: false }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.codigo).toBe(CODIGO_EXPEDIENTE.EVIDENCIA_INCOMPLETA);
  });

  it('un reclamo en cero no sale: se archiva sin leerlo', () => {
    const veredicto = evaluarTransicion(contexto({ montoReclamado: 0 }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.codigo).toBe(CODIGO_EXPEDIENTE.SIN_MONTO);
  });

  it('con evidencia y monto, se alista', () => {
    expect(evaluarTransicion(contexto()).permitida).toBe(true);
  });

  it('rechazar sin motivo no se admite: nadie sabria que corregir', () => {
    const veredicto = evaluarTransicion(contexto({
      estado: ESTADO_EXPEDIENTE.ENVIADO, hacia: ESTADO_EXPEDIENTE.RECHAZADO,
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.codigo).toBe(CODIGO_EXPEDIENTE.FALTA_RESULTADO);
  });

  it('marcar pagado exige decir cuanto pagaron', () => {
    const sinMonto = evaluarTransicion(contexto({
      estado: ESTADO_EXPEDIENTE.ACEPTADO, hacia: ESTADO_EXPEDIENTE.PAGADO,
    }));
    expect(sinMonto.permitida).toBe(false);

    const conMonto = evaluarTransicion(contexto({
      estado: ESTADO_EXPEDIENTE.ACEPTADO, hacia: ESTADO_EXPEDIENTE.PAGADO, montoCobrado: 3800,
    }));
    expect(conMonto.permitida).toBe(true);
  });

  it('un pago parcial es valido: la diferencia es el indicador', () => {
    // Que la marca pague menos de lo reclamado no invalida el expediente;
    // es justo el dato que mide si conviene reclamarle a esa marca.
    const veredicto = evaluarTransicion(contexto({
      estado: ESTADO_EXPEDIENTE.ACEPTADO, hacia: ESTADO_EXPEDIENTE.PAGADO,
      montoReclamado: 5000, montoCobrado: 2000,
    }));
    expect(veredicto.permitida).toBe(true);
  });

  it('un rechazo se puede corregir y volver a presentar', () => {
    // Es plata que de otro modo se pierde.
    expect(destinosPosibles(ESTADO_EXPEDIENTE.RECHAZADO)).toContain(ESTADO_EXPEDIENTE.EN_CONFORMACION);
  });

  it('un expediente pagado ya no se toca', () => {
    const veredicto = evaluarTransicion(contexto({
      estado: ESTADO_EXPEDIENTE.PAGADO, hacia: ESTADO_EXPEDIENTE.EN_CONFORMACION,
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.codigo).toBe(CODIGO_EXPEDIENTE.EXPEDIENTE_CERRADO);
  });

  it('no se puede saltar del borrador al enviado', () => {
    const veredicto = evaluarTransicion(contexto({ hacia: ESTADO_EXPEDIENTE.ENVIADO }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.codigo).toBe(CODIGO_EXPEDIENTE.TRANSICION_INVALIDA);
    // El mensaje dice a donde SI se puede ir.
    expect(veredicto.motivo).toContain(ESTADO_EXPEDIENTE.LISTO_PARA_ENVIAR);
  });

  it('el bloqueo por evidencia se pone y se quita solo', () => {
    expect(estadoSegunEvidencia(ESTADO_EXPEDIENTE.EN_CONFORMACION, false))
      .toBe(ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA);
    expect(estadoSegunEvidencia(ESTADO_EXPEDIENTE.BLOQUEADO_POR_EVIDENCIA, true))
      .toBe(ESTADO_EXPEDIENTE.EN_CONFORMACION);
    // Y no toca un expediente que ya salio.
    expect(estadoSegunEvidencia(ESTADO_EXPEDIENTE.ENVIADO, false)).toBe(ESTADO_EXPEDIENTE.ENVIADO);
  });
});

describe('monto reclamable', () => {
  it('suma repuestos, mano de obra y visita en una orden de ruta', () => {
    const desglose = calcularReclamo({
      modalidad: MODALIDAD_SERVICIO.RUTA,
      totalRepuestos: 4200.5,
      manoObra: 800,
      cargoVisita: 250,
    });
    expect(desglose.total).toBe(5250.5);
  });

  it('en una orden de taller no se cobra visita que no se hizo', () => {
    // Cobrarle al fabricante un viaje que no existio es como la marca deja
    // de pagar los que si.
    const desglose = calcularReclamo({
      modalidad: MODALIDAD_SERVICIO.TALLER,
      totalRepuestos: 3000,
      manoObra: 500,
      cargoVisita: 250,
    });
    expect(desglose.cargoVisita).toBe(0);
    expect(desglose.total).toBe(3500);
    expect(desglose.advertencias.join(' ')).toMatch(/cargo de visita/i);
  });

  it('avisa cuando no hay mano de obra registrada, en vez de inventar una tarifa', () => {
    const desglose = calcularReclamo({
      modalidad: MODALIDAD_SERVICIO.TALLER, totalRepuestos: 3000, manoObra: 0, cargoVisita: 0,
    });
    expect(desglose.manoObra).toBe(0);
    expect(desglose.advertencias.join(' ')).toMatch(/mano de obra/i);
  });

  it('avisa cuando no hay repuestos: un consumo sin anotar es plata sin recuperar', () => {
    const desglose = calcularReclamo({
      modalidad: MODALIDAD_SERVICIO.TALLER, totalRepuestos: 0, manoObra: 700, cargoVisita: 0,
    });
    expect(desglose.advertencias.join(' ')).toMatch(/repuestos consumidos/i);
  });

  it('redondea a dos decimales, que es como se factura', () => {
    const desglose = calcularReclamo({
      modalidad: MODALIDAD_SERVICIO.TALLER,
      totalRepuestos: 1000.005, manoObra: 0.001, cargoVisita: 0,
    });
    expect(Number.isInteger(desglose.total * 100)).toBe(true);
  });
});
