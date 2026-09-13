/**
 * Reglas de la sesion: iniciarla, refrescarla y cerrarla.
 *
 * Ninguna funcion de aqui conoce codigos HTTP ni objetos de Express. Lanza
 * errores de dominio; el controlador los deja subir y el manejador unico
 * los traduce.
 */
import type { PeticionIniciarSesion, Sesion, UsuarioAutenticado } from '@servitotal/compartido';
import { derivarContrasena, verificarContrasena } from '../../comun/contrasenas.js';
import { leerIntentosParaBloqueo } from '../../comun/configuracion.js';
import { ErrorAutenticacion } from '../../comun/errores.js';
import { bitacora } from '../../comun/bitacora.js';
import { enTransaccion } from '../../comun/transacciones.js';
import { TIPO_TOKEN, emitirPar, verificar } from '../../comun/tokens.js';
import * as repositorioUsuario from './repositorio-usuario.js';
import * as repositorioDispositivo from './repositorio-dispositivo.js';
import { aUsuarioAutenticado } from './dto.js';

/**
 * Mensaje unico para credencial incorrecta, usuario inexistente o cuenta
 * inactiva: distinguirlos le diria a un desconocido que nombres de usuario
 * existen en el centro.
 */
const CREDENCIAL_INCORRECTA = 'El usuario o la contrasena no son correctos.';

/**
 * Hash de descarte con el que se compara cuando el usuario no existe, para
 * que un intento con usuario inexistente tarde lo mismo que uno con usuario
 * real y no se pueda deducir cual es cual por el tiempo de respuesta.
 */
const HASH_DE_DESCARTE = derivarContrasena('contrasena-que-nadie-usa');

export async function cargarUsuarioAutenticado(idUsuario: string): Promise<UsuarioAutenticado | null> {
  const fila = await repositorioUsuario.buscarAutenticado(idUsuario);
  return fila === null ? null : aUsuarioAutenticado(fila);
}

export async function iniciarSesion(peticion: PeticionIniciarSesion): Promise<Sesion> {
  const credencial = await repositorioUsuario.buscarCredencial(peticion.nombreUsuario);

  if (credencial === null) {
    // Se compara igual contra un hash de descarte: sin esto, un intento con
    // usuario inexistente responderia notoriamente mas rapido que uno con
    // usuario real, y eso ya delata que nombres existen.
    verificarContrasena(peticion.contrasena, HASH_DE_DESCARTE);
    throw new ErrorAutenticacion(CREDENCIAL_INCORRECTA, 'CREDENCIAL_INCORRECTA');
  }

  if (!verificarContrasena(peticion.contrasena, credencial.contrasena_hash)) {
    await anotarFalloYBloquear(credencial.id, credencial.nombre_usuario);
    throw new ErrorAutenticacion(CREDENCIAL_INCORRECTA, 'CREDENCIAL_INCORRECTA');
  }

  if (credencial.bloqueado) {
    throw new ErrorAutenticacion(
      'Su cuenta esta bloqueada por intentos fallidos. Pida a la jefatura de atencion al cliente que la desbloquee.',
      'CUENTA_BLOQUEADA',
    );
  }
  if (!credencial.activo) {
    throw new ErrorAutenticacion(CREDENCIAL_INCORRECTA, 'CREDENCIAL_INCORRECTA');
  }

  return enTransaccion(async (cliente) => {
    await repositorioUsuario.reiniciarIntentos(cliente, credencial.id);

    const idDispositivo = peticion.identificadorDispositivo === undefined
      ? undefined
      : await resolverDispositivo(cliente, credencial.id, peticion.identificadorDispositivo);

    const fila = await repositorioUsuario.buscarAutenticado(credencial.id, cliente);
    if (fila === null) throw new ErrorAutenticacion(CREDENCIAL_INCORRECTA, 'CREDENCIAL_INCORRECTA');

    const par = await emitirPar(credencial.id, idDispositivo);
    return { ...par, usuario: aUsuarioAutenticado(fila) };
  });
}

/**
 * Anota el intento fallido en su PROPIA transaccion, que se confirma antes
 * de que el inicio de sesion falle.
 *
 * Si el contador se anotara dentro de la transaccion del inicio de sesion,
 * el ROLLBACK que provoca el error lo borraria y la cuenta no se bloquearia
 * nunca: el mecanismo entero seria decorativo. El contador es un hecho
 * consumado, no parte de la operacion que fracaso.
 */
async function anotarFalloYBloquear(idUsuario: string, nombreUsuario: string): Promise<void> {
  const intentosParaBloqueo = leerIntentosParaBloqueo();
  const estado = await enTransaccion((cliente) =>
    repositorioUsuario.anotarIntentoFallido(cliente, idUsuario, intentosParaBloqueo));

  if (estado.bloqueado) {
    bitacora.advertencia('Cuenta bloqueada por intentos fallidos', {
      nombreUsuario, intentos: estado.intentos_fallidos,
    });
  }
}

/**
 * La sesion movil se ata al dispositivo vinculado. Un dispositivo que no
 * esta vinculado a ese usuario, o que fue revocado, no abre sesion: es el
 * mecanismo de revocacion remota del RF-05.
 */
async function resolverDispositivo(
  cliente: Parameters<Parameters<typeof enTransaccion>[0]>[0],
  idUsuario: string,
  identificador: string,
): Promise<string> {
  const dispositivo = await repositorioDispositivo.buscarPorIdentificador(identificador, cliente);

  if (dispositivo === null || dispositivo.id_usuario !== idUsuario) {
    throw new ErrorAutenticacion(
      'Este dispositivo no esta vinculado a su usuario. Pida a la jefatura que lo vincule.',
      'DISPOSITIVO_NO_VINCULADO',
    );
  }
  if (dispositivo.revocado_en !== null) {
    throw new ErrorAutenticacion(
      'Este dispositivo fue dado de baja. Pida a la jefatura que lo vincule de nuevo.',
      'DISPOSITIVO_REVOCADO',
    );
  }

  await repositorioDispositivo.anotarSincronizacion(cliente, dispositivo.id);
  return dispositivo.id;
}

/**
 * Cambia el token de refresco por un par nuevo. Vuelve a comprobar que el
 * usuario sigue activo y que el dispositivo sigue vigente: de nada sirve
 * revocar si el refresco no lo mira.
 */
export async function refrescarSesion(tokenRefresco: string): Promise<Sesion> {
  const contenido = await verificar(tokenRefresco, TIPO_TOKEN.REFRESCO);

  const fila = await repositorioUsuario.buscarAutenticado(contenido.idUsuario);
  if (fila === null) {
    throw new ErrorAutenticacion(
      'Su cuenta ya no esta activa o quedo bloqueada. Consulte con la jefatura.',
      'CUENTA_NO_VIGENTE',
    );
  }

  if (contenido.idDispositivo !== undefined) {
    const dispositivo = await repositorioDispositivo.buscarVigenteDeUsuario(
      contenido.idDispositivo, contenido.idUsuario,
    );
    if (dispositivo === null) {
      throw new ErrorAutenticacion(
        'Este dispositivo fue dado de baja. Pida a la jefatura que lo vincule de nuevo.',
        'DISPOSITIVO_REVOCADO',
      );
    }
  }

  const par = await emitirPar(contenido.idUsuario, contenido.idDispositivo);
  return { ...par, usuario: aUsuarioAutenticado(fila) };
}

/**
 * Cierre de sesion. Con tokens sin estado, el de acceso caduca solo en
 * minutos; lo que si se corta de inmediato es la sesion del dispositivo,
 * revocandolo. Ver la limitacion documentada en el README.
 */
export async function cerrarSesion(idDispositivo: string | undefined): Promise<void> {
  if (idDispositivo === undefined) return;
  await enTransaccion((cliente) => repositorioDispositivo.anotarSincronizacion(cliente, idDispositivo));
}
