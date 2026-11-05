/**
 * Cierre de sesion por inactividad (RF-06).
 *
 * En el panel, una sesion abierta en una computadora del mostrador sin
 * nadie delante es una puerta abierta: se cierra tras un tiempo sin
 * actividad. En la aplicacion de campo NO: el tecnico puede pasar una hora
 * en una casa sin señal, y si se le cerrara la sesion no podria volver a
 * entrar hasta tener conexion. Lo registrado sin conexion no depende de la
 * sesion (vive en el dispositivo), pero seguir trabajando si.
 */

/** Minutos sin actividad tras los que se cierra la sesion del panel. */
export const MINUTOS_DE_INACTIVIDAD = 30;

export const MENSAJE_INACTIVIDAD =
  `Su sesion se cerro tras ${MINUTOS_DE_INACTIVIDAD} minutos sin actividad. Vuelva a ingresar.`;

export function debeCerrarPorInactividad(
  ultimaActividad: number, ahora: number, ruta: string, minutos = MINUTOS_DE_INACTIVIDAD,
): boolean {
  if (ruta === '/campo' || ruta.startsWith('/campo/')) return false;
  return ahora - ultimaActividad >= minutos * 60_000;
}
