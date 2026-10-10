/**
 * Gestion de tecnicos.
 *
 * No hay una entidad nueva: un tecnico es la fila de `tecnico` que cuelga
 * de una cuenta de `usuario` (uno a uno). Esto da de alta, edita, da de
 * baja y reactiva ese perfil laboral. La CUENTA (activa, bloqueada,
 * contrasena) se gestiona aparte, en Usuarios: dar de baja a un tecnico no
 * desactiva su cuenta, ni al reves.
 *
 * Nada se borra. La baja exige que el tecnico no deje trabajo colgado:
 * ordenes abiertas (se reasignan, con motivo, a otro tecnico), visitas
 * programadas (se reprograman al reemplazo) y piezas en su bodega (se
 * devuelven antes por inventario, que es donde queda el registro).
 */
import type {
  FichaTecnico, Paginacion, PeticionActualizarTecnico, PeticionCrearTecnico,
  PeticionDesactivarTecnico, ResumenTecnico,
} from '@servitotal/compartido';
import { ACCION_BITACORA, CODIGO_ROL } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { ParametrosPagina } from '../../comun/paginacion.js';
import { construirPaginacion } from '../../comun/paginacion.js';
import {
  ErrorAutorizacion, ErrorConflicto, ErrorDominio, ErrorNoEncontrado, ErrorValidacion,
} from '../../comun/errores.js';
import { auditar, type AsientoAuditoria } from '../../comun/auditoria.js';
import { enTransaccion } from '../../comun/transacciones.js';
import * as servicioOrdenes from '../ordenes/servicio.js';
import * as servicioAgenda from '../agenda/servicio.js';
import * as repositorio from './repositorio-tecnico.js';
import * as servicioUsuario from './servicio-usuario.js';

const ROL_DE_TIPO = { ruta: CODIGO_ROL.TECNICO_RUTA, planta: CODIGO_ROL.TECNICO_PLANTA } as const;

function aResumen(fila: repositorio.FilaTecnico): ResumenTecnico {
  return {
    id: fila.id, idUsuario: fila.id_usuario, nombreUsuario: fila.nombre_usuario, nombres: fila.nombres,
    correo: fila.correo, tipo: fila.tipo, especialidad: fila.especialidad, disponible: fila.disponible,
    activo: fila.activo, cuentaActiva: fila.cuenta_activa, cuentaBloqueada: fila.cuenta_bloqueada,
    ordenesAbiertas: fila.ordenes_abiertas,
  };
}

export async function listar(
  actor: Actor, filtro: repositorio.FiltroTecnicos, pagina: ParametrosPagina,
): Promise<{ datos: readonly ResumenTecnico[]; paginacion: Paginacion }> {
  const [total, filas] = await Promise.all([
    repositorio.contar(actor.idCentro, filtro),
    repositorio.listar(actor.idCentro, filtro, pagina.tamano, pagina.desplazamiento),
  ]);
  return { datos: filas.map(aResumen), paginacion: construirPaginacion(pagina, total) };
}

export async function obtener(idTecnico: string): Promise<FichaTecnico> {
  const fila = await repositorio.buscarPorId(idTecnico);
  if (fila === null) throw new ErrorNoEncontrado('No existe un tecnico con ese identificador.');
  const [ordenes, visitas, bodega] = await Promise.all([
    repositorio.ordenesAbiertas(idTecnico),
    repositorio.visitasProgramadas(idTecnico),
    repositorio.bodegaDe(idTecnico),
  ]);
  return {
    ...aResumen(fila),
    ordenes,
    visitasProgramadas: visitas.length,
    unidadesEnBodega: bodega?.unidades ?? 0,
    bodega: bodega?.nombre ?? null,
  };
}

async function exigirEspecialidad(especialidad: string): Promise<void> {
  if (!(await repositorio.especialidadValida(especialidad))) {
    throw new ErrorValidacion('La especialidad debe ser una categoria de articulo activa.',
      { especialidad: 'Especialidad no valida.' });
  }
}

export async function crear(actor: Actor, peticion: PeticionCrearTecnico): Promise<FichaTecnico> {
  await exigirEspecialidad(peticion.especialidad);
  const rolEsperado = ROL_DE_TIPO[peticion.tipo];

  const id = await enTransaccion(async (cliente) => {
    let idUsuario: string;
    if (peticion.cuentaNueva !== undefined) {
      // La cuenta se crea con las mismas reglas que en Usuarios.
      const cuenta = await servicioUsuario.crear(actor, {
        nombreUsuario: peticion.cuentaNueva.nombreUsuario,
        nombres: peticion.cuentaNueva.nombres,
        contrasena: peticion.cuentaNueva.contrasena,
        codigoRol: rolEsperado,
        correo: peticion.cuentaNueva.correo ?? null,
      });
      idUsuario = cuenta.id;
    } else {
      const cuenta = await repositorio.usuarioParaTecnico(peticion.idUsuario ?? '', cliente);
      if (cuenta === null) throw new ErrorValidacion('La cuenta indicada no existe.', { idUsuario: 'Cuenta no valida.' });
      if (cuenta.tiene_ficha) {
        throw new ErrorConflicto(
          'Esa cuenta ya tiene ficha de tecnico. Si estaba dada de baja, reactivela.',
          undefined, 'TECNICO_DUPLICADO', { idUsuario: 'Ya es tecnico.' },
        );
      }
      if (!cuenta.activo) {
        throw new ErrorDominio('CUENTA_INACTIVA', 'La cuenta esta desactivada: reactivela en Usuarios antes de darla de alta como tecnico.');
      }
      if (cuenta.rol !== rolEsperado) {
        throw new ErrorValidacion(
          `Un tecnico de ${peticion.tipo} necesita una cuenta con rol «${rolEsperado}». `
            + `Esta tiene «${cuenta.rol}»: cambielo en Usuarios o cree una cuenta nueva.`,
          { idUsuario: 'Rol no compatible.' },
        );
      }
      idUsuario = cuenta.id;
    }

    const idTecnico = await repositorio.insertar(cliente, {
      idUsuario, idCentro: actor.idCentro, tipo: peticion.tipo,
      especialidad: peticion.especialidad, disponible: peticion.disponible ?? true,
    });
    const fila = await repositorio.buscarPorId(idTecnico, cliente);
    await repositorio.asegurarBodega(cliente, {
      idTecnico, idCentro: actor.idCentro, tipo: peticion.tipo, nombres: fila!.nombres,
    });
    await auditar(cliente, [{
      tabla: 'tecnico', idRegistro: idTecnico, accion: ACCION_BITACORA.CREAR,
      valorNuevo: `${fila!.nombres} · ${peticion.tipo} · ${peticion.especialidad}`, idUsuario: actor.id,
    }]);
    return idTecnico;
  });
  return obtener(id);
}

export async function actualizar(
  actor: Actor, idTecnico: string, peticion: PeticionActualizarTecnico,
): Promise<FichaTecnico> {
  if (peticion.especialidad !== undefined) await exigirEspecialidad(peticion.especialidad);
  await enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idTecnico, cliente, true);
    if (previo === null) throw new ErrorNoEncontrado('No existe un tecnico con ese identificador.');

    const cambiaTipo = peticion.tipo !== undefined && peticion.tipo !== previo.tipo;
    if (cambiaTipo) {
      if ((peticion.motivo ?? '').trim().length < 10) {
        throw new ErrorValidacion('Cambiar de ruta a planta (o al reves) exige motivo escrito.', { motivo: 'Obligatorio.' });
      }
      if (previo.ordenes_abiertas > 0) {
        throw new ErrorDominio(
          'TECNICO_CON_ORDENES',
          `Tiene ${previo.ordenes_abiertas} orden(es) abiertas. Reasignelas antes de cambiarle la modalidad.`,
        );
      }
      // El rol de la cuenta sigue al tipo: es lo que decide su aplicacion.
      await servicioUsuario.actualizar(actor, previo.id_usuario, { codigoRol: ROL_DE_TIPO[peticion.tipo!] });
    }
    if (peticion.nombres !== undefined || peticion.correo !== undefined) {
      await servicioUsuario.actualizar(actor, previo.id_usuario, {
        ...(peticion.nombres !== undefined ? { nombres: peticion.nombres } : {}),
        ...(peticion.correo !== undefined ? { correo: peticion.correo } : {}),
      });
    }

    await repositorio.actualizar(cliente, idTecnico, {
      ...(peticion.especialidad !== undefined ? { especialidad: peticion.especialidad } : {}),
      ...(peticion.disponible !== undefined ? { disponible: peticion.disponible } : {}),
      ...(cambiaTipo ? { tipo: peticion.tipo! } : {}),
    });

    const asientos: AsientoAuditoria[] = [];
    const anotar = (campo: string, antes: string, despues: string | undefined): void => {
      if (despues === undefined || antes === despues) return;
      asientos.push({
        tabla: 'tecnico', idRegistro: idTecnico, accion: ACCION_BITACORA.MODIFICAR,
        campo, valorAnterior: antes, valorNuevo: despues, motivo: peticion.motivo ?? null, idUsuario: actor.id,
      });
    };
    anotar('especialidad', previo.especialidad, peticion.especialidad);
    anotar('disponible', String(previo.disponible), peticion.disponible === undefined ? undefined : String(peticion.disponible));
    anotar('tipo', previo.tipo, peticion.tipo);
    await auditar(cliente, asientos);

    if (cambiaTipo) {
      // La bodega personal ya existe (es 'movil' para los dos tipos); no
      // cambia de nombre para no reescribir el kardex.
      await repositorio.asegurarBodega(cliente, {
        idTecnico, idCentro: previo.id_centro, tipo: peticion.tipo!, nombres: previo.nombres,
      });
    }
  });
  return obtener(idTecnico);
}

export async function desactivar(
  actor: Actor, idTecnico: string, peticion: PeticionDesactivarTecnico,
): Promise<FichaTecnico> {
  await enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idTecnico, cliente, true);
    if (previo === null) throw new ErrorNoEncontrado('No existe un tecnico con ese identificador.');
    if (!previo.activo) throw new ErrorDominio('TECNICO_YA_INACTIVO', 'El tecnico ya estaba dado de baja.');

    const bodega = await repositorio.bodegaDe(idTecnico, cliente);
    if (bodega !== null && bodega.unidades > 0) {
      throw new ErrorDominio(
        'TECNICO_CON_EXISTENCIAS',
        `Tiene ${bodega.unidades} unidad(es) de repuesto en ${bodega.nombre}. Registre la devolucion a bodega `
          + 'antes de darlo de baja: si no, esas piezas quedan a nombre de alguien que ya no trabaja.',
      );
    }

    const ordenes = await repositorio.ordenesAbiertas(idTecnico, cliente);
    const visitas = await repositorio.visitasProgramadas(idTecnico, cliente);
    if (ordenes.length > 0 || visitas.length > 0) {
      if (peticion.idTecnicoReemplazo === undefined) {
        throw new ErrorConflicto(
          `Tiene ${ordenes.length} orden(es) abiertas y ${visitas.length} visita(s) programadas: `
            + `${ordenes.slice(0, 8).map((o) => o.codigo).join(', ')}${ordenes.length > 8 ? '…' : ''}. `
            + 'Elija un tecnico que las reciba para poder darlo de baja.',
          undefined, 'TECNICO_CON_ORDENES', { ordenes: String(ordenes.length), visitas: String(visitas.length) },
        );
      }
      if (!actor.permisos.includes('ordenes.asignar')) {
        throw new ErrorAutorizacion('Reasignar ordenes corresponde a quien despacha tecnicos (permiso de asignar ordenes).');
      }
      if (peticion.idTecnicoReemplazo === idTecnico) {
        throw new ErrorValidacion('El reemplazo tiene que ser otro tecnico.', { idTecnicoReemplazo: 'Elija otro.' });
      }
      const motivo = `Baja del tecnico ${previo.nombres}: ${peticion.motivo}`;
      // Con el servicio de siempre: cada reasignacion deja su asiento con
      // tecnico anterior, nuevo, motivo y quien la hizo.
      for (const orden of ordenes) {
        await servicioOrdenes.asignarTecnico(actor, orden.id, { idTecnico: peticion.idTecnicoReemplazo, motivo });
      }
      for (const visita of visitas) {
        await servicioAgenda.reprogramarVisita(actor, visita.id_orden, {
          idTecnico: peticion.idTecnicoReemplazo,
          fechaProgramada: visita.fecha_programada.toISOString().slice(0, 10),
          franjaHoraria: visita.franja_horaria as never,
          motivo,
        });
      }
    }

    await repositorio.cambiarActivo(cliente, idTecnico, false);
    await auditar(cliente, [{
      tabla: 'tecnico', idRegistro: idTecnico, accion: ACCION_BITACORA.DESACTIVAR,
      campo: 'activo', valorAnterior: 'true', valorNuevo: 'false', motivo: peticion.motivo, idUsuario: actor.id,
    }]);
  });
  return obtener(idTecnico);
}

export async function activar(actor: Actor, idTecnico: string, motivo: string): Promise<FichaTecnico> {
  await enTransaccion(async (cliente) => {
    const previo = await repositorio.buscarPorId(idTecnico, cliente, true);
    if (previo === null) throw new ErrorNoEncontrado('No existe un tecnico con ese identificador.');
    if (previo.activo) throw new ErrorDominio('TECNICO_YA_ACTIVO', 'El tecnico ya esta activo.');
    await repositorio.cambiarActivo(cliente, idTecnico, true);
    await repositorio.actualizar(cliente, idTecnico, { disponible: true });
    await repositorio.asegurarBodega(cliente, {
      idTecnico, idCentro: previo.id_centro, tipo: previo.tipo, nombres: previo.nombres,
    });
    await auditar(cliente, [{
      // La bitacora no tiene accion «activar» (0013): es una modificacion.
      tabla: 'tecnico', idRegistro: idTecnico, accion: ACCION_BITACORA.MODIFICAR,
      campo: 'activo', valorAnterior: 'false', valorNuevo: 'true', motivo, idUsuario: actor.id,
    }]);
  });
  return obtener(idTecnico);
}
