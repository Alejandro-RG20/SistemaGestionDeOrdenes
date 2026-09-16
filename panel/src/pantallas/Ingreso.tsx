/**
 * Ingreso al panel.
 *
 * El mensaje de error sale del servidor sin retocar. Eso importa aqui mas
 * que en ningun otro sitio: cuando una cuenta se bloquea por intentos
 * fallidos, el servidor lo dice con todas las letras, y traducirlo a
 * "credenciales invalidas" dejaria a la persona probando la misma
 * contrasena hasta que alguien le explique.
 */
import { useState } from 'react';
import { useSesion } from '../sesion/contexto.js';
import { ErrorDeApi } from '../api/cliente.js';

export function Ingreso(): JSX.Element {
  const { entrar } = useSesion();
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function enviar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    setTrabajando(true);
    setError(null);
    try {
      await entrar(nombreUsuario.trim(), contrasena);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo iniciar sesion.');
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="ingreso">
      <div className="tarjeta">
        <h1>ServiTotal</h1>
        <p className="subtitulo">Taller Distrito VI · Managua</p>

        <form onSubmit={enviar}>
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            value={nombreUsuario}
            onChange={(evento) => setNombreUsuario(evento.target.value)}
            autoComplete="username"
            autoFocus
          />

          <label htmlFor="contrasena">Contrasena</label>
          <input
            id="contrasena"
            type="password"
            value={contrasena}
            onChange={(evento) => setContrasena(evento.target.value)}
            autoComplete="current-password"
          />

          {error === null ? null : (
            <div className="aviso aviso-error" style={{ marginTop: 16 }}><p>{error}</p></div>
          )}

          <div className="acciones">
            <button
              type="submit"
              className="boton"
              disabled={trabajando || nombreUsuario.trim() === '' || contrasena === ''}
            >
              {trabajando ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
        </form>

        <p className="tenue" style={{ marginTop: 22, fontSize: 13 }}>
          ¿Es cliente y quiere saber como va su articulo?{' '}
          <a href="/consulta">Consulte su orden aqui</a>.
        </p>
      </div>
    </div>
  );
}
