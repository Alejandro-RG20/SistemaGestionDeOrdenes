/**
 * Administracion: usuarios, dispositivos y bitacora.
 *
 * No hay rol de administrador. La jefatura de atencion al cliente administra
 * el sistema, y esta pantalla es lo que eso significa en la practica.
 *
 * Lo que NO hay aqui es tan deliberado como lo que hay: no se borra un
 * usuario, se desactiva; no se ve ninguna contrasena; y la bitacora es de
 * solo lectura porque es inmutable por diseno.
 */
import { useState } from 'react';
import type { ResumenDispositivo, ResumenUsuario } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo, Vacio } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

export function Administracion(): JSX.Element {
  const { api } = useSesion();
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [usuarioAVincular, setUsuarioAVincular] = useState('');
  const [identificadorAVincular, setIdentificadorAVincular] = useState('');
  const [modeloAVincular, setModeloAVincular] = useState('');

  const usuarios = useRecurso<PaginaDeDatos<ResumenUsuario>>(
    () => api.pedirPagina<ResumenUsuario>('/usuarios', { tamano: 100 }), [],
  );
  const dispositivos = useRecurso<PaginaDeDatos<ResumenDispositivo>>(
    () => api.pedirPagina<ResumenDispositivo>('/dispositivos', { tamano: 100 }), [],
  );

  async function desbloquear(id: string): Promise<void> {
    setTrabajando(true);
    setError(null);
    try {
      await api.pedir(`/usuarios/${id}/desbloquear`, { metodo: 'POST' });
      usuarios.recargar();
    } catch (problema) {
      setError(problema instanceof ErrorDeApi ? problema.message : 'No se pudo desbloquear.');
    } finally {
      setTrabajando(false);
    }
  }

  /**
   * Autoriza un dispositivo. Desde que el sistema es web, «dispositivo» es
   * el NAVEGADOR de un telefono o de una laptop, y el identificador es el
   * que el tecnico lee en su propia pantalla cuando el envio le falla.
   *
   * Sigue siendo la jefatura quien autoriza, uno por uno. Es lo que hace
   * que revocar sirva de algo: si un navegador se autorizara solo al
   * entrar, revocarlo no pararia a nadie —volveria a autorizarse en el
   * siguiente inicio de sesion— y el RF-05 seria decorativo.
   */
  async function vincular(): Promise<void> {
    setTrabajando(true);
    setError(null);
    try {
      await api.pedir('/dispositivos', {
        metodo: 'POST',
        cuerpo: {
          idUsuario: usuarioAVincular,
          identificador: identificadorAVincular.trim(),
          ...(modeloAVincular.trim() === '' ? {} : { modelo: modeloAVincular.trim() }),
        },
      });
      setIdentificadorAVincular('');
      setModeloAVincular('');
      dispositivos.recargar();
    } catch (problema) {
      setError(problema instanceof ErrorDeApi ? problema.message : 'No se pudo autorizar.');
    } finally {
      setTrabajando(false);
    }
  }

  async function revocar(id: string): Promise<void> {
    setTrabajando(true);
    setError(null);
    try {
      await api.pedir(`/dispositivos/${id}/revocar`, { metodo: 'POST' });
      dispositivos.recargar();
    } catch (problema) {
      setError(problema instanceof ErrorDeApi ? problema.message : 'No se pudo revocar.');
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <>
      <h2 className="scr">Administracion</h2>
      <p className="sub">
        No existe un rol de administrador aparte: esta jefatura administra el sistema.
      </p>

      {error === null ? null : <div className="alert"><p>{error}</p></div>}

      <h2>Usuarios</h2>
      {usuarios.cargando ? <Cargando que="los usuarios" /> : null}
      {usuarios.error !== null
        ? <Fallo error={usuarios.error} alReintentar={usuarios.recargar} />
        : null}
      {usuarios.datos !== null && usuarios.error === null ? (
        <table>
          <thead>
            <tr>
              <th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.datos.datos.map((usuario) => (
              <tr key={usuario.id}>
                <td>{usuario.nombreUsuario}</td>
                <td>{usuario.nombres}</td>
                <td className="tenue">{usuario.rol.replace(/_/g, ' ')}</td>
                <td>
                  {usuario.bloqueado ? (
                    <span className="tag t-r">bloqueado</span>
                  ) : usuario.activo ? (
                    <span className="tag t-t">activo</span>
                  ) : (
                    <span className="tag t-b">desactivado</span>
                  )}
                </td>
                <td>
                  {usuario.bloqueado ? (
                    <button
                      type="button" className="btn" disabled={trabajando}
                      onClick={() => void desbloquear(usuario.id)}
                    >
                      Desbloquear
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <h2>Dispositivos de campo</h2>
      <p className="tenue" style={{ marginTop: -6, fontSize: 13 }}>
        Un dispositivo es el <b>navegador</b> del telefono o la laptop con que el tecnico
        entra al sistema. Mientras no este autorizado, su trabajo se le guarda en el
        aparato pero no sube. Revocarlo le impide enviar; la cola que tenga guardada
        <b> no se borra</b>: sigue ahi por si se vuelve a autorizar.
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Autorizar un dispositivo</h3>
        <div className="g g3">
          <div>
            <label htmlFor="usuario-dispositivo">Tecnico</label>
            <select
              id="usuario-dispositivo"
              value={usuarioAVincular}
              onChange={(evento) => setUsuarioAVincular(evento.target.value)}
            >
              <option value="">Elija a quien pertenece</option>
              {(usuarios.datos?.datos ?? []).map((usuario) => (
                <option key={usuario.id} value={usuario.id}>
                  {usuario.nombres} · {usuario.nombreUsuario}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="identificador-dispositivo">Codigo que le dicto el tecnico</label>
            <input
              id="identificador-dispositivo"
              value={identificadorAVincular}
              onChange={(evento) => setIdentificadorAVincular(evento.target.value)}
              placeholder="web-…"
            />
          </div>
          <div>
            <label htmlFor="modelo-dispositivo">De que aparato es (opcional)</label>
            <input
              id="modelo-dispositivo"
              value={modeloAVincular}
              onChange={(evento) => setModeloAVincular(evento.target.value)}
              placeholder="Celular de D. Hernandez"
            />
          </div>
        </div>
        <button
          type="button"
          className="btn pri"
          style={{ marginTop: 10 }}
          disabled={trabajando || usuarioAVincular === '' || identificadorAVincular.trim().length < 3}
          onClick={() => void vincular()}
        >
          Autorizar este dispositivo
        </button>
      </div>
      {dispositivos.cargando ? <Cargando que="los dispositivos" /> : null}
      {dispositivos.error !== null
        ? <Fallo error={dispositivos.error} alReintentar={dispositivos.recargar} />
        : null}
      {dispositivos.datos !== null && dispositivos.error === null ? (
        dispositivos.datos.datos.length === 0 ? (
          <Vacio>No hay dispositivos vinculados.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Identificador</th><th>Usuario</th><th>Modelo</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {dispositivos.datos.datos.map((dispositivo) => (
                <tr key={dispositivo.id}>
                  <td className="tenue" style={{ fontSize: 12 }}>{dispositivo.identificador}</td>
                  <td>{dispositivo.nombreUsuario}</td>
                  <td className="tenue">{dispositivo.modelo ?? '—'}</td>
                  <td>
                    {dispositivo.revocadoEn === null
                      ? <span className="tag t-t">vigente</span>
                      : <span className="tag t-r">revocado</span>}
                  </td>
                  <td>
                    {dispositivo.revocadoEn === null ? (
                      <button
                        type="button" className="btn peligro" disabled={trabajando}
                        onClick={() => void revocar(dispositivo.id)}
                      >
                        Revocar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </>
  );
}
