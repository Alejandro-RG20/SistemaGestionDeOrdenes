/**
 * W-01 · Acceso.
 *
 * El mensaje de error sale del servidor sin retocar, y aqui importa mas que
 * en ningun otro sitio: cuando una cuenta se bloquea por intentos fallidos,
 * el servidor lo dice con todas las letras. Traducirlo a «credenciales
 * invalidas» dejaria a la persona probando la misma contrasena hasta que
 * alguien le explique.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
    <div className="login">
      <div className="loginbox">
        <div className="brand">Servi<span>Total</span></div>
        <p className="sub">Gestion de ordenes · Distrito VI</p>

        <form onSubmit={enviar}>
          <div style={{ marginBottom: 11 }}>
            <label htmlFor="usuario">Usuario</label>
            <input
              id="usuario"
              value={nombreUsuario}
              onChange={(evento) => setNombreUsuario(evento.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="contrasena">Contrasena</label>
            <input
              id="contrasena"
              type="password"
              value={contrasena}
              onChange={(evento) => setContrasena(evento.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error === null ? null : (
            <div className="alert" style={{ marginBottom: 12 }}><span>{error}</span></div>
          )}

          <button
            type="submit"
            className="btn pri"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={trabajando || nombreUsuario.trim() === '' || contrasena === ''}
          >
            {trabajando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p style={{ fontSize: 11, color: 'var(--soft)', margin: '13px 0 0', textAlign: 'center' }}>
          ¿Es cliente?{' '}
          <Link to="/consulta" style={{ color: 'var(--teal)', fontWeight: 600 }}>
            Consulte su orden aqui
          </Link>
        </p>
      </div>
    </div>
  );
}
