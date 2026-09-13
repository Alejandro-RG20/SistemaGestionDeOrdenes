/**
 * Emision y verificacion de los JWT.
 *
 * Dos tokens por sesion:
 *  · acceso, de vida corta, que acompana cada peticion;
 *  · refresco, de vida larga, que solo sirve para pedir uno de acceso.
 *
 * El token dice QUIEN es el usuario, nunca QUE puede hacer: los permisos se
 * leen de rol_permiso en cada peticion (regla de arquitectura 7). Asi,
 * quitarle un permiso a un rol surte efecto en la peticion siguiente y no
 * cuando expire el token.
 */
import { SignJWT, jwtVerify, errors as erroresJose } from 'jose';
import { leerConfiguracionTokens } from './configuracion.js';
import { ErrorAutenticacion } from './errores.js';

export const TIPO_TOKEN = { ACCESO: 'acceso', REFRESCO: 'refresco' } as const;
export type TipoToken = (typeof TIPO_TOKEN)[keyof typeof TIPO_TOKEN];

export interface ContenidoToken {
  readonly idUsuario: string;
  readonly tipo: TipoToken;
  /** Dispositivo movil al que esta atada la sesion, si lo hay. */
  readonly idDispositivo?: string;
}

export interface ParTokens {
  readonly tokenAcceso: string;
  readonly tokenRefresco: string;
  readonly expiraEn: number;
}

function claveDeFirma(): Uint8Array {
  return new TextEncoder().encode(leerConfiguracionTokens().secreto);
}

async function firmar(contenido: ContenidoToken, expiracion: string): Promise<string> {
  const configuracion = leerConfiguracionTokens();
  const cuerpo: Record<string, unknown> = { tipo: contenido.tipo };
  if (contenido.idDispositivo !== undefined) cuerpo['dispositivo'] = contenido.idDispositivo;

  return new SignJWT(cuerpo)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(contenido.idUsuario)
    .setIssuer(configuracion.emisor)
    .setAudience(configuracion.audiencia)
    .setIssuedAt()
    .setExpirationTime(expiracion)
    .sign(claveDeFirma());
}

export async function emitirPar(
  idUsuario: string,
  idDispositivo?: string,
): Promise<ParTokens> {
  const configuracion = leerConfiguracionTokens();
  const vidaRefresco = idDispositivo === undefined
    ? `${configuracion.horasRefrescoPanel}h`
    : `${configuracion.diasRefrescoDispositivo}d`;

  const [tokenAcceso, tokenRefresco] = await Promise.all([
    firmar({ idUsuario, tipo: TIPO_TOKEN.ACCESO, idDispositivo }, `${configuracion.minutosAcceso}m`),
    firmar({ idUsuario, tipo: TIPO_TOKEN.REFRESCO, idDispositivo }, vidaRefresco),
  ]);

  return { tokenAcceso, tokenRefresco, expiraEn: configuracion.minutosAcceso * 60 };
}

/**
 * Verifica firma, emisor, audiencia, vencimiento y tipo. Un token de
 * refresco presentado como si fuera de acceso se rechaza: son credenciales
 * distintas con vidas distintas.
 */
export async function verificar(token: string, tipoEsperado: TipoToken): Promise<ContenidoToken> {
  const configuracion = leerConfiguracionTokens();
  try {
    const { payload } = await jwtVerify(token, claveDeFirma(), {
      issuer: configuracion.emisor,
      audience: configuracion.audiencia,
      algorithms: ['HS256'],
    });

    if (payload.sub === undefined || payload['tipo'] !== tipoEsperado) {
      throw new ErrorAutenticacion('La credencial presentada no sirve para esta operacion.');
    }

    const dispositivo = payload['dispositivo'];
    return {
      idUsuario: payload.sub,
      tipo: tipoEsperado,
      ...(typeof dispositivo === 'string' ? { idDispositivo: dispositivo } : {}),
    };
  } catch (error) {
    if (error instanceof ErrorAutenticacion) throw error;
    if (error instanceof erroresJose.JWTExpired) {
      throw new ErrorAutenticacion('Su sesion expiro. Vuelva a iniciar sesion.', 'SESION_EXPIRADA', error);
    }
    throw new ErrorAutenticacion('La sesion no es valida. Vuelva a iniciar sesion.', 'NO_AUTENTICADO', error);
  }
}
