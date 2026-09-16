/**
 * Que ve cada quien en el menu.
 *
 * ESTO NO ES CONTROL DE ACCESO. El servidor comprueba el permiso en cada
 * peticion y esa es la unica puerta que cuenta (regla de arquitectura 7);
 * ocultar un boton no protege nada. Lo que hace este archivo es otra cosa,
 * igual de util: que a un bodeguero no se le llene la pantalla de secciones
 * que le van a responder 403 si las toca.
 */
import type { CodigoPermiso, UsuarioAutenticado } from '@servitotal/compartido';

export interface SeccionDelPanel {
  readonly ruta: string;
  readonly etiqueta: string;
  /** Con cualquiera de estos permisos, la seccion se muestra. */
  readonly permisos: readonly string[];
}

export const SECCIONES: readonly SeccionDelPanel[] = [
  { ruta: '/', etiqueta: 'Mi bandeja', permisos: [] },
  { ruta: '/ordenes', etiqueta: 'Ordenes', permisos: ['ordenes.consultar'] },
  { ruta: '/clientes', etiqueta: 'Clientes', permisos: ['clientes.consultar'] },
  { ruta: '/inventario', etiqueta: 'Inventario', permisos: ['inventario.consultar'] },
  { ruta: '/excepciones', etiqueta: 'Excepciones', permisos: ['campo.excepcion.resolver'] },
  {
    ruta: '/cobros',
    etiqueta: 'Cobros',
    permisos: ['cobros.expediente.conformar', 'cobros.expediente.enviar'],
  },
  {
    ruta: '/indicadores',
    etiqueta: 'Indicadores',
    permisos: ['cobros.indicadores.consultar', 'ordenes.asignar', 'ordenes.cerrar'],
  },
  { ruta: '/administracion', etiqueta: 'Administracion', permisos: ['seguridad.usuario.gestionar'] },
];

export function tienePermiso(usuario: UsuarioAutenticado | null, permiso: string): boolean {
  if (usuario === null) return false;
  return (usuario.permisos as readonly CodigoPermiso[]).includes(permiso as CodigoPermiso);
}

export function seccionesDe(usuario: UsuarioAutenticado | null): readonly SeccionDelPanel[] {
  if (usuario === null) return [];
  return SECCIONES.filter((seccion) =>
    // Sin permisos declarados, la seccion es para todo el mundo: la bandeja
    // la tiene cualquiera con sesion.
    seccion.permisos.length === 0
    || seccion.permisos.some((permiso) => tienePermiso(usuario, permiso)));
}
