/**
 * Administracion: usuarios, roles y permisos, y dispositivos de campo.
 *
 * Existe un rol de administrador del sistema con todos los permisos. La
 * jefatura de atencion al cliente gestiona al personal desde esta misma
 * pantalla, con los limites que el servidor le impone (no se vuelve
 * administradora ni toca cuentas de administracion). Cada pestaña aparece
 * solo si el permiso que el servidor exige para ella esta presente.
 *
 * Lo que NO hay aqui es tan deliberado como lo que hay: no se borra un
 * usuario, se desactiva; no se ve ninguna contrasena; y la bitacora es de
 * solo lectura porque es inmutable por diseno.
 */
import { useState } from 'react';
import { CODIGO_ROL, type ResumenDispositivo, type ResumenUsuario } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo, Vacio } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';
import { GestionDeUsuarios, RolesYPermisos } from './AdministracionUsuarios.js';
import { GestionDeTecnicos } from './AdministracionTecnicos.js';

type Pestana = 'usuarios' | 'tecnicos' | 'roles' | 'dispositivos';

export function Administracion(): JSX.Element {
  const { usuario } = useSesion();
  const pestanas: { clave: Pestana; nombre: string; permiso: string }[] = [
    { clave: 'usuarios', nombre: 'Usuarios', permiso: 'seguridad.usuario.gestionar' },
    { clave: 'tecnicos', nombre: 'Tecnicos', permiso: 'seguridad.usuario.gestionar' },
    { clave: 'roles', nombre: 'Roles y permisos', permiso: 'seguridad.rol.gestionar' },
    { clave: 'dispositivos', nombre: 'Dispositivos de campo', permiso: 'seguridad.dispositivo.vincular' },
  ];
  const visibles = pestanas.filter((una) => tienePermiso(usuario, una.permiso));
  const [activa, setActiva] = useState<Pestana>(visibles[0]?.clave ?? 'usuarios');

  return (
    <>
      <h2 className="scr">Administracion</h2>
      <p className="sub">
        {usuario?.rol === CODIGO_ROL.ADMINISTRADOR
          ? 'Administracion del sistema: usuarios, roles, permisos y dispositivos.'
          : 'Gestion del personal. Las cuentas y el rol de administracion solo los modifica la administracion del sistema.'}
      </p>
      <div className="tabs">
        {visibles.map((una) => (
          <span key={una.clave} className={activa === una.clave ? 'on' : ''} onClick={() => setActiva(una.clave)}>
            {una.nombre}
          </span>
        ))}
      </div>
      {activa === 'usuarios' ? <GestionDeUsuarios /> : null}
      {activa === 'tecnicos' ? <GestionDeTecnicos /> : null}
      {activa === 'roles' ? <RolesYPermisos /> : null}
      {activa === 'dispositivos' ? <Dispositivos /> : null}
    </>
  );
}

function Dispositivos(): JSX.Element {
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

  /** El servidor exige motivo para revocar; sin el, la llamada siempre fallaba. */
  async function revocar(id: string): Promise<void> {
    const motivo = window.prompt('Motivo de la revocacion (minimo 10 caracteres; queda en la bitacora):');
    if (motivo === null) return;
    if (motivo.trim().length < 10) {
      setError('Escriba el motivo de la revocacion: al menos 10 caracteres.');
      return;
    }
    setTrabajando(true);
    setError(null);
    try {
      await api.pedir(`/dispositivos/${id}/revocar`, { metodo: 'POST', cuerpo: { motivo: motivo.trim() } });
      dispositivos.recargar();
    } catch (problema) {
      setError(problema instanceof ErrorDeApi ? problema.message : 'No se pudo revocar.');
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <>
      {error === null ? null : <div className="alert"><p>{error}</p></div>}

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
