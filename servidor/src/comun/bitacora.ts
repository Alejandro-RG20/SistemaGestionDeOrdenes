/**
 * Registro de actividad del proceso. Toda excepcion se registra o se
 * propaga; nunca se captura y se silencia.
 */
const NIVELES = { depuracion: 10, informacion: 20, advertencia: 30, error: 40 } as const;
type Nivel = keyof typeof NIVELES;

const nivelMinimo: Nivel = (process.env['NIVEL_BITACORA'] as Nivel) in NIVELES
  ? (process.env['NIVEL_BITACORA'] as Nivel)
  : 'informacion';

function emitir(nivel: Nivel, mensaje: string, datos?: Record<string, unknown>): void {
  if (NIVELES[nivel] < NIVELES[nivelMinimo]) return;
  const linea = `${new Date().toISOString()} [${nivel.toUpperCase()}] ${mensaje}`;
  const salida = nivel === 'error' ? console.error : console.log;
  if (datos === undefined) salida(linea);
  else salida(linea, JSON.stringify(datos));
}

export const bitacora = {
  depuracion: (mensaje: string, datos?: Record<string, unknown>) => emitir('depuracion', mensaje, datos),
  informacion: (mensaje: string, datos?: Record<string, unknown>) => emitir('informacion', mensaje, datos),
  advertencia: (mensaje: string, datos?: Record<string, unknown>) => emitir('advertencia', mensaje, datos),
  error: (mensaje: string, datos?: Record<string, unknown>) => emitir('error', mensaje, datos),
};
