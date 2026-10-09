/**
 * Administracion · usuarios, roles y permisos.
 *
 * Hay un rol de administrador del sistema, con todos los permisos. La
 * jefatura de atencion al cliente tambien gestiona al personal —altas,
 * contrasenas, desbloqueos— pero no es administradora: el servidor le
 * impide asignar el rol de administrador, tocar cuentas de administracion,
 * cambiarse el rol y conceder permisos que ella misma no tiene. Esta
 * pantalla solo refleja esas reglas para no ofrecer lo que se va a
 * rechazar; quien las hace cumplir es el servidor.
 *
 * Nada se borra: un usuario se desactiva y se puede reactivar. Toda accion
 * sensible pide confirmacion y, cuando el servidor lo exige, un motivo que
 * queda en la bitacora.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CODIGO_ROL,
  type CodigoRol, type ResumenPermiso, type ResumenRol, type ResumenUsuario,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio, fechaCorta } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';

const nombreDeRol = (codigo: string): string => codigo.replace(/_/g, ' ');

function mensajeDe(fallo: unknown, porDefecto: string): string {
  return fallo instanceof ErrorDeApi ? fallo.message : porDefecto;
}

/** Roles que se pueden elegir. Si no se pueden leer, los del contrato. */
function useRoles(): readonly { codigo: CodigoRol; nombre: string; activo: boolean }[] {
  const { api, usuario } = useSesion();
  const puedeLeer = tienePermiso(usuario, 'seguridad.rol.gestionar');
  const roles = useRecurso<PaginaDeDatos<ResumenRol> | null>(
    () => (puedeLeer
      ? api.pedirPagina<ResumenRol>('/roles', { tamano: 50 }).catch(() => null)
      : Promise.resolve(null)),
    [puedeLeer],
  );
  return useMemo(() => (roles.datos === null
    ? Object.values(CODIGO_ROL).map((codigo) => ({ codigo, nombre: nombreDeRol(codigo), activo: true }))
    : roles.datos.datos.map((rol) => ({ codigo: rol.codigo, nombre: rol.nombre, activo: rol.activo }))),
  [roles.datos]);
}

// ── usuarios ───────────────────────────────────────────────────────────

export function GestionDeUsuarios(): JSX.Element {
  const { api, usuario: yo } = useSesion();
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [rol, setRol] = useState('');
  const [conInactivos, setConInactivos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [creando, setCreando] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const roles = useRoles();

  useEffect(() => {
    const temporizador = setTimeout(() => setConsulta(texto.trim()), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);
  useEffect(() => { setPagina(1); }, [consulta, rol, conInactivos]);

  const usuarios = useRecurso<PaginaDeDatos<ResumenUsuario>>(
    () => api.pedirPagina<ResumenUsuario>('/usuarios', {
      texto: consulta === '' ? undefined : consulta,
      rol: rol === '' ? undefined : rol,
      soloActivos: conInactivos ? 'false' : undefined,
      pagina,
      tamano: 25,
    }),
    [consulta, rol, conInactivos, pagina],
  );

  const alTerminar = (mensaje: string): void => {
    setAviso(mensaje);
    setCreando(false);
    usuarios.recargar();
  };

  return (
    <>
      {aviso === null ? null : <Aviso tono="ok">{aviso}</Aviso>}
      <div className="filtros">
        <div style={{ minWidth: 260 }}>
          <label htmlFor="buscar-usuario">Buscar</label>
          <input
            id="buscar-usuario" value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre o usuario"
          />
        </div>
        <div>
          <label htmlFor="filtro-rol">Rol</label>
          <select id="filtro-rol" value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="">Todos</option>
            {roles.map((uno) => <option key={uno.codigo} value={uno.codigo}>{uno.nombre}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filtro-estado">Incluir</label>
          <select
            id="filtro-estado" value={conInactivos ? '1' : ''}
            onChange={(e) => setConInactivos(e.target.value === '1')}
          >
            <option value="">Solo activos</option>
            <option value="1">Activos y desactivados</option>
          </select>
        </div>
      </div>

      <div className="tools" style={{ marginBottom: 12 }}>
        <button type="button" className="btn pri" onClick={() => { setCreando(!creando); setElegido(null); }}>
          {creando ? 'Cancelar alta' : 'Nuevo usuario'}
        </button>
      </div>
      {creando ? <AltaDeUsuario roles={roles} alTerminar={alTerminar} alCancelar={() => setCreando(false)} /> : null}

      {elegido === null ? null : (
        <FichaDeUsuario
          key={elegido}
          idUsuario={elegido}
          roles={roles}
          esUnoMismo={yo?.id === elegido}
          alTerminar={(mensaje) => { alTerminar(mensaje); }}
          alCerrar={() => setElegido(null)}
        />
      )}

      {usuarios.cargando ? <Cargando que="los usuarios" /> : null}
      {usuarios.error !== null ? <Fallo error={usuarios.error} alReintentar={usuarios.recargar} /> : null}
      {usuarios.datos !== null && usuarios.error === null ? (
        usuarios.datos.datos.length === 0 ? <Vacio>Ningun usuario coincide con el filtro.</Vacio> : (
          <table>
            <thead>
              <tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Alta</th><th></th></tr>
            </thead>
            <tbody>
              {usuarios.datos.datos.map((uno) => (
                <tr key={uno.id}>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{uno.nombreUsuario}</td>
                  <td>{uno.nombres}{yo?.id === uno.id ? <span className="tenue"> (usted)</span> : null}</td>
                  <td className="tenue">{nombreDeRol(uno.rol)}</td>
                  <td><EstadoDeCuenta usuario={uno} /></td>
                  <td className="tenue">{fechaCorta(uno.creadoEn)}</td>
                  <td>
                    <button type="button" className="btn chico" onClick={() => { setElegido(uno.id); setCreando(false); }}>
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      {usuarios.datos !== null && usuarios.datos.paginacion.totalPaginas > 1 ? (
        <div className="paginacion">
          <button type="button" className="btn chico" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </button>
          <span>Pagina {usuarios.datos.paginacion.pagina} de {usuarios.datos.paginacion.totalPaginas}</span>
          <button
            type="button" className="btn chico" disabled={pagina >= usuarios.datos.paginacion.totalPaginas}
            onClick={() => setPagina(pagina + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </>
  );
}

function EstadoDeCuenta({ usuario }: { usuario: ResumenUsuario }): JSX.Element {
  if (!usuario.activo) return <span className="tag t-g">desactivado</span>;
  if (usuario.bloqueado) return <span className="tag t-r">bloqueado</span>;
  return <span className="tag t-t">activo</span>;
}

interface PropsRoles {
  readonly roles: readonly { codigo: CodigoRol; nombre: string; activo: boolean }[];
}

function AltaDeUsuario(
  { roles, alTerminar, alCancelar }: PropsRoles & { alTerminar: (m: string) => void; alCancelar: () => void },
): JSX.Element {
  const { api, usuario: yo } = useSesion();
  const soyAdministrador = yo?.rol === CODIGO_ROL.ADMINISTRADOR;
  const [datos, setDatos] = useState({ nombreUsuario: '', nombres: '', correo: '', contrasena: '', repetir: '', codigoRol: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const poner = (clave: keyof typeof datos) =>
    (evento: { target: { value: string } }) => setDatos({ ...datos, [clave]: evento.target.value });

  const coinciden = datos.contrasena === datos.repetir;
  const listo = datos.nombreUsuario.trim().length >= 3 && datos.nombres.trim().length >= 3
    && datos.contrasena.length >= 10 && coinciden && datos.codigoRol !== '';

  async function guardar(): Promise<void> {
    setGuardando(true); setError(null); setCampos({});
    try {
      await api.pedir('/usuarios', {
        metodo: 'POST',
        cuerpo: {
          nombreUsuario: datos.nombreUsuario.trim().toLowerCase(),
          nombres: datos.nombres.trim(),
          contrasena: datos.contrasena,
          codigoRol: datos.codigoRol,
          correo: datos.correo.trim() === '' ? null : datos.correo.trim(),
        },
      });
      alTerminar(`Usuario ${datos.nombreUsuario.trim()} creado. Ya puede iniciar sesion.`);
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo crear el usuario.'));
      setCampos(fallo instanceof ErrorDeApi ? fallo.campos ?? {} : {});
    } finally {
      setGuardando(false);
    }
  }

  const pista = (clave: string): JSX.Element | null =>
    (campos[clave] === undefined ? null : <small style={{ color: 'var(--red)' }}>{campos[clave]}</small>);

  return (
    <Tarjeta titulo="Nuevo usuario">
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
      <div className="g g3">
        <div>
          <label>Nombre de usuario *</label>
          <input value={datos.nombreUsuario} onChange={poner('nombreUsuario')} placeholder="nombre.apellido" autoComplete="off" />
          {pista('nombreUsuario')}
        </div>
        <div><label>Nombre completo *</label><input value={datos.nombres} onChange={poner('nombres')} />{pista('nombres')}</div>
        <div><label>Correo</label><input value={datos.correo} onChange={poner('correo')} type="email" />{pista('correo')}</div>
        <div>
          <label>Contrasena * (minimo 10)</label>
          <input value={datos.contrasena} onChange={poner('contrasena')} type="password" autoComplete="new-password" />
          {pista('contrasena')}
        </div>
        <div>
          <label>Repetir contrasena *</label>
          <input value={datos.repetir} onChange={poner('repetir')} type="password" autoComplete="new-password" />
          {coinciden ? null : <small style={{ color: 'var(--red)' }}>No coinciden.</small>}
        </div>
        <div>
          <label>Rol *</label>
          <select value={datos.codigoRol} onChange={poner('codigoRol')}>
            <option value="">Elija un rol</option>
            {roles
              .filter((uno) => uno.activo && (soyAdministrador || uno.codigo !== CODIGO_ROL.ADMINISTRADOR))
              .map((uno) => <option key={uno.codigo} value={uno.codigo}>{uno.nombre}</option>)}
          </select>
          {pista('codigoRol')}
        </div>
      </div>
      <div className="tools" style={{ marginTop: 10 }}>
        <button type="button" className="btn pri" disabled={!listo || guardando} onClick={() => { void guardar(); }}>
          {guardando ? 'Creando…' : 'Crear usuario'}
        </button>
        <button type="button" className="btn" onClick={alCancelar}>Cancelar</button>
      </div>
    </Tarjeta>
  );
}

type Accion = 'datos' | 'contrasena' | 'desbloquear' | 'desactivar' | 'activar' | null;

function FichaDeUsuario(
  { idUsuario, roles, esUnoMismo, alTerminar, alCerrar }: PropsRoles & {
    idUsuario: string; esUnoMismo: boolean; alTerminar: (m: string) => void; alCerrar: () => void;
  },
): JSX.Element {
  const { api, usuario: yo } = useSesion();
  const soyAdministrador = yo?.rol === CODIGO_ROL.ADMINISTRADOR;
  const ficha = useRecurso<ResumenUsuario>(() => api.pedir<ResumenUsuario>(`/usuarios/${idUsuario}`), [idUsuario]);
  const [accion, setAccion] = useState<Accion>(null);
  const [datos, setDatos] = useState({ nombres: '', correo: '', codigoRol: '' });
  const [contrasena, setContrasena] = useState({ nueva: '', repetir: '' });
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ficha.datos === null) return;
    setDatos({ nombres: ficha.datos.nombres, correo: ficha.datos.correo ?? '', codigoRol: ficha.datos.rol });
  }, [ficha.datos]);

  if (ficha.cargando) return <Cargando que="el usuario" />;
  if (ficha.error !== null || ficha.datos === null) return <Fallo error={ficha.error} alReintentar={ficha.recargar} />;
  const usuario = ficha.datos;
  // Una cuenta de administracion solo la toca otro administrador.
  const protegida = usuario.rol === CODIGO_ROL.ADMINISTRADOR && !soyAdministrador;

  async function ejecutar(llamada: () => Promise<unknown>, mensaje: string): Promise<void> {
    setGuardando(true); setError(null);
    try {
      await llamada();
      setAccion(null); setMotivo(''); setContrasena({ nueva: '', repetir: '' });
      ficha.recargar();
      alTerminar(mensaje);
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo completar la operacion.'));
    } finally {
      setGuardando(false);
    }
  }

  const cambios: Record<string, unknown> = {};
  if (datos.nombres.trim() !== usuario.nombres) cambios['nombres'] = datos.nombres.trim();
  if ((datos.correo.trim() || null) !== usuario.correo) cambios['correo'] = datos.correo.trim() === '' ? null : datos.correo.trim();
  if (datos.codigoRol !== usuario.rol) cambios['codigoRol'] = datos.codigoRol;

  const conMotivo = (ruta: string, mensaje: string): JSX.Element => (
    <>
      <label>Motivo * (minimo 10 caracteres, queda en la bitacora)</label>
      <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <div className="tools" style={{ marginTop: 8 }}>
        <button
          type="button" className="btn pri" disabled={guardando || motivo.trim().length < 10}
          onClick={() => { void ejecutar(() => api.pedir(ruta, { metodo: 'POST', cuerpo: { motivo: motivo.trim() } }), mensaje); }}
        >
          {guardando ? 'Guardando…' : 'Confirmar'}
        </button>
        <button type="button" className="btn" onClick={() => setAccion(null)}>Cancelar</button>
      </div>
    </>
  );

  return (
    <Tarjeta titulo={`${usuario.nombres} · ${usuario.nombreUsuario}`} extra={<a style={{ cursor: 'pointer' }} onClick={alCerrar}>cerrar</a>}>
      <p className="tenue" style={{ fontSize: 13 }}>
        Rol: <b>{nombreDeRol(usuario.rol)}</b> · Estado: <EstadoDeCuenta usuario={usuario} />
        {usuario.intentosFallidos > 0 ? ` · ${usuario.intentosFallidos} intentos fallidos` : ''}
        {' · '}correo: {usuario.correo ?? '—'}
      </p>
      {protegida ? (
        <Aviso tono="info">Es una cuenta de administracion: solo otro administrador puede modificarla.</Aviso>
      ) : null}
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}

      {protegida ? null : (
        <div className="tools" style={{ marginBottom: 8 }}>
          <button type="button" className="btn" onClick={() => setAccion('datos')}>Editar datos y rol</button>
          <button type="button" className="btn" onClick={() => setAccion('contrasena')}>Restablecer contrasena</button>
          {usuario.bloqueado ? (
            <button type="button" className="btn" onClick={() => setAccion('desbloquear')}>Desbloquear</button>
          ) : null}
          {usuario.activo && !esUnoMismo ? (
            <button type="button" className="btn peligro" onClick={() => setAccion('desactivar')}>Desactivar</button>
          ) : null}
          {usuario.activo ? null : (
            <button type="button" className="btn" onClick={() => setAccion('activar')}>Reactivar</button>
          )}
        </div>
      )}

      {accion === 'datos' ? (
        <>
          <div className="g g3">
            <div><label>Nombre completo</label><input value={datos.nombres} onChange={(e) => setDatos({ ...datos, nombres: e.target.value })} /></div>
            <div><label>Correo</label><input value={datos.correo} onChange={(e) => setDatos({ ...datos, correo: e.target.value })} /></div>
            <div>
              <label>Rol</label>
              <select
                value={datos.codigoRol} disabled={esUnoMismo}
                onChange={(e) => setDatos({ ...datos, codigoRol: e.target.value })}
              >
                {roles
                  .filter((uno) => uno.codigo === usuario.rol
                    || (uno.activo && (soyAdministrador || uno.codigo !== CODIGO_ROL.ADMINISTRADOR)))
                  .map((uno) => <option key={uno.codigo} value={uno.codigo}>{uno.nombre}</option>)}
              </select>
              {esUnoMismo ? <small className="tenue">No puede cambiar su propio rol.</small> : null}
            </div>
          </div>
          {cambios['codigoRol'] === undefined ? null : (
            <Aviso tono="warn">
              El cambio de rol se aplica en la siguiente accion de la persona, sin que tenga que volver a entrar.
            </Aviso>
          )}
          <div className="tools" style={{ marginTop: 8 }}>
            <button
              type="button" className="btn pri" disabled={guardando || Object.keys(cambios).length === 0}
              onClick={() => {
                if (cambios['codigoRol'] !== undefined && !window.confirm(
                  `¿Cambiar el rol de ${usuario.nombres} de «${nombreDeRol(usuario.rol)}» a «${nombreDeRol(String(cambios['codigoRol']))}»?`,
                )) return;
                void ejecutar(() => api.pedir(`/usuarios/${usuario.id}`, { metodo: 'PATCH', cuerpo: cambios }), 'Usuario actualizado.');
              }}
            >
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button type="button" className="btn" onClick={() => setAccion(null)}>Cancelar</button>
          </div>
        </>
      ) : null}

      {accion === 'contrasena' ? (
        <>
          <div className="g g3">
            <div><label>Contrasena nueva (minimo 10)</label><input type="password" autoComplete="new-password" value={contrasena.nueva} onChange={(e) => setContrasena({ ...contrasena, nueva: e.target.value })} /></div>
            <div><label>Repetir</label><input type="password" autoComplete="new-password" value={contrasena.repetir} onChange={(e) => setContrasena({ ...contrasena, repetir: e.target.value })} /></div>
          </div>
          <div className="tools" style={{ marginTop: 8 }}>
            <button
              type="button" className="btn pri"
              disabled={guardando || contrasena.nueva.length < 10 || contrasena.nueva !== contrasena.repetir}
              onClick={() => {
                void ejecutar(() => api.pedir(`/usuarios/${usuario.id}/contrasena`, {
                  metodo: 'PUT', cuerpo: { contrasena: contrasena.nueva },
                }), 'Contrasena restablecida. Comuniquesela a la persona por un medio seguro.');
              }}
            >
              {guardando ? 'Guardando…' : 'Restablecer'}
            </button>
            <button type="button" className="btn" onClick={() => setAccion(null)}>Cancelar</button>
          </div>
        </>
      ) : null}

      {accion === 'desbloquear' ? conMotivo(`/usuarios/${usuario.id}/desbloquear`, 'Cuenta desbloqueada.') : null}
      {accion === 'desactivar' ? (
        <>
          <Aviso tono="warn">
            La persona no podra iniciar sesion y sus sesiones abiertas dejan de valer en su siguiente
            accion. No se borra nada: su historial queda y la cuenta se puede reactivar.
          </Aviso>
          {conMotivo(`/usuarios/${usuario.id}/desactivar`, 'Usuario desactivado.')}
        </>
      ) : null}
      {accion === 'activar' ? conMotivo(`/usuarios/${usuario.id}/activar`, 'Usuario reactivado.') : null}
    </Tarjeta>
  );
}

// ── roles y permisos ───────────────────────────────────────────────────

export function RolesYPermisos(): JSX.Element {
  const { api, usuario: yo } = useSesion();
  const soyAdministrador = yo?.rol === CODIGO_ROL.ADMINISTRADOR;
  const roles = useRecurso<PaginaDeDatos<ResumenRol>>(() => api.pedirPagina<ResumenRol>('/roles', { tamano: 50 }), []);
  const catalogo = useRecurso<PaginaDeDatos<ResumenPermiso>>(() => api.pedirPagina<ResumenPermiso>('/permisos', { tamano: 100 }), []);
  const [idRol, setIdRol] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const rolElegido = roles.datos?.datos.find((rol) => rol.id === idRol) ?? null;

  if (roles.cargando || catalogo.cargando) return <Cargando que="los roles" />;
  if (roles.error !== null) return <Fallo error={roles.error} alReintentar={roles.recargar} />;
  if (catalogo.error !== null) return <Fallo error={catalogo.error} alReintentar={catalogo.recargar} />;

  return (
    <>
      {aviso === null ? null : <Aviso tono="ok">{aviso}</Aviso>}
      <p className="tenue" style={{ fontSize: 13 }}>
        Los permisos se comprueban en el servidor en cada peticion: un cambio aqui se aplica a todas las
        personas de ese rol en su siguiente accion.
        {soyAdministrador ? null : ' Usted puede retirar permisos y conceder los que usted mismo tiene; '
          + 'el rol de administrador y su propio rol solo los cambia la administracion del sistema.'}
      </p>
      <table>
        <thead><tr><th>Rol</th><th>Descripcion</th><th>Permisos</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {(roles.datos?.datos ?? []).map((rol) => (
            <tr key={rol.id}>
              <td><b>{rol.nombre}</b><br /><small className="tenue">{rol.codigo}</small></td>
              <td className="tenue">{rol.descripcion ?? '—'}</td>
              <td>{rol.cantidadPermisos}</td>
              <td>{rol.activo ? <span className="tag t-t">activo</span> : <span className="tag t-g">inactivo</span>}</td>
              <td>
                <button type="button" className="btn chico" onClick={() => { setIdRol(rol.id); setAviso(null); }}>
                  Ver permisos
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rolElegido === null ? null : (
        <EditorDePermisos
          key={rolElegido.id}
          rol={rolElegido}
          catalogo={catalogo.datos?.datos ?? []}
          alGuardar={(mensaje) => { setAviso(mensaje); roles.recargar(); }}
          alCerrar={() => setIdRol(null)}
        />
      )}
    </>
  );
}

function EditorDePermisos(
  { rol, catalogo, alGuardar, alCerrar }: {
    rol: ResumenRol; catalogo: readonly ResumenPermiso[];
    alGuardar: (mensaje: string) => void; alCerrar: () => void;
  },
): JSX.Element {
  const { api, usuario: yo } = useSesion();
  const soyAdministrador = yo?.rol === CODIGO_ROL.ADMINISTRADOR;
  const actuales = useRecurso<readonly ResumenPermiso[]>(() => api.pedir<readonly ResumenPermiso[]>(`/roles/${rol.id}/permisos`), [rol.id]);
  const [marcados, setMarcados] = useState<Set<string> | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (actuales.datos !== null) setMarcados(new Set(actuales.datos.map((p) => p.codigo)));
  }, [actuales.datos]);

  const soloLectura = !soyAdministrador && (rol.codigo === CODIGO_ROL.ADMINISTRADOR || rol.codigo === yo?.rol);
  const propios = new Set<string>(yo?.permisos ?? []);
  const porModulo = useMemo(() => {
    const grupos = new Map<string, ResumenPermiso[]>();
    for (const permiso of catalogo) grupos.set(permiso.modulo, [...(grupos.get(permiso.modulo) ?? []), permiso]);
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalogo]);

  if (actuales.cargando || marcados === null) return <Cargando que="los permisos del rol" />;
  if (actuales.error !== null) return <Fallo error={actuales.error} alReintentar={actuales.recargar} />;

  const antes = new Set((actuales.datos ?? []).map((p) => p.codigo));
  const altas = [...marcados].filter((c) => !antes.has(c));
  const bajas = [...antes].filter((c) => !marcados.has(c));

  async function guardar(): Promise<void> {
    if (marcados === null) return;
    if (!window.confirm(`¿Aplicar ${altas.length} alta(s) y ${bajas.length} baja(s) de permisos al rol «${rol.nombre}»?`)) return;
    setGuardando(true); setError(null);
    try {
      await api.pedir(`/roles/${rol.id}/permisos`, {
        metodo: 'PUT', cuerpo: { codigosPermiso: [...marcados], motivo: motivo.trim() },
      });
      setMotivo('');
      actuales.recargar();
      alGuardar(`Permisos del rol «${rol.nombre}» actualizados.`);
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudieron guardar los permisos.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Tarjeta titulo={`Permisos · ${rol.nombre}`} extra={<a style={{ cursor: 'pointer' }} onClick={alCerrar}>cerrar</a>}>
      {soloLectura ? (
        <Aviso tono="info">Solo la administracion del sistema puede cambiar los permisos de este rol.</Aviso>
      ) : null}
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
      {porModulo.map(([modulo, permisos]) => (
        <div key={modulo} style={{ marginBottom: 10 }}>
          <h4 style={{ margin: '6px 0', textTransform: 'capitalize' }}>{modulo}</h4>
          {permisos.map((permiso) => {
            const tiene = marcados.has(permiso.codigo);
            // Conceder lo que uno no tiene es escalar; el servidor lo rechaza.
            const bloqueado = soloLectura || (!soyAdministrador && !tiene && !propios.has(permiso.codigo));
            return (
              <label key={permiso.codigo} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontWeight: 400 }}>
                <input
                  type="checkbox" checked={tiene} disabled={bloqueado}
                  onChange={() => {
                    const siguiente = new Set(marcados);
                    if (tiene) siguiente.delete(permiso.codigo); else siguiente.add(permiso.codigo);
                    setMarcados(siguiente);
                  }}
                />
                <span>{permiso.descripcion} <small className="tenue">{permiso.codigo}</small></span>
              </label>
            );
          })}
        </div>
      ))}
      {soloLectura ? null : (
        <>
          <label>Motivo del cambio * (minimo 10 caracteres)</label>
          <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="tools" style={{ marginTop: 8 }}>
            <button
              type="button" className="btn pri"
              disabled={guardando || motivo.trim().length < 10 || (altas.length === 0 && bajas.length === 0)}
              onClick={() => { void guardar(); }}
            >
              {guardando ? 'Guardando…' : `Guardar (${altas.length} altas, ${bajas.length} bajas)`}
            </button>
            <button type="button" className="btn" onClick={() => setMarcados(new Set(antes))}>Deshacer cambios</button>
          </div>
        </>
      )}
    </Tarjeta>
  );
}
