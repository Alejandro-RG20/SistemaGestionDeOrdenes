/**
 * El alcance por datos: no QUE puede hacer el usuario, sino SOBRE QUE.
 *
 * El permiso y el alcance son dos preguntas distintas y el sistema las
 * contestaba a medias. Un tecnico tiene `ordenes.consultar` —y debe
 * tenerlo, sin eso no puede abrir la orden que va a reparar—, pero ese
 * permiso lo dejaba ver las treinta mil ordenes del taller y abrir la de
 * cualquier compañero con el telefono y la direccion de casa del cliente
 * dentro. Se comprobo contra el sistema corriendo.
 *
 * Aqui estan las dos reglas, juntas y en un solo archivo, porque la
 * tentacion es ponerlas en cada consulta y olvidarlas en la decima:
 *
 *   - usuario de tienda: solo las ordenes de SU sucursal.
 *   - tecnico: solo las ordenes que tiene ASIGNADAS.
 *
 * Quien no es ninguna de las dos cosas no tiene cerco, y eso es correcto:
 * el taller repara lo que entra por cualquier sucursal y la jefatura
 * necesita ver el conjunto para repartir el trabajo.
 */
import { CODIGO_ROL } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import type { Ejecutor } from '../../comun/transacciones.js';
import { ErrorAutorizacion, ErrorNoEncontrado } from '../../comun/errores.js';
import * as repositorio from './repositorio.js';

/** Los roles cuyo trabajo es una orden concreta, no la bandeja entera. */
const ROLES_ACOTADOS_AL_TECNICO: readonly string[] = [
  CODIGO_ROL.TECNICO_RUTA, CODIGO_ROL.TECNICO_PLANTA,
];

/**
 * Lo unico que el cerco necesita mirar de la orden. `id_tienda` es
 * opcional porque no toda consulta la trae; ausente cuenta como nula.
 */
export interface OrdenCercada {
  readonly id_tienda?: string | null;
  readonly id_tecnico: string | null;
  /**
   * Quien levanto la orden.
   *
   * Hace falta para el tecnico de ruta: una orden que el acaba de levantar
   * en la casa del cliente todavia no esta asignada a nadie, y sin esta
   * columna el cerco se la bloqueaba a el mismo —no podia registrar la
   * visita de la orden que acababa de crear—. Es opcional porque no toda
   * consulta la trae; ausente cuenta como nula.
   */
  readonly creado_por?: string | null;
}

export interface AlcanceDeOrdenes {
  readonly idTienda: string | null;
  readonly idTecnico: string | null;
  /** El usuario del actor, para admitir las ordenes que el levanto. */
  readonly idUsuario: string | null;
}

/**
 * Resuelve el cerco del actor.
 *
 * La consulta del tecnico solo se hace para los roles que la necesitan: no
 * tiene sentido buscarle una ficha de tecnico a la jefa de compras en cada
 * peticion.
 */
export async function alcanceDe(
  actor: Actor, ejecutor?: Ejecutor,
): Promise<AlcanceDeOrdenes> {
  const idTienda = actor.idTienda ?? null;

  if (!ROLES_ACOTADOS_AL_TECNICO.includes(actor.rol)) {
    return { idTienda, idTecnico: null, idUsuario: null };
  }

  const tecnico = await repositorio.buscarTecnicoDeUsuario(actor.id, ejecutor);
  if (tecnico === null) {
    /*
     * Un usuario con rol de tecnico y sin ficha de tecnico no puede quedar
     * con el cerco abierto. Es una incoherencia de datos y la respuesta
     * segura es no dejarle ver ninguna orden, no dejarle ver todas.
     */
    throw new ErrorAutorizacion(
      'Su usuario tiene rol de tecnico pero no tiene ficha de tecnico asociada. ' +
        'Avise a la jefatura para que la complete.',
    );
  }
  return { idTienda, idTecnico: tecnico.id, idUsuario: actor.id };
}

/** Mete el cerco en el WHERE de la consulta. Nunca lo ensancha. */
export function conCerco(
  alcance: AlcanceDeOrdenes, filtro: repositorio.FiltroOrdenes,
): repositorio.FiltroOrdenes {
  return {
    ...filtro,
    ...(alcance.idTienda === null ? {} : { idTienda: alcance.idTienda }),
    ...(alcance.idTecnico === null
      ? {}
      : { idTecnicoAlcance: alcance.idTecnico, idCreadorAlcance: alcance.idUsuario ?? undefined }),
  };
}

/** Si la orden cae dentro del cerco. */
export function alcanza(
  alcance: AlcanceDeOrdenes, orden: OrdenCercada,
): boolean {
  if (alcance.idTienda !== null && (orden.id_tienda ?? null) !== alcance.idTienda) return false;
  if (alcance.idTecnico !== null) {
    const asignada = orden.id_tecnico === alcance.idTecnico;
    // La levanto el: pasa aunque todavia no este asignada. Es el caso del
    // tecnico de ruta que crea la orden en la casa del cliente y enseguida
    // registra la visita sobre ella.
    const suya = alcance.idUsuario !== null && (orden.creado_por ?? null) === alcance.idUsuario;
    if (!asignada && !suya) return false;
  }
  return true;
}

/**
 * Exige el cerco sobre una orden concreta. Lanza 403 si no.
 *
 * Responde 403 y no 404, que es lo que el pliego pide (§13). Tiene un coste
 * que vale la pena nombrar: un 403 confirma que la orden existe, y quien
 * pruebe identificadores al azar aprende algo de cada respuesta. Se asume
 * porque los identificadores son UUID —no se adivinan contando— y porque un
 * 403 le dice la verdad al tecnico que abrio un enlace que le pasaron:
 * «esta orden no es suya», que es un mensaje que puede entender, en vez de
 * «no existe», que lo manda a buscar un error que no hay.
 */
export function exigirCerco(
  alcance: AlcanceDeOrdenes, orden: OrdenCercada,
): void {
  if (alcanza(alcance, orden)) return;
  if (alcance.idTecnico !== null) {
    throw new ErrorAutorizacion('Esta orden no esta asignada a usted.');
  }
  throw new ErrorAutorizacion('Esta orden pertenece a otra sucursal.');
}

/**
 * Resuelve el cerco y lo exige sobre una orden, por identificador.
 *
 * Es la puerta que usan los modulos de afuera —evidencias, transiciones—
 * para no repetir las tres lineas de siempre y no olvidarse de una.
 */
export async function exigirCercoSobreOrden(
  actor: Actor, idOrden: string, ejecutor?: Ejecutor,
): Promise<void> {
  const orden = await repositorio.buscarCerco(idOrden, ejecutor);
  if (orden === null) {
    throw new ErrorNoEncontrado('No existe una orden con ese identificador.');
  }
  exigirCerco(await alcanceDe(actor, ejecutor), orden);
}
