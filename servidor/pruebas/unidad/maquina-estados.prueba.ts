/**
 * Maquina de estados de la orden, sin base de datos.
 *
 * Cada prueba fija una regla del pliego. La mas importante: de ruta a
 * taller si, de taller a ruta nunca.
 */
import { describe, expect, it } from 'vitest';
import {
  CODIGO_ROL, ESTADO_ORDEN, ESTADOS_ORDEN, MODALIDAD_SERVICIO, TIPO_GARANTIA,
  type EstadoOrden,
} from '@servitotal/compartido';
import {
  CODIGO_TRANSICION, destinosPosibles, evaluarTransicion, TODOS_LOS_ESTADOS,
  type ContextoTransicion,
} from '../../src/dominio/ordenes/indice.js';

const ID_TECNICO = 'tecnico-1';
const ID_USUARIO_TECNICO = 'usuario-tecnico-1';

type Ajustes = Partial<Omit<ContextoTransicion, 'orden' | 'actor'>> & {
  orden?: Partial<ContextoTransicion['orden']>;
  actor?: Partial<ContextoTransicion['actor']>;
};

function contexto(desde: EstadoOrden, hacia: EstadoOrden, ajustes: Ajustes = {}): ContextoTransicion {
  return {
    hacia,
    orden: {
      id: 'orden-1', numero: 10500, estado: desde,
      modalidad: MODALIDAD_SERVICIO.TALLER,
      tipoGarantia: TIPO_GARANTIA.PROVEEDOR,
      idTecnico: ID_TECNICO,
      idResponsableActual: null,
      ...ajustes.orden,
    },
    actor: {
      id: ID_USUARIO_TECNICO, rol: CODIGO_ROL.JEFE_TECNICOS, idTecnico: ID_TECNICO,
      puedeAnular: true, puedeCerrar: true,
      ...ajustes.actor,
    },
    evidenciasFaltantes: ajustes.evidenciasFaltantes ?? [],
    tieneVisitaVigente: ajustes.tieneVisitaVigente ?? true,
    tieneDiagnostico: ajustes.tieneDiagnostico ?? true,
    tieneCotizacion: ajustes.tieneCotizacion ?? true,
    cotizacionAceptada: ajustes.cotizacionAceptada ?? true,
    solicitudesSinLiberar: ajustes.solicitudesSinLiberar ?? 0,
    motivo: ajustes.motivo ?? 'Motivo suficientemente largo para la prueba',
  };
}

describe('forma de la maquina', () => {
  it('declara los 13 estados del esquema', () => {
    expect(TODOS_LOS_ESTADOS).toHaveLength(13);
    expect(TODOS_LOS_ESTADOS.map((d) => d.estado).sort()).toEqual([...ESTADOS_ORDEN].sort());
  });

  it('los tres estados finales no admiten ninguna salida', () => {
    for (const estado of [ESTADO_ORDEN.ENTREGADA, ESTADO_ORDEN.CERRADA_SIN_REPARAR, ESTADO_ORDEN.ANULADA]) {
      expect(destinosPosibles(estado)).toHaveLength(0);
    }
  });

  it('todo estado no final puede anularse', () => {
    for (const definicion of TODOS_LOS_ESTADOS.filter((d) => !d.esFinal)) {
      expect(destinosPosibles(definicion.estado)).toContain(ESTADO_ORDEN.ANULADA);
    }
  });

  it('ningun destino declarado apunta a un estado inexistente', () => {
    for (const definicion of TODOS_LOS_ESTADOS) {
      for (const transicion of definicion.transiciones) {
        expect(ESTADOS_ORDEN).toContain(transicion.hacia);
      }
    }
  });
});

describe('de ruta a taller, nunca al reves', () => {
  it('una orden en ruta puede pasar a la cola del taller', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.EN_RUTA, ESTADO_ORDEN.EN_COLA_TALLER, {
      orden: { modalidad: MODALIDAD_SERVICIO.RUTA },
      actor: { rol: CODIGO_ROL.TECNICO_RUTA },
    }));
    expect(veredicto.permitida).toBe(true);
  });

  it('una orden en la cola del taller NO puede volver a ruta', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.EN_COLA_TALLER, ESTADO_ORDEN.EN_RUTA));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.codigo).toBe(CODIGO_TRANSICION.TRANSICION_INVALIDA);
    expect(veredicto.motivo).toMatch(/solo se puede ir a/);
  });

  it('ningun estado posterior al taller declara una vuelta a ruta', () => {
    const posteriores: EstadoOrden[] = [
      ESTADO_ORDEN.EN_COLA_TALLER, ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.COTIZADA,
      ESTADO_ORDEN.ESPERANDO_AUTORIZACION, ESTADO_ORDEN.ESPERANDO_REPUESTO,
      ESTADO_ORDEN.EN_REPARACION, ESTADO_ORDEN.FINALIZADA,
    ];
    for (const estado of posteriores) {
      expect(destinosPosibles(estado), estado).not.toContain(ESTADO_ORDEN.EN_RUTA);
    }
  });

  it('una orden de taller no puede salir a ruta', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.ASIGNADA, ESTADO_ORDEN.EN_RUTA, {
      orden: { modalidad: MODALIDAD_SERVICIO.TALLER },
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/orden de ruta/i);
  });
});

describe('una orden cerrada no se edita', () => {
  it('desde cualquier estado final toda transicion falla', () => {
    for (const final of [ESTADO_ORDEN.ENTREGADA, ESTADO_ORDEN.CERRADA_SIN_REPARAR, ESTADO_ORDEN.ANULADA]) {
      const veredicto = evaluarTransicion(contexto(final, ESTADO_ORDEN.EN_REPARACION));
      expect(veredicto.permitida, final).toBe(false);
      expect(veredicto.codigo).toBe(CODIGO_TRANSICION.ORDEN_CERRADA);
      expect(veredicto.motivo).toMatch(/nota de correccion/);
    }
  });
});

describe('evidencia obligatoria', () => {
  it('sin la evidencia del estado, la orden no avanza, y se dice cual falta', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.COTIZADA, {
      actor: { rol: CODIGO_ROL.TECNICO_PLANTA },
      evidenciasFaltantes: [
        { clave: 'foto_falla', etiqueta: 'Fotografia del componente con la falla' },
        { clave: 'informe_tecnico', etiqueta: 'Informe tecnico para el fabricante' },
      ],
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.codigo).toBe(CODIGO_TRANSICION.REQUISITO_INCUMPLIDO);
    expect(veredicto.motivo).toContain('Fotografia del componente con la falla');
    expect(veredicto.motivo).toContain('Informe tecnico para el fabricante');
  });

  it('la entrega exige su evidencia: sin firma no se entrega', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.FINALIZADA, ESTADO_ORDEN.ENTREGADA, {
      actor: { rol: CODIGO_ROL.AGENTE_TELEFONIA },
      evidenciasFaltantes: [{ clave: 'firma_cliente', etiqueta: 'Firma de conformidad del cliente' }],
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toContain('Firma de conformidad del cliente');
  });

  it('con la evidencia completa si avanza', () => {
    expect(evaluarTransicion(contexto(ESTADO_ORDEN.FINALIZADA, ESTADO_ORDEN.ENTREGADA, {
      actor: { rol: CODIGO_ROL.AGENTE_TELEFONIA },
    })).permitida).toBe(true);
  });
});

describe('requisitos de cada paso', () => {
  it('no se asigna una orden sin tecnico', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.REGISTRADA, ESTADO_ORDEN.ASIGNADA, {
      orden: { idTecnico: null }, actor: { rol: CODIGO_ROL.AGENTE_TELEFONIA },
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/asignarle un tecnico/);
  });

  it('no sale a ruta sin visita programada', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.ASIGNADA, ESTADO_ORDEN.EN_RUTA, {
      orden: { modalidad: MODALIDAD_SERVICIO.RUTA }, tieneVisitaVigente: false,
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/visita programada/);
  });

  it('no se cotiza sin diagnostico', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.COTIZADA, {
      actor: { rol: CODIGO_ROL.TECNICO_PLANTA }, tieneDiagnostico: false,
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/diagnostico/);
  });

  it('no se repara sin que el cliente acepte la cotizacion', () => {
    const veredicto = evaluarTransicion(
      contexto(ESTADO_ORDEN.ESPERANDO_AUTORIZACION, ESTADO_ORDEN.EN_REPARACION, {
        actor: { rol: CODIGO_ROL.AGENTE_TELEFONIA }, cotizacionAceptada: false,
      }),
    );
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/no acepta la cotizacion/);
  });

  it('no se repara mientras falten repuestos, y se dice cuantos', () => {
    const veredicto = evaluarTransicion(
      contexto(ESTADO_ORDEN.ESPERANDO_REPUESTO, ESTADO_ORDEN.EN_REPARACION, {
        actor: { rol: CODIGO_ROL.BODEGUERO }, solicitudesSinLiberar: 2,
      }),
    );
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/Faltan 2 repuesto/);
  });

  it('una orden cubierta por garantia no pasa por autorizacion del cliente', () => {
    const cubierta = evaluarTransicion(
      contexto(ESTADO_ORDEN.COTIZADA, ESTADO_ORDEN.ESPERANDO_AUTORIZACION, {
        orden: { tipoGarantia: TIPO_GARANTIA.PROVEEDOR }, actor: { rol: CODIGO_ROL.TECNICO_PLANTA },
      }),
    );
    expect(cubierta.permitida).toBe(false);
    expect(cubierta.motivo).toMatch(/cubierta por garantia/);

    const particular = evaluarTransicion(
      contexto(ESTADO_ORDEN.COTIZADA, ESTADO_ORDEN.ESPERANDO_AUTORIZACION, {
        orden: { tipoGarantia: TIPO_GARANTIA.PARTICULAR }, actor: { rol: CODIGO_ROL.TECNICO_PLANTA },
      }),
    );
    expect(particular.permitida).toBe(true);
  });

  it('no se anula sin motivo escrito', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.EN_REPARACION, ESTADO_ORDEN.ANULADA, {
      actor: { rol: CODIGO_ROL.TECNICO_PLANTA }, motivo: 'corto',
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.motivo).toMatch(/Escriba el motivo/);
  });

  it('no se cierra sin reparar sin haber diagnosticado', () => {
    const veredicto = evaluarTransicion(
      contexto(ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.CERRADA_SIN_REPARAR, {
        actor: { rol: CODIGO_ROL.TECNICO_PLANTA }, tieneDiagnostico: false,
      }),
    );
    expect(veredicto.permitida).toBe(false);
  });
});

describe('responsable unico del estado', () => {
  it('un bodeguero no mueve una orden que esta en diagnostico', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.COTIZADA, {
      actor: { rol: CODIGO_ROL.BODEGUERO, idTecnico: null, puedeAnular: false, puedeCerrar: false },
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.codigo).toBe(CODIGO_TRANSICION.NO_ES_RESPONSABLE);
  });

  it('otro tecnico no mueve la orden de un companero', () => {
    const veredicto = evaluarTransicion(contexto(ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.COTIZADA, {
      orden: { idTecnico: 'tecnico-1' },
      actor: {
        rol: CODIGO_ROL.TECNICO_PLANTA, idTecnico: 'tecnico-2',
        puedeAnular: false, puedeCerrar: false,
      },
    }));
    expect(veredicto.permitida).toBe(false);
    expect(veredicto.codigo).toBe(CODIGO_TRANSICION.NO_ES_RESPONSABLE);
    expect(veredicto.motivo).toMatch(/tecnico asignado/);
  });

  it('el tecnico asignado si la mueve', () => {
    expect(evaluarTransicion(contexto(ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.COTIZADA, {
      orden: { idTecnico: 'tecnico-9' },
      actor: {
        rol: CODIGO_ROL.TECNICO_PLANTA, idTecnico: 'tecnico-9',
        puedeAnular: false, puedeCerrar: false,
      },
    })).permitida).toBe(true);
  });

  it('quien figura como responsable actual la mueve aunque su rol sea otro', () => {
    expect(evaluarTransicion(contexto(ESTADO_ORDEN.ESPERANDO_REPUESTO, ESTADO_ORDEN.EN_REPARACION, {
      orden: { idResponsableActual: 'usuario-x' },
      actor: {
        id: 'usuario-x', rol: CODIGO_ROL.GESTOR_COBROS, idTecnico: null,
        puedeAnular: false, puedeCerrar: false,
      },
    })).permitida).toBe(true);
  });

  it('la jefatura puede anular aunque no sea la responsable de turno', () => {
    expect(evaluarTransicion(contexto(ESTADO_ORDEN.ESPERANDO_REPUESTO, ESTADO_ORDEN.ANULADA, {
      actor: {
        rol: CODIGO_ROL.JEFE_ATENCION_CLIENTE, idTecnico: null,
        puedeAnular: true, puedeCerrar: false,
      },
    })).permitida).toBe(true);
  });

  it('pero sin ese permiso, no', () => {
    expect(evaluarTransicion(contexto(ESTADO_ORDEN.ESPERANDO_REPUESTO, ESTADO_ORDEN.ANULADA, {
      actor: {
        rol: CODIGO_ROL.GESTOR_COBROS, idTecnico: null,
        puedeAnular: false, puedeCerrar: false,
      },
    })).permitida).toBe(false);
  });
});

describe('el camino completo de una orden de taller', () => {
  it('recorre registrada -> entregada sin transiciones invalidas', () => {
    const camino: readonly (readonly [EstadoOrden, EstadoOrden])[] = [
      [ESTADO_ORDEN.REGISTRADA, ESTADO_ORDEN.ASIGNADA],
      [ESTADO_ORDEN.ASIGNADA, ESTADO_ORDEN.EN_COLA_TALLER],
      [ESTADO_ORDEN.EN_COLA_TALLER, ESTADO_ORDEN.EN_DIAGNOSTICO],
      [ESTADO_ORDEN.EN_DIAGNOSTICO, ESTADO_ORDEN.COTIZADA],
      [ESTADO_ORDEN.COTIZADA, ESTADO_ORDEN.ESPERANDO_AUTORIZACION],
      [ESTADO_ORDEN.ESPERANDO_AUTORIZACION, ESTADO_ORDEN.ESPERANDO_REPUESTO],
      [ESTADO_ORDEN.ESPERANDO_REPUESTO, ESTADO_ORDEN.EN_REPARACION],
      [ESTADO_ORDEN.EN_REPARACION, ESTADO_ORDEN.FINALIZADA],
      [ESTADO_ORDEN.FINALIZADA, ESTADO_ORDEN.ENTREGADA],
    ];

    for (const [desde, hacia] of camino) {
      const veredicto = evaluarTransicion(contexto(desde, hacia, {
        orden: { tipoGarantia: TIPO_GARANTIA.PARTICULAR, idResponsableActual: ID_USUARIO_TECNICO },
      }));
      expect(veredicto.permitida, `${desde} -> ${hacia}: ${veredicto.motivo ?? ''}`).toBe(true);
    }
  });
});
