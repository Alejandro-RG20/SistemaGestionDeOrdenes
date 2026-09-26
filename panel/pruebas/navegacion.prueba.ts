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
  SECCIONES, seccionesDe, tienePermiso, trabajaEnCampo,
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

  it('un bodeguero ve inventario y no cobros ni administracion', () => {
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
    // No hay rol de administrador: esta jefatura administra el sistema.
    const jefatura = usuarioDePrueba(
      ['ordenes.consultar', 'seguridad.usuario.gestionar', 'cobros.indicadores.consultar'],
      'jefe_atencion_cliente',
    );
    expect(rutas(jefatura)).toContain('/administracion');
  });

  it('el gestor de cobros ve cobros y no excepciones', () => {
    const gestor = usuarioDePrueba(
      ['ordenes.consultar', 'cobros.expediente.conformar'], 'gestor_cobros',
    );
    const suyas = rutas(gestor);

    expect(suyas).toContain('/cobros');
    expect(suyas).not.toContain('/excepciones');
  });

  it('basta uno de los permisos declarados para ver la seccion', () => {
    const soloEnviar = usuarioDePrueba(['cobros.expediente.enviar']);
    expect(rutas(soloEnviar)).toContain('/cobros');
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
    const usuario = usuarioDePrueba(['cobros.expediente.conformar']);
    expect(tienePermiso(usuario, 'cobros.expediente.conformar')).toBe(true);
    expect(tienePermiso(usuario, 'cobros.expediente.enviar')).toBe(false);
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
