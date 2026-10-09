/**
 * Que puede hacer cada rol. Se materializa en la tabla rol_permiso y es lo
 * que el servidor consulta en cada peticion (regla de arquitectura 7).
 * Ocultar un boton en el panel no es control de acceso.
 */
import { CATALOGO_PERMISOS, CODIGO_ROL, type CodigoPermiso, type CodigoRol } from './seguridad.js';

const CONSULTA_BASE = ['ordenes.consultar', 'clientes.consultar', 'articulos.consultar'] as const;

export const MATRIZ_ROL_PERMISO: Readonly<Record<CodigoRol, readonly CodigoPermiso[]>> = {
  [CODIGO_ROL.AGENTE_TELEFONIA]: [
    ...CONSULTA_BASE, 'clientes.crear', 'clientes.editar', 'articulos.crear', 'articulos.editar',
    'ordenes.crear', 'ordenes.cerrar', 'agenda.consultar', 'agenda.programar',
    'garantias.evaluar', 'taller.cotizacion.autorizar',
  ],

  [CODIGO_ROL.JEFE_ATENCION_CLIENTE]: [
    ...CONSULTA_BASE, 'clientes.crear', 'clientes.editar', 'clientes.fusionar',
    'articulos.crear', 'articulos.editar', 'articulos.editar_datos_sensibles',
    'ordenes.crear', 'ordenes.anular', 'ordenes.cerrar', 'ordenes.nota_correccion',
    'agenda.consultar', 'agenda.programar', 'garantias.evaluar', 'garantias.reclasificar',
    'taller.cotizacion.autorizar',
    'portal.configurar', 'inventario.consultar', 'ordenes.entregar', 'reportes.consultar',
    // Recibe y entrega en el mostrador del centro: fotografia lo que entra
    // y la firma de quien retira.
    'campo.evidencia.cargar',
    'tiendas.gestionar', 'compras.consultar',
    // Las reglas de cobertura son un parametro comercial que se negocia con
    // las marcas; la jefatura de atencion al cliente las versiona igual que
    // la de tecnicos.
    'garantias.regla.gestionar',
    // Gestiona al personal del centro: altas, contrasenas, desbloqueos,
    // dispositivos. NO es administradora: el servidor le impide asignar el
    // rol de administrador, tocar cuentas de administracion y editar los
    // permisos de su propio rol (seguridad/servicio-usuario.ts y
    // servicio-rol.ts). El administrador del sistema es el rol aparte que
    // se define mas abajo.
    'seguridad.usuario.gestionar', 'seguridad.rol.gestionar',
    'seguridad.dispositivo.vincular', 'seguridad.dispositivo.revocar',
    'seguridad.bitacora.consultar',
  ],

  [CODIGO_ROL.TECNICO_RUTA]: [
    ...CONSULTA_BASE, 'campo.visita.registrar', 'campo.evidencia.cargar', 'campo.sincronizar',
    'taller.diagnostico.registrar', 'taller.cotizacion.registrar', 'taller.reparacion.registrar',
    'ordenes.crear', 'ordenes.cambiar_modalidad',
    'inventario.consultar', 'inventario.consumo.registrar', 'inventario.solicitud.crear',
    'inventario.devolucion.registrar', 'agenda.consultar',
  ],

  // El tecnico de planta usa la misma tableta que el de ruta; lo unico que
  // cambia es que no sale del taller. Por eso sincroniza igual —la app no
  // tiene otra via para registrar nada— pero no registra visitas a
  // domicilio ni levanta ordenes en campo.
  [CODIGO_ROL.TECNICO_PLANTA]: [
    ...CONSULTA_BASE, 'campo.evidencia.cargar', 'campo.sincronizar',
    'taller.diagnostico.registrar', 'taller.cotizacion.registrar', 'taller.reparacion.registrar',
    // Pide repuestos pero no se los aprueba: eso es de bodega (migracion 0023).
    'inventario.consultar', 'inventario.consumo.registrar', 'inventario.solicitud.crear',
    'inventario.devolucion.registrar',
  ],

  [CODIGO_ROL.GESTOR_TECNICOS]: [
    ...CONSULTA_BASE, 'ordenes.asignar', 'ordenes.cambiar_modalidad',
    'agenda.consultar', 'agenda.programar', 'campo.excepcion.resolver',
    'inventario.consultar',
  ],

  [CODIGO_ROL.JEFE_TECNICOS]: [
    ...CONSULTA_BASE, 'ordenes.asignar', 'ordenes.cambiar_modalidad', 'ordenes.anular',
    'ordenes.cerrar', 'ordenes.nota_correccion',
    'agenda.consultar', 'agenda.programar', 'campo.excepcion.resolver',
    'articulos.editar_datos_sensibles', 'garantias.evaluar', 'garantias.reclasificar',
    'garantias.regla.gestionar', 'inventario.consultar', 'inventario.ajuste.registrar',
    'inventario.devolucion.registrar',
    'seguridad.bitacora.consultar',
    // La validacion tecnica es suya: es el control que impide que una
    // reparacion sin revisar salga del centro.
    'taller.validacion.registrar', 'reportes.consultar',
  ],

  [CODIGO_ROL.BODEGUERO]: [
    'ordenes.consultar', 'inventario.consultar', 'inventario.ingreso.registrar',
    'inventario.despacho.registrar', 'inventario.consumo.registrar',
    'inventario.ajuste.registrar', 'inventario.solicitud.gestionar',
    'inventario.devolucion.registrar',
    // Cuenta lo que llega del proveedor. Es lo unico que mueve existencia.
    'compras.consultar', 'compras.recibir',
  ],

  [CODIGO_ROL.JEFE_COMPRAS]: [
    'ordenes.consultar', 'articulos.consultar', 'inventario.consultar',
    'inventario.ingreso.registrar', 'inventario.ajuste.registrar',
    'inventario.solicitud.gestionar',
    // Pide al proveedor y administra su catalogo. NO recibe la mercaderia:
    // eso lo cuenta bodega, y separar las dos manos es lo que evita que
    // quien pide sea tambien quien declara que llego.
    'compras.consultar', 'compras.gestionar', 'compras.proveedor.gestionar',
    'reportes.consultar',
  ],

  /**
   * Usuario de tienda: el mostrador de una sucursal.
   *
   * Levanta la orden del cliente que llega y la sigue. No diagnostica, no
   * toca inventario y no cierra: el trabajo tecnico es del centro de
   * servicio. El alcance a su propia tienda no lo da esta lista —los
   * permisos dicen QUE puede hacer, no SOBRE QUE— sino el servicio de
   * ordenes, que filtra por la tienda del usuario.
   */
  [CODIGO_ROL.USUARIO_TIENDA]: [
    ...CONSULTA_BASE, 'clientes.crear', 'clientes.editar',
    'articulos.crear', 'articulos.editar',
    'ordenes.crear', 'garantias.evaluar', 'campo.evidencia.cargar',
    'ordenes.entregar',
  ],

  /**
   * Administrador del sistema (RF-07).
   *
   * Tiene TODO lo que el catalogo declara. Se construye a partir del
   * catalogo y no a mano: una lista escrita a mano se queda corta el dia
   * que alguien agrega un permiso, y un administrador al que le falta un
   * permiso nuevo es un administrador que no puede administrar.
   */
  [CODIGO_ROL.ADMINISTRADOR]: CATALOGO_PERMISOS.map((permiso) => permiso.codigo),

  /**
   * Usuario de consulta: lee y nada mas.
   *
   * No lleva ni un permiso que escriba. Es el rol que se le da a quien
   * supervisa o audita sin operar, y su valor esta justamente en lo que NO
   * tiene.
   */
  [CODIGO_ROL.USUARIO_CONSULTA]: [
    ...CONSULTA_BASE, 'agenda.consultar', 'inventario.consultar',
    'compras.consultar', 'reportes.consultar',
  ],
};
