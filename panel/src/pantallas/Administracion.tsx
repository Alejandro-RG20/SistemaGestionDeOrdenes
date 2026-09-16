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

      <h2>Dispositivos moviles</h2>
      <p className="tenue" style={{ marginTop: -6, fontSize: 13 }}>
        Revocar un dispositivo le impide sincronizar. La cola que tenga guardada NO se borra:
        sigue en la tableta hasta que se vuelva a vincular.
      </p>
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
