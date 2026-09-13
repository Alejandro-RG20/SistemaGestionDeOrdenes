/**
 * Roles y permisos como datos (H12).
 *
 * No hay rol de administrador aparte: la jefatura de atencion al cliente
 * administra el sistema. Son 37 personas y ninguna cuenta sin dueno. El servidor autoriza consultando
 * rol_permiso; este catalogo es la fuente unica de los codigos, compartida
 * por el backend, el panel y la aplicacion movil.
 */

export const CODIGO_ROL = {
  AGENTE_TELEFONIA: 'agente_telefonia',
  JEFE_ATENCION_CLIENTE: 'jefe_atencion_cliente',
  TECNICO_RUTA: 'tecnico_ruta',
  TECNICO_PLANTA: 'tecnico_planta',
  GESTOR_TECNICOS: 'gestor_tecnicos',
  JEFE_TECNICOS: 'jefe_tecnicos',
  BODEGUERO: 'bodeguero',
  JEFE_COMPRAS: 'jefe_compras',
  GESTOR_COBROS: 'gestor_cobros',
} as const;
export type CodigoRol = (typeof CODIGO_ROL)[keyof typeof CODIGO_ROL];

export const MODULO = {
  SEGURIDAD: 'seguridad',
  CLIENTES: 'clientes',
  ARTICULOS: 'articulos',
  ORDENES: 'ordenes',
  CAMPO: 'campo',
  TALLER: 'taller',
  AGENDA: 'agenda',
  GARANTIAS: 'garantias',
  INVENTARIO: 'inventario',
  COBROS: 'cobros',
  PORTAL: 'portal',
} as const;
export type Modulo = (typeof MODULO)[keyof typeof MODULO];

export interface DefinicionPermiso {
  readonly codigo: string;
  readonly modulo: Modulo;
  readonly descripcion: string;
}

/**
 * Catalogo completo de permisos. Cada entrada se materializa como una fila
 * de `permiso`. Agregar un permiso aqui y sembrarlo es el unico modo
 * legitimo de crear una nueva capacidad.
 */
export const CATALOGO_PERMISOS = [
  { codigo: 'seguridad.usuario.gestionar', modulo: MODULO.SEGURIDAD, descripcion: 'Crear, editar y desactivar usuarios' },
  { codigo: 'seguridad.rol.gestionar', modulo: MODULO.SEGURIDAD, descripcion: 'Asignar permisos a los roles' },
  { codigo: 'seguridad.dispositivo.vincular', modulo: MODULO.SEGURIDAD, descripcion: 'Vincular un dispositivo movil a un usuario' },
  { codigo: 'seguridad.dispositivo.revocar', modulo: MODULO.SEGURIDAD, descripcion: 'Revocar a distancia un dispositivo movil' },
  { codigo: 'seguridad.bitacora.consultar', modulo: MODULO.SEGURIDAD, descripcion: 'Consultar la bitacora de auditoria' },

  { codigo: 'clientes.consultar', modulo: MODULO.CLIENTES, descripcion: 'Buscar y ver la ficha del cliente' },
  { codigo: 'clientes.crear', modulo: MODULO.CLIENTES, descripcion: 'Registrar un cliente nuevo' },
  { codigo: 'clientes.editar', modulo: MODULO.CLIENTES, descripcion: 'Actualizar los datos vivos del cliente' },
  { codigo: 'clientes.fusionar', modulo: MODULO.CLIENTES, descripcion: 'Fusionar clientes duplicados' },

  { codigo: 'articulos.consultar', modulo: MODULO.ARTICULOS, descripcion: 'Ver el articulo y su historial de servicio' },
  { codigo: 'articulos.crear', modulo: MODULO.ARTICULOS, descripcion: 'Registrar un articulo nuevo' },
  { codigo: 'articulos.editar', modulo: MODULO.ARTICULOS, descripcion: 'Corregir datos no sensibles del articulo' },
  { codigo: 'articulos.editar_datos_sensibles', modulo: MODULO.ARTICULOS, descripcion: 'Cambiar fecha de compra, tienda de origen o marca (exige motivo escrito)' },

  { codigo: 'ordenes.consultar', modulo: MODULO.ORDENES, descripcion: 'Ver la bandeja y el detalle de las ordenes' },
  { codigo: 'ordenes.crear', modulo: MODULO.ORDENES, descripcion: 'Registrar una orden de servicio' },
  { codigo: 'ordenes.asignar', modulo: MODULO.ORDENES, descripcion: 'Asignar la orden a un tecnico' },
  { codigo: 'ordenes.cambiar_modalidad', modulo: MODULO.ORDENES, descripcion: 'Convertir una orden de ruta a taller' },
  { codigo: 'ordenes.anular', modulo: MODULO.ORDENES, descripcion: 'Anular una orden indicando el motivo' },
  { codigo: 'ordenes.cerrar', modulo: MODULO.ORDENES, descripcion: 'Entregar o cerrar sin reparar' },
  { codigo: 'ordenes.nota_correccion', modulo: MODULO.ORDENES, descripcion: 'Adjuntar una nota de correccion a una orden cerrada' },

  { codigo: 'campo.visita.registrar', modulo: MODULO.CAMPO, descripcion: 'Registrar llegada, salida y resultado de la visita' },
  { codigo: 'campo.evidencia.cargar', modulo: MODULO.CAMPO, descripcion: 'Adjuntar fotos, firmas y documentos' },
  { codigo: 'campo.sincronizar', modulo: MODULO.CAMPO, descripcion: 'Sincronizar la cola del dispositivo movil' },
  { codigo: 'campo.excepcion.resolver', modulo: MODULO.CAMPO, descripcion: 'Resolver excepciones de sincronizacion' },

  { codigo: 'taller.diagnostico.registrar', modulo: MODULO.TALLER, descripcion: 'Registrar el diagnostico y sus mediciones' },
  { codigo: 'taller.cotizacion.registrar', modulo: MODULO.TALLER, descripcion: 'Elaborar la cotizacion' },
  { codigo: 'taller.cotizacion.autorizar', modulo: MODULO.TALLER, descripcion: 'Registrar la aceptacion del cliente' },
  { codigo: 'taller.reparacion.registrar', modulo: MODULO.TALLER, descripcion: 'Registrar el avance de la reparacion' },

  { codigo: 'agenda.consultar', modulo: MODULO.AGENDA, descripcion: 'Ver la agenda de visitas' },
  { codigo: 'agenda.programar', modulo: MODULO.AGENDA, descripcion: 'Programar y reprogramar visitas' },

  { codigo: 'garantias.evaluar', modulo: MODULO.GARANTIAS, descripcion: 'Evaluar y reevaluar la cobertura de una orden' },
  { codigo: 'garantias.reclasificar', modulo: MODULO.GARANTIAS, descripcion: 'Reclasificar la garantia con documento de respaldo' },
  { codigo: 'garantias.regla.gestionar', modulo: MODULO.GARANTIAS, descripcion: 'Crear versiones de las reglas de cobertura' },

  { codigo: 'inventario.consultar', modulo: MODULO.INVENTARIO, descripcion: 'Consultar existencias y movimientos' },
  { codigo: 'inventario.ingreso.registrar', modulo: MODULO.INVENTARIO, descripcion: 'Ingresar repuestos a la bodega central' },
  { codigo: 'inventario.despacho.registrar', modulo: MODULO.INVENTARIO, descripcion: 'Despachar repuestos a una bodega movil' },
  { codigo: 'inventario.consumo.registrar', modulo: MODULO.INVENTARIO, descripcion: 'Consumir repuestos contra una orden' },
  { codigo: 'inventario.ajuste.registrar', modulo: MODULO.INVENTARIO, descripcion: 'Registrar un ajuste justificado' },
  { codigo: 'inventario.solicitud.gestionar', modulo: MODULO.INVENTARIO, descripcion: 'Crear y dar seguimiento a solicitudes de repuesto' },

  { codigo: 'cobros.expediente.conformar', modulo: MODULO.COBROS, descripcion: 'Conformar el expediente de cobro' },
  { codigo: 'cobros.expediente.enviar', modulo: MODULO.COBROS, descripcion: 'Enviar el expediente al proveedor o a la poliza' },
  { codigo: 'cobros.pago.registrar', modulo: MODULO.COBROS, descripcion: 'Registrar el pago del cliente' },
  { codigo: 'cobros.indicadores.consultar', modulo: MODULO.COBROS, descripcion: 'Ver los indicadores de recuperacion' },

  { codigo: 'portal.configurar', modulo: MODULO.PORTAL, descripcion: 'Configurar los mensajes del portal publico' },
] as const satisfies readonly DefinicionPermiso[];

export type CodigoPermiso = (typeof CATALOGO_PERMISOS)[number]['codigo'];
