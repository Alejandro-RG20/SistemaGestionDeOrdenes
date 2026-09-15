/**
 * Que puede hacer cada rol. Se materializa en la tabla rol_permiso y es lo
 * que el servidor consulta en cada peticion (regla de arquitectura 7).
 * Ocultar un boton en el panel no es control de acceso.
 */
import { CODIGO_ROL, type CodigoPermiso, type CodigoRol } from './seguridad.js';

const CONSULTA_BASE = ['ordenes.consultar', 'clientes.consultar', 'articulos.consultar'] as const;

export const MATRIZ_ROL_PERMISO: Readonly<Record<CodigoRol, readonly CodigoPermiso[]>> = {
  [CODIGO_ROL.AGENTE_TELEFONIA]: [
    ...CONSULTA_BASE, 'clientes.crear', 'clientes.editar', 'articulos.crear', 'articulos.editar',
    'ordenes.crear', 'ordenes.cerrar', 'agenda.consultar', 'agenda.programar',
    'garantias.evaluar', 'taller.cotizacion.autorizar', 'cobros.pago.registrar',
  ],

  [CODIGO_ROL.JEFE_ATENCION_CLIENTE]: [
    ...CONSULTA_BASE, 'clientes.crear', 'clientes.editar', 'clientes.fusionar',
    'articulos.crear', 'articulos.editar', 'articulos.editar_datos_sensibles',
    'ordenes.crear', 'ordenes.anular', 'ordenes.cerrar', 'ordenes.nota_correccion',
    'agenda.consultar', 'agenda.programar', 'garantias.evaluar', 'garantias.reclasificar',
    'taller.cotizacion.autorizar', 'cobros.pago.registrar', 'cobros.indicadores.consultar',
    'portal.configurar', 'inventario.consultar',
    // Las reglas de cobertura son un parametro comercial que se negocia con
    // las marcas; la jefatura de atencion al cliente las versiona igual que
    // la de tecnicos.
    'garantias.regla.gestionar',
    // Administra el sistema: no existe un rol de administrador aparte.
    'seguridad.usuario.gestionar', 'seguridad.rol.gestionar',
    'seguridad.dispositivo.vincular', 'seguridad.dispositivo.revocar',
    'seguridad.bitacora.consultar',
  ],

  [CODIGO_ROL.TECNICO_RUTA]: [
    ...CONSULTA_BASE, 'campo.visita.registrar', 'campo.evidencia.cargar', 'campo.sincronizar',
    'taller.diagnostico.registrar', 'taller.cotizacion.registrar', 'taller.reparacion.registrar',
    'ordenes.crear', 'ordenes.cambiar_modalidad',
    'inventario.consultar', 'inventario.consumo.registrar', 'agenda.consultar',
  ],

  // El tecnico de planta usa la misma tableta que el de ruta; lo unico que
  // cambia es que no sale del taller. Por eso sincroniza igual —la app no
  // tiene otra via para registrar nada— pero no registra visitas a
  // domicilio ni levanta ordenes en campo.
  [CODIGO_ROL.TECNICO_PLANTA]: [
    ...CONSULTA_BASE, 'campo.evidencia.cargar', 'campo.sincronizar',
    'taller.diagnostico.registrar', 'taller.cotizacion.registrar', 'taller.reparacion.registrar',
    'inventario.consultar', 'inventario.consumo.registrar', 'inventario.solicitud.gestionar',
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
    'seguridad.bitacora.consultar',
  ],

  [CODIGO_ROL.BODEGUERO]: [
    'ordenes.consultar', 'inventario.consultar', 'inventario.ingreso.registrar',
    'inventario.despacho.registrar', 'inventario.consumo.registrar',
    'inventario.ajuste.registrar', 'inventario.solicitud.gestionar',
  ],

  [CODIGO_ROL.JEFE_COMPRAS]: [
    'ordenes.consultar', 'articulos.consultar', 'inventario.consultar',
    'inventario.ingreso.registrar', 'inventario.ajuste.registrar',
    'inventario.solicitud.gestionar', 'cobros.indicadores.consultar',
  ],

  [CODIGO_ROL.GESTOR_COBROS]: [
    ...CONSULTA_BASE, 'cobros.expediente.conformar', 'cobros.expediente.enviar',
    'cobros.pago.registrar', 'cobros.indicadores.consultar', 'inventario.consultar',
  ],
};
