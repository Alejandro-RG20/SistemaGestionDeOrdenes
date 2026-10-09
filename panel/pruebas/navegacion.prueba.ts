/**
 * Que ve cada quien en el menu.
 *
 * Esto NO es control de acceso —el servidor comprueba el permiso en cada
 * peticion y esa es la unica puerta que cuenta— pero si decide si a un
 * bodeguero se le llena la pantalla de secciones que le van a responder 403.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGO_PERMISOS, CODIGO_ROL, type CodigoRol } from '@servitotal/compartido';
import {
  SECCIONES, SECCIONES_DEL_TECNICO, menuDe, seccionesDe, tienePermiso, trabajaEnCampo,
} from '../src/sesion/navegacion.js';
import { usuarioDePrueba } from './apoyo.js';

/** Un usuario con ese rol y esos permisos, sin repetir el molde. */
const usuarioCon = (rol: CodigoRol, permisos: readonly string[]) =>
  usuarioDePrueba(permisos, rol);

const rutas = (usuario: Parameters<typeof seccionesDe>[0]): string[] =>
  seccionesDe(usuario).map((seccion) => seccion.ruta);

describe('secciones del panel', () => {
  it('sin sesion no hay menu', () => {
    expect(seccionesDe(null)).toHaveLength(0);
  });

  it('la bandeja la tiene cualquiera con sesion', () => {
    // Es el unico canal de aviso del sistema: nadie puede quedarse sin ella.
    expect(rutas(usuarioDePrueba([]))).toContain('/');
  });

  it('un bodeguero ve inventario y no administracion', () => {
    const bodeguero = usuarioDePrueba(
      ['ordenes.consultar', 'inventario.consultar'], 'bodeguero',
    );
    const suyas = rutas(bodeguero);

    expect(suyas).toContain('/inventario');
    expect(suyas).not.toContain('/cobros');
    expect(suyas).not.toContain('/administracion');
    expect(suyas).not.toContain('/excepciones');
  });

  it('la jefatura de atencion al cliente ve administracion', () => {
    // Gestiona al personal desde administracion, aunque no sea administradora.
    const jefatura = usuarioDePrueba(
      ['ordenes.consultar', 'seguridad.usuario.gestionar', 'reportes.consultar'],
      'jefe_atencion_cliente',
    );
    expect(rutas(jefatura)).toContain('/administracion');
  });

  it('el menu no tiene cobros, pagos ni expedientes, ni siquiera para el administrador', () => {
    const administrador = usuarioDePrueba(
      CATALOGO_PERMISOS.map((permiso) => permiso.codigo), CODIGO_ROL.ADMINISTRADOR,
    );
    const todas = rutas(administrador);
    for (const ruta of todas) {
      expect(ruta).not.toMatch(/cobro|pago|expediente/);
    }
    for (const seccion of SECCIONES) {
      expect(seccion.etiqueta.toLowerCase()).not.toMatch(/cobro|pago|expediente/);
    }
  });

  it('basta uno de los permisos declarados para ver la seccion', () => {
    const soloCrear = usuarioDePrueba(['inventario.solicitud.crear']);
    expect(rutas(soloCrear)).toContain('/inventario/recorrido');
  });

  it('el menu prioriza ordenes, luego inventario, luego control', () => {
    const grupos = SECCIONES.map((seccion) => seccion.grupo);
    const primero = (grupo: string): number => grupos.indexOf(grupo as never);
    expect(primero('ordenes')).toBeLessThan(primero('inventario'));
    expect(primero('inventario')).toBeLessThan(primero('control'));
  });

  it('quien entrega ve las entregas pendientes; quien no, no', () => {
    expect(rutas(usuarioDePrueba(['ordenes.consultar', 'ordenes.entregar'])))
      .toContain('/ordenes?estado=finalizada');
    expect(rutas(usuarioDePrueba(['ordenes.consultar'])))
      .not.toContain('/ordenes?estado=finalizada');
  });

  it('un tecnico no ve indicadores', () => {
    const tecnico = usuarioDePrueba(
      ['ordenes.consultar', 'inventario.consultar', 'campo.sincronizar'], 'tecnico_ruta',
    );
    expect(rutas(tecnico)).not.toContain('/indicadores');
  });

  it('toda seccion declara ruta y etiqueta', () => {
    for (const seccion of SECCIONES) {
      expect(seccion.ruta.startsWith('/')).toBe(true);
      expect(seccion.etiqueta.length).toBeGreaterThan(2);
    }
  });

  it('tienePermiso no se confunde con un permiso parecido', () => {
    const usuario = usuarioDePrueba(['inventario.solicitud.crear']);
    expect(tienePermiso(usuario, 'inventario.solicitud.crear')).toBe(true);
    expect(tienePermiso(usuario, 'inventario.solicitud.gestionar')).toBe(false);
  });
});

/**
 * Quien ve la aplicacion del tecnico.
 *
 * Se decide por ROL y no por el permiso `campo.sincronizar`, aunque ese
 * permiso sea el que el servidor exige. El administrador los tiene TODOS
 * —incluido ese— y no sale a ninguna casa: usarlo como criterio hacia que
 * el sistema le atara un dispositivo al entrar, recibiera un rechazo, y lo
 * dejara escrito en la bitacora como un fallo de autenticacion que nadie
 * iba a entender.
 */
describe('quien trabaja en campo', () => {
  it('los tecnicos de ruta y de planta, si', () => {
    expect(trabajaEnCampo(usuarioCon(CODIGO_ROL.TECNICO_RUTA, []))).toBe(true);
    expect(trabajaEnCampo(usuarioCon(CODIGO_ROL.TECNICO_PLANTA, []))).toBe(true);
  });

  it('el administrador no, aunque tenga todos los permisos', () => {
    const administrador = usuarioCon(
      CODIGO_ROL.ADMINISTRADOR,
      CATALOGO_PERMISOS.map((permiso) => permiso.codigo),
    );
    expect(tienePermiso(administrador, 'campo.sincronizar')).toBe(true);
    expect(trabajaEnCampo(administrador)).toBe(false);
  });

  it('tampoco el bodeguero ni el agente', () => {
    expect(trabajaEnCampo(usuarioCon(CODIGO_ROL.BODEGUERO, []))).toBe(false);
    expect(trabajaEnCampo(usuarioCon(CODIGO_ROL.AGENTE_TELEFONIA, []))).toBe(false);
  });

  it('sin sesion, no', () => {
    expect(trabajaEnCampo(null)).toBe(false);
  });

  it('la seccion «Mi ruta» solo le aparece a quien sale a campo', () => {
    const conRuta = (usuario: ReturnType<typeof usuarioCon>): boolean =>
      seccionesDe(usuario).some((seccion) => seccion.ruta === '/campo');

    expect(conRuta(usuarioCon(CODIGO_ROL.TECNICO_RUTA, ['campo.sincronizar']))).toBe(true);
    expect(conRuta(usuarioCon(
      CODIGO_ROL.ADMINISTRADOR, CATALOGO_PERMISOS.map((p) => p.codigo),
    ))).toBe(false);
  });
});


/**
 * El menu del tecnico (pliego §11).
 *
 * El tecnico no recibe el menu general recortado: recibe otro menu. La
 * diferencia que importa es «Inventario y bodegas», el catalogo completo del
 * centro, que el filtro por permisos le dejaba puesto porque tiene
 * `inventario.consultar` —y lo necesita, para ver lo que lleva encima— pero
 * que no es lo que el va a abrir.
 */
describe('menu del tecnico', () => {
  const tecnico = usuarioCon(CODIGO_ROL.TECNICO_RUTA, [
    'ordenes.consultar', 'agenda.consultar', 'inventario.consultar',
    'inventario.consumo.registrar', 'campo.sincronizar',
  ]);

  it('al tecnico se le da el menu del tecnico, no el general', () => {
    const suyas = menuDe(tecnico).map((seccion) => seccion.ruta);
    expect(suyas).toEqual(SECCIONES_DEL_TECNICO
      .filter((s) => s.permisos.length === 0 || s.permisos.some((p) => tienePermiso(tecnico, p)))
      .map((s) => s.ruta));
  });

  it('lleva sus repuestos, sus solicitudes y su sincronizacion', () => {
    const suyas = menuDe(tecnico).map((seccion) => seccion.ruta);
    expect(suyas).toContain('/campo/bodega');
    expect(suyas).toContain('/inventario/recorrido');
    expect(suyas).toContain('/campo/envios');
  });

  it('NO lleva el catalogo de inventario del centro entero', () => {
    const suyas = menuDe(tecnico).map((seccion) => seccion.ruta);
    expect(suyas).not.toContain('/inventario');
    expect(suyas).not.toContain('/inventario/kardex');
  });

  it('a quien no sale a campo se le sigue dando el menu general', () => {
    const bodeguero = usuarioCon(CODIGO_ROL.BODEGUERO, [
      'ordenes.consultar', 'inventario.consultar', 'inventario.ingreso.registrar',
    ]);
    expect(menuDe(bodeguero)).toEqual(seccionesDe(bodeguero));
  });

  it('sin sesion no hay menu de ningun tipo', () => {
    expect(menuDe(null)).toHaveLength(0);
  });
});

/**
 * Las secciones nuevas de inventario.
 *
 * «Movimientos» solo se le ofrece a quien puede registrar alguno. Un usuario
 * de consulta ve el kardex —que es lectura— y no un formulario que el
 * servidor va a rechazarle con 403.
 */
describe('secciones de inventario', () => {
  it('el formulario de movimientos no se le ofrece a quien solo consulta', () => {
    const consulta = usuarioCon(CODIGO_ROL.USUARIO_CONSULTA, ['inventario.consultar']);
    const suyas = seccionesDe(consulta).map((seccion) => seccion.ruta);
    expect(suyas).toContain('/inventario/kardex');
    expect(suyas).not.toContain('/inventario/movimientos');
  });

  it('al bodeguero si', () => {
    const bodeguero = usuarioCon(CODIGO_ROL.BODEGUERO, [
      'inventario.consultar', 'inventario.ingreso.registrar',
    ]);
    const suyas = seccionesDe(bodeguero).map((seccion) => seccion.ruta);
    expect(suyas).toContain('/inventario/movimientos');
  });

  it('toda seccion declarada apunta a una ruta unica', () => {
    const rutasDeclaradas = SECCIONES.map((seccion) => seccion.ruta);
    expect(new Set(rutasDeclaradas).size).toBe(rutasDeclaradas.length);
  });
});
