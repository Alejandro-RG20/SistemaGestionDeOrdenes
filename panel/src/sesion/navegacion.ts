/**
 * El menu del prototipo: OPERACION, CONTROL, SESION.
 *
 * ESTO NO ES CONTROL DE ACCESO. El servidor comprueba el permiso en cada
 * peticion y esa es la unica puerta que cuenta (regla de arquitectura 7);
 * ocultar un enlace no protege nada. Lo que hace este archivo es evitar que
 * a un bodeguero se le llene la pantalla de secciones que le van a
 * responder 403 si las toca.
 */
import type { CodigoPermiso, UsuarioAutenticado } from '@servitotal/compartido';

export interface SeccionDelPanel {
  readonly ruta: string;
  readonly etiqueta: string;
  /** Con cualquiera de estos permisos, la seccion se muestra. */
  readonly permisos: readonly string[];
  /** Encabezado del prototipo bajo el que se agrupa. */
  readonly grupo: 'inicio' | 'operacion' | 'control';
}

export const SECCIONES: readonly SeccionDelPanel[] = [
  { ruta: '/', etiqueta: 'Panel principal', permisos: [], grupo: 'inicio' },

  { ruta: '/clientes', etiqueta: 'Clientes y articulos', permisos: ['clientes.consultar'], grupo: 'operacion' },
  { ruta: '/ordenes', etiqueta: 'Ordenes de servicio', permisos: ['ordenes.consultar'], grupo: 'operacion' },
  { ruta: '/agenda', etiqueta: 'Agenda y rutas', permisos: ['agenda.consultar'], grupo: 'operacion' },
  { ruta: '/taller', etiqueta: 'Cola de taller', permisos: ['ordenes.asignar'], grupo: 'operacion' },

  { ruta: '/inventario', etiqueta: 'Inventario y bodegas', permisos: ['inventario.consultar'], grupo: 'control' },
  { ruta: '/coberturas', etiqueta: 'Reglas de cobertura', permisos: ['garantias.evaluar'], grupo: 'control' },
  {
    ruta: '/cobros',
    etiqueta: 'Expedientes de cobro',
    permisos: ['cobros.expediente.conformar', 'cobros.expediente.enviar'],
    grupo: 'control',
  },
  { ruta: '/excepciones', etiqueta: 'Excepciones', permisos: ['campo.excepcion.resolver'], grupo: 'control' },
  {
    ruta: '/indicadores',
    etiqueta: 'Indicadores',
    permisos: ['cobros.indicadores.consultar', 'ordenes.asignar', 'ordenes.cerrar'],
    grupo: 'control',
  },
  { ruta: '/administracion', etiqueta: 'Administracion', permisos: ['seguridad.usuario.gestionar'], grupo: 'control' },
];

export function tienePermiso(usuario: UsuarioAutenticado | null, permiso: string): boolean {
  if (usuario === null) return false;
  return (usuario.permisos as readonly CodigoPermiso[]).includes(permiso as CodigoPermiso);
}

export function seccionesDe(usuario: UsuarioAutenticado | null): readonly SeccionDelPanel[] {
  if (usuario === null) return [];
  return SECCIONES.filter((seccion) =>
    // Sin permisos declarados, la seccion es para todo el mundo: el panel
    // principal lo tiene cualquiera con sesion.
    seccion.permisos.length === 0
    || seccion.permisos.some((permiso) => tienePermiso(usuario, permiso)));
}

/** El nombre legible del rol, para la cabecera del menu. */
export function rolLegible(usuario: UsuarioAutenticado | null): string {
  if (usuario === null) return '';
  return usuario.rol.replace(/_/g, ' ').replace(/^\w/, (letra) => letra.toUpperCase());
}
