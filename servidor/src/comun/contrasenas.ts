/**
 * Derivacion de contrasenas con scrypt de la biblioteca estandar de Node.
 * Se usa aqui para sembrar credenciales de prueba; la autenticacion completa
 * (intentos fallidos, bloqueo, sesiones) es materia de la etapa 2.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const COSTO = 16_384; // N
const BLOQUE = 8; // r
const PARALELISMO = 1; // p
const LARGO_CLAVE = 32;
const ETIQUETA = 'scrypt';

export function derivarContrasena(contrasena: string, salAlternativa?: Buffer): string {
  const sal = salAlternativa ?? randomBytes(16);
  const clave = scryptSync(contrasena, sal, LARGO_CLAVE, { N: COSTO, r: BLOQUE, p: PARALELISMO });
  return [ETIQUETA, COSTO, BLOQUE, PARALELISMO, sal.toString('base64'), clave.toString('base64')].join('$');
}

export function verificarContrasena(contrasena: string, almacenada: string): boolean {
  const partes = almacenada.split('$');
  if (partes.length !== 6 || partes[0] !== ETIQUETA) return false;
  const [, costo, bloque, paralelismo, salBase64, claveBase64] = partes as [string, string, string, string, string, string];
  const esperada = Buffer.from(claveBase64, 'base64');
  const calculada = scryptSync(contrasena, Buffer.from(salBase64, 'base64'), esperada.length, {
    N: Number(costo), r: Number(bloque), p: Number(paralelismo),
  });
  return calculada.length === esperada.length && timingSafeEqual(calculada, esperada);
}
