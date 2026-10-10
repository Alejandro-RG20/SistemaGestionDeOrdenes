/**
 * El menu del prototipo: OPERACION, CONTROL, SESION.
 *
 * ESTO NO ES CONTROL DE ACCESO. El servidor comprueba el permiso en cada
 * peticion y esa es la unica puerta que cuenta (regla de arquitectura 7);
 * ocultar un enlace no protege nada. Lo que hace este archivo es evitar que
 * a un bodeguero se le llene la pantalla de secciones que le van a
 * responder 403 si las toca.
 */
import { CODIGO_ROL, type CodigoPermiso, type UsuarioAutenticado } from '@servitotal/compartido';

export interface SeccionDelPanel {
  readonly ruta: string;
  readonly etiqueta: string;
  /** Con cualquiera de estos permisos, la seccion se muestra. */
  readonly permisos: readonly string[];
  /** Encabezado bajo el que se agrupa en el menu. */
  readonly grupo: 'inicio' | 'ordenes' | 'inventario' | 'control';
  /** Solo para quien de verdad sale a campo. Ver `trabajaEnCampo`. */
  readonly soloCampo?: boolean;
}

/**
 * El menu general, en el orden en que se trabaja: primero las ordenes,
 * luego el inventario, al final el control y la administracion.
 *
 * No hay entradas de cobros ni de pagos: el sistema gestiona ordenes de
 * reparacion e inventario, no dinero (migracion 0023).
 */
export const SECCIONES: readonly SeccionDelPanel[] = [
  { ruta: '/', etiqueta: 'Panel operativo', permisos: [], grupo: 'inicio' },

  // La aplicacion del tecnico es la misma web: se entra por aqui, no por
  // una instalacion aparte. Se filtra aparte, por rol: ver `trabajaEnCampo`.
  { ruta: '/campo', etiqueta: 'Mi ruta (celular)', permisos: ['campo.sincronizar'], grupo: 'ordenes', soloCampo: true },
  { ruta: '/ordenes', etiqueta: 'Ordenes de reparacion', permisos: ['ordenes.consultar'], grupo: 'ordenes' },
  { ruta: '/ordenes/nueva', etiqueta: 'Nueva orden', permisos: ['ordenes.crear'], grupo: 'ordenes' },
  { ruta: '/taller', etiqueta: 'Asignacion de tecnicos', permisos: ['ordenes.asignar'], grupo: 'ordenes' },
  { ruta: '/agenda', etiqueta: 'Agenda y visitas', permisos: ['agenda.consultar'], grupo: 'ordenes' },
  { ruta: '/validaciones', etiqueta: 'Validacion tecnica', permisos: ['taller.validacion.registrar'], grupo: 'ordenes' },
  {
    ruta: '/ordenes?estado=finalizada',
    etiqueta: 'Entregas pendientes',
    permisos: ['ordenes.entregar'],
    grupo: 'ordenes',
  },
  { ruta: '/clientes', etiqueta: 'Clientes y articulos', permisos: ['clientes.consultar'], grupo: 'ordenes' },

  {
    ruta: '/inventario/recorrido',
    etiqueta: 'Solicitudes de repuesto',
    permisos: ['inventario.solicitud.gestionar', 'inventario.solicitud.crear', 'inventario.consumo.registrar'],
    grupo: 'inventario',
  },
  { ruta: '/inventario/disponibilidad', etiqueta: 'Disponibilidad', permisos: ['inventario.consultar'], grupo: 'inventario' },
  { ruta: '/inventario', etiqueta: 'Catalogo y bodegas', permisos: ['inventario.consultar'], grupo: 'inventario' },
  {
    ruta: '/inventario/movimientos',
    etiqueta: 'Movimientos',
    // Se muestra a quien puede registrar ALGUN tipo. Quien solo consulta ve
    // los movimientos dentro del kardex, no un formulario que no puede usar.
    permisos: [
      'inventario.ingreso.registrar', 'inventario.despacho.registrar',
      'inventario.devolucion.registrar', 'inventario.consumo.registrar',
      'inventario.ajuste.registrar',
    ],
    grupo: 'inventario',
  },
  { ruta: '/inventario/kardex', etiqueta: 'Kardex', permisos: ['inventario.consultar'], grupo: 'inventario' },
  { ruta: '/compras', etiqueta: 'Reposicion de repuestos', permisos: ['compras.consultar'], grupo: 'inventario' },

  { ruta: '/reportes', etiqueta: 'Reportes operativos', permisos: ['reportes.consultar'], grupo: 'control' },
  {
    ruta: '/indicadores',
    etiqueta: 'Indicadores',
    permisos: ['ordenes.asignar', 'ordenes.cerrar', 'reportes.consultar'],
    grupo: 'control',
  },
  { ruta: '/excepciones', etiqueta: 'Excepciones', permisos: ['campo.excepcion.resolver'], grupo: 'control' },
  { ruta: '/tiendas', etiqueta: 'Tiendas', permisos: ['tiendas.gestionar'], grupo: 'control' },
  // Quien despacha ordenes consulta a los tecnicos; quien gestiona al
  // personal los administra desde aqui o desde «Usuarios y permisos».
  { ruta: '/tecnicos', etiqueta: 'Tecnicos', permisos: ['ordenes.asignar', 'seguridad.usuario.gestionar'], grupo: 'control' },
  { ruta: '/administracion', etiqueta: 'Usuarios y permisos', permisos: ['seguridad.usuario.gestionar'], grupo: 'control' },
];

export function tienePermiso(usuario: UsuarioAutenticado | null, permiso: string): boolean {
  if (usuario === null) return false;
  return (usuario.permisos as readonly CodigoPermiso[]).includes(permiso as CodigoPermiso);
}

export function seccionesDe(usuario: UsuarioAutenticado | null): readonly SeccionDelPanel[] {
  if (usuario === null) return [];
  return SECCIONES.filter((seccion) => {
    if (seccion.soloCampo === true) return trabajaEnCampo(usuario);
    // Sin permisos declarados, la seccion es para todo el mundo: el panel
    // principal lo tiene cualquiera con sesion.
    return seccion.permisos.length === 0
      || seccion.permisos.some((permiso) => tienePermiso(usuario, permiso));
  });
}

/**
 * Quien trabaja EN CAMPO, con la aplicacion del tecnico.
 *
 * Se define por ROL y no por el permiso `campo.sincronizar`, aunque ese
 * permiso sea el que el servidor exige. La razon es concreta: el
 * administrador tiene TODOS los permisos —incluido ese— y no sale a
 * ninguna casa. Usar el permiso hacia que el sistema intentara atarle un
 * dispositivo al iniciar sesion, recibiera un rechazo y lo dejara anotado
 * como un fallo de autenticacion que nadie iba a entender leyendo la
 * bitacora.
 *
 * El permiso sigue siendo lo que manda en el servidor. Esto solo decide a
 * quien le ofrecemos la pantalla y a quien le atamos el navegador.
 */
export function trabajaEnCampo(usuario: UsuarioAutenticado | null): boolean {
  if (usuario === null) return false;
  return usuario.rol === CODIGO_ROL.TECNICO_RUTA || usuario.rol === CODIGO_ROL.TECNICO_PLANTA;
}

/** El nombre legible del rol, para la cabecera del menu. */
export function rolLegible(usuario: UsuarioAutenticado | null): string {
  if (usuario === null) return '';
  return usuario.rol.replace(/_/g, ' ').replace(/^\w/, (letra) => letra.toUpperCase());
}


/**
 * El menu del tecnico (pliego §11).
 *
 * Es una lista aparte y no un filtro del menu general, porque el tecnico no
 * necesita una version recortada del menu de la jefatura: necesita OTRO
 * menu, con sus seis cosas y en el orden en que las usa durante el dia.
 * Filtrar el general por permisos le dejaba «Cola de taller» y «Reportes»
 * fuera, si, pero tambien le dejaba «Inventario y bodegas» —el catalogo
 * entero del centro— donde el solo quiere ver lo que lleva en su bodega.
 *
 * Las rutas son las mismas del sistema: no hay pantallas duplicadas para el
 * tecnico, solo otra puerta de entrada.
 */
export const SECCIONES_DEL_TECNICO: readonly SeccionDelPanel[] = [
  { ruta: '/campo', etiqueta: 'Mi ruta de hoy', permisos: [], grupo: 'inicio' },
  { ruta: '/ordenes', etiqueta: 'Mis ordenes', permisos: ['ordenes.consultar'], grupo: 'ordenes' },
  { ruta: '/agenda', etiqueta: 'Mi agenda', permisos: ['agenda.consultar'], grupo: 'ordenes' },
  { ruta: '/inventario/recorrido', etiqueta: 'Mis solicitudes', permisos: [], grupo: 'inventario' },
  { ruta: '/campo/bodega', etiqueta: 'Mis repuestos', permisos: [], grupo: 'inventario' },
  { ruta: '/campo/envios', etiqueta: 'Sincronizacion', permisos: [], grupo: 'control' },
];

/** El menu que le toca a esta persona: el del tecnico, o el general. */
export function menuDe(usuario: UsuarioAutenticado | null): readonly SeccionDelPanel[] {
  if (usuario === null) return [];
  if (trabajaEnCampo(usuario)) {
    return SECCIONES_DEL_TECNICO.filter((seccion) => (
      seccion.permisos.length === 0
        || seccion.permisos.some((permiso) => tienePermiso(usuario, permiso))
    ));
  }
  return seccionesDe(usuario);
}
