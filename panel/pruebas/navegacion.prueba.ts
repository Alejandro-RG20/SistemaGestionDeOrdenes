/**
 * Que ve cada quien en el menu.
 *
 * Esto NO es control de acceso —el servidor comprueba el permiso en cada
 * peticion y esa es la unica puerta que cuenta— pero si decide si a un
 * bodeguero se le llena la pantalla de secciones que le van a responder 403.
 */
import { describe, expect, it } from 'vitest';
import { SECCIONES, seccionesDe, tienePermiso } from '../src/sesion/navegacion.js';
import { usuarioDePrueba } from './apoyo.js';

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
