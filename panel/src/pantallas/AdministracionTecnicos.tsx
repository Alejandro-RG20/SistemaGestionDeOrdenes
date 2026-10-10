/**
 * Administracion · tecnicos.
 *
 * Un tecnico es el perfil laboral de una cuenta de usuario (tabla
 * `tecnico`, uno a uno con `usuario`). Aqui se da de alta, se edita, se da
 * de baja y se reactiva ese perfil. La cuenta —acceso, contrasena,
 * bloqueo— se gestiona en la pestaña Usuarios: son dos estados distintos.
 *
 * La baja no deja trabajo colgado: si tiene ordenes abiertas o visitas
 * programadas, el servidor exige elegir quien las recibe y las reasigna
 * con el motivo en el historial de cada orden.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  CatalogosDeApoyo, FichaTecnico, ResumenTecnico, ResumenUsuario,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';

const mensajeDe = (fallo: unknown, porDefecto: string): string =>
  (fallo instanceof ErrorDeApi ? fallo.message : porDefecto);

/** Especialidades: las categorias de articulo activas del catalogo. */
function useEspecialidades(): readonly string[] {
  const { api } = useSesion();
  const catalogos = useRecurso<CatalogosDeApoyo | null>(() => api.pedir<CatalogosDeApoyo>('/catalogos').catch(() => null), []);
  return (catalogos.datos?.categorias ?? []).map((categoria) => categoria.nombre);
}

export function GestionDeTecnicos(): JSX.Element {
  const { api, usuario } = useSesion();
  const puedeAdministrar = tienePermiso(usuario, 'seguridad.usuario.gestionar');
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('activos');
  const [pagina, setPagina] = useState(1);
  const [creando, setCreando] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const temporizador = setTimeout(() => setConsulta(texto.trim()), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);
  useEffect(() => { setPagina(1); }, [consulta, tipo, estado]);

  const lista = useRecurso<PaginaDeDatos<ResumenTecnico>>(
    () => api.pedirPagina<ResumenTecnico>('/tecnicos', {
      texto: consulta === '' ? undefined : consulta, tipo: tipo === '' ? undefined : tipo, estado, pagina, tamano: 25,
    }),
    [consulta, tipo, estado, pagina],
  );

  const alTerminar = (mensaje: string): void => { setAviso(mensaje); setCreando(false); lista.recargar(); };

  return (
    <>
      {aviso === null ? null : <Aviso tono="ok">{aviso}</Aviso>}
      <div className="filtros">
        <div style={{ minWidth: 240 }}>
          <label htmlFor="buscar-tecnico">Buscar</label>
          <input id="buscar-tecnico" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre o usuario" />
        </div>
        <div>
          <label htmlFor="tipo-tecnico">Modalidad</label>
          <select id="tipo-tecnico" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Ruta y planta</option>
            <option value="ruta">Ruta (domicilio)</option>
            <option value="planta">Planta (taller)</option>
          </select>
        </div>
        <div>
          <label htmlFor="estado-tecnico">Estado laboral</label>
          <select id="estado-tecnico" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="activos">Activos</option>
            <option value="inactivos">Dados de baja</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      </div>

      {puedeAdministrar ? (
        <div className="tools" style={{ marginBottom: 12 }}>
          <button type="button" className="btn pri" onClick={() => { setCreando(!creando); setElegido(null); }}>
            {creando ? 'Cancelar alta' : 'Registrar tecnico'}
          </button>
        </div>
      ) : null}
      {creando ? <AltaDeTecnico alTerminar={alTerminar} alCancelar={() => setCreando(false)} /> : null}
      {elegido === null ? null : (
        <FichaDeTecnico
          key={elegido} idTecnico={elegido} puedeAdministrar={puedeAdministrar}
          alTerminar={alTerminar} alCerrar={() => setElegido(null)}
        />
      )}

      {lista.cargando ? <Cargando que="los tecnicos" /> : null}
      {lista.error !== null ? <Fallo error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.datos !== null && lista.error === null ? (
        lista.datos.datos.length === 0 ? <Vacio>Ningun tecnico coincide con el filtro.</Vacio> : (
          <table>
            <thead>
              <tr><th>Tecnico</th><th>Modalidad</th><th>Especialidad</th><th>Ordenes abiertas</th><th>Laboral</th><th>Cuenta</th><th></th></tr>
            </thead>
            <tbody>
              {lista.datos.datos.map((tecnico) => (
                <tr key={tecnico.id}>
                  <td>{tecnico.nombres}<br /><small className="tenue">{tecnico.nombreUsuario}</small></td>
                  <td>{tecnico.tipo === 'ruta' ? 'Ruta' : 'Planta'}</td>
                  <td className="tenue">{tecnico.especialidad.replace(/_/g, ' ')}</td>
                  <td>
                    {tecnico.ordenesAbiertas === 0 ? '0' : (
                      <Link to={`/ordenes?idTecnico=${tecnico.id}&soloActivas=true`}>{tecnico.ordenesAbiertas}</Link>
                    )}
                  </td>
                  <td>
                    {!tecnico.activo ? <span className="tag t-g">de baja</span>
                      : tecnico.disponible ? <span className="tag t-t">disponible</span>
                      : <span className="tag t-a">no disponible</span>}
                  </td>
                  <td>
                    {!tecnico.cuentaActiva ? <span className="tag t-g">desactivada</span>
                      : tecnico.cuentaBloqueada ? <span className="tag t-r">bloqueada</span>
                      : <span className="tag t-t">activa</span>}
                  </td>
                  <td>
                    <button type="button" className="btn chico" onClick={() => { setElegido(tecnico.id); setCreando(false); }}>
                      {puedeAdministrar ? 'Gestionar' : 'Ver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
      {lista.datos !== null && lista.datos.paginacion.totalPaginas > 1 ? (
        <div className="paginacion">
          <button type="button" className="btn chico" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          <span>Pagina {lista.datos.paginacion.pagina} de {lista.datos.paginacion.totalPaginas}</span>
          <button type="button" className="btn chico" disabled={pagina >= lista.datos.paginacion.totalPaginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </div>
      ) : null}
    </>
  );
}

function AltaDeTecnico({ alTerminar, alCancelar }: { alTerminar: (m: string) => void; alCancelar: () => void }): JSX.Element {
  const { api } = useSesion();
  const especialidades = useEspecialidades();
  const [origen, setOrigen] = useState<'nueva' | 'existente'>('nueva');
  const [datos, setDatos] = useState({
    tipo: 'ruta', especialidad: '', idUsuario: '',
    nombreUsuario: '', nombres: '', contrasena: '', correo: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cuentas con rol de tecnico de la modalidad elegida, para enlazar una existente.
  const cuentas = useRecurso<PaginaDeDatos<ResumenUsuario> | null>(
    () => (origen === 'existente'
      ? api.pedirPagina<ResumenUsuario>('/usuarios', { rol: datos.tipo === 'ruta' ? 'tecnico_ruta' : 'tecnico_planta', tamano: 100 })
      : Promise.resolve(null)),
    [origen, datos.tipo],
  );

  const poner = (clave: keyof typeof datos) => (e: { target: { value: string } }) => setDatos({ ...datos, [clave]: e.target.value });
  const listo = datos.especialidad !== '' && (origen === 'existente'
    ? datos.idUsuario !== ''
    : datos.nombreUsuario.trim().length >= 3 && datos.nombres.trim().length >= 3 && datos.contrasena.length >= 10);

  async function guardar(): Promise<void> {
    setGuardando(true); setError(null);
    try {
      const creado = await api.pedir<FichaTecnico>('/tecnicos', {
        metodo: 'POST',
        cuerpo: {
          tipo: datos.tipo, especialidad: datos.especialidad,
          ...(origen === 'existente' ? { idUsuario: datos.idUsuario } : {
            cuentaNueva: {
              nombreUsuario: datos.nombreUsuario.trim().toLowerCase(), nombres: datos.nombres.trim(),
              contrasena: datos.contrasena, correo: datos.correo.trim() === '' ? null : datos.correo.trim(),
            },
          }),
        },
      });
      alTerminar(`Tecnico ${creado.nombres} registrado (${creado.tipo}). ${creado.bodega === null ? '' : `Su bodega: ${creado.bodega}.`}`);
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo registrar el tecnico.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Tarjeta titulo="Registrar tecnico">
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
      <div className="g g3">
        <div>
          <label>Modalidad *</label>
          <select value={datos.tipo} onChange={poner('tipo')}>
            <option value="ruta">Ruta (atiende a domicilio)</option>
            <option value="planta">Planta (taller)</option>
          </select>
        </div>
        <div>
          <label>Especialidad *</label>
          <select value={datos.especialidad} onChange={poner('especialidad')}>
            <option value="">Elija…</option>
            {especialidades.map((nombre) => <option key={nombre} value={nombre}>{nombre.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label>Cuenta de acceso</label>
          <select value={origen} onChange={(e) => setOrigen(e.target.value as 'nueva' | 'existente')}>
            <option value="nueva">Crear una cuenta nueva</option>
            <option value="existente">Usar una cuenta existente con rol de tecnico</option>
          </select>
        </div>
      </div>
      {origen === 'existente' ? (
        <div className="g g3" style={{ marginTop: 8 }}>
          <div>
            <label>Cuenta *</label>
            <select value={datos.idUsuario} onChange={poner('idUsuario')}>
              <option value="">Elija…</option>
              {(cuentas.datos?.datos ?? []).map((cuenta) => (
                <option key={cuenta.id} value={cuenta.id}>{cuenta.nombres} · {cuenta.nombreUsuario}</option>
              ))}
            </select>
            <small className="tenue">Solo cuentas con rol de tecnico de esta modalidad. Si ya tienen ficha, el servidor lo indica.</small>
          </div>
        </div>
      ) : (
        <div className="g g4" style={{ marginTop: 8 }}>
          <div><label>Usuario *</label><input value={datos.nombreUsuario} onChange={poner('nombreUsuario')} autoComplete="off" placeholder="nombre.apellido" /></div>
          <div><label>Nombre completo *</label><input value={datos.nombres} onChange={poner('nombres')} /></div>
          <div><label>Contrasena inicial * (min. 10)</label><input type="password" value={datos.contrasena} onChange={poner('contrasena')} autoComplete="new-password" /></div>
          <div><label>Correo</label><input value={datos.correo} onChange={poner('correo')} /></div>
        </div>
      )}
      <div className="tools" style={{ marginTop: 10 }}>
        <button type="button" className="btn pri" disabled={!listo || guardando} onClick={() => { void guardar(); }}>
          {guardando ? 'Guardando…' : 'Registrar'}
        </button>
        <button type="button" className="btn" onClick={alCancelar}>Cancelar</button>
      </div>
    </Tarjeta>
  );
}

function FichaDeTecnico(
  { idTecnico, puedeAdministrar, alTerminar, alCerrar }: {
    idTecnico: string; puedeAdministrar: boolean; alTerminar: (m: string) => void; alCerrar: () => void;
  },
): JSX.Element {
  const { api, usuario } = useSesion();
  const especialidades = useEspecialidades();
  const ficha = useRecurso<FichaTecnico>(() => api.pedir<FichaTecnico>(`/tecnicos/${idTecnico}`), [idTecnico]);
  const otros = useRecurso<PaginaDeDatos<ResumenTecnico>>(
    () => api.pedirPagina<ResumenTecnico>('/tecnicos', { estado: 'activos', tamano: 100 }), [],
  );
  const [accion, setAccion] = useState<'editar' | 'baja' | 'alta' | null>(null);
  const [edicion, setEdicion] = useState({ especialidad: '', disponible: true, tipo: 'ruta', nombres: '', motivo: '' });
  const [baja, setBaja] = useState({ motivo: '', idTecnicoReemplazo: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ficha.datos === null) return;
    setEdicion({
      especialidad: ficha.datos.especialidad, disponible: ficha.datos.disponible,
      tipo: ficha.datos.tipo, nombres: ficha.datos.nombres, motivo: '',
    });
  }, [ficha.datos]);

  if (ficha.cargando) return <Cargando que="el tecnico" />;
  if (ficha.error !== null || ficha.datos === null) return <Fallo error={ficha.error} alReintentar={ficha.recargar} />;
  const tecnico = ficha.datos;
  const pendiente = tecnico.ordenes.length > 0 || tecnico.visitasProgramadas > 0;
  const puedeReasignar = tienePermiso(usuario, 'ordenes.asignar');

  async function enviar(ruta: string, metodo: 'POST' | 'PATCH', cuerpo: unknown, mensaje: string): Promise<void> {
    setGuardando(true); setError(null);
    try {
      await api.pedir(ruta, { metodo, cuerpo });
      setAccion(null);
      ficha.recargar();
      alTerminar(mensaje);
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo completar la operacion.'));
    } finally {
      setGuardando(false);
    }
  }

  const cambios: Record<string, unknown> = {};
  if (edicion.especialidad !== tecnico.especialidad) cambios['especialidad'] = edicion.especialidad;
  if (edicion.disponible !== tecnico.disponible) cambios['disponible'] = edicion.disponible;
  if (edicion.tipo !== tecnico.tipo) cambios['tipo'] = edicion.tipo;
  if (edicion.nombres.trim() !== tecnico.nombres) cambios['nombres'] = edicion.nombres.trim();
  const cambiaTipo = cambios['tipo'] !== undefined;

  return (
    <Tarjeta titulo={`${tecnico.nombres} · ${tecnico.tipo === 'ruta' ? 'ruta' : 'planta'}`} extra={<a style={{ cursor: 'pointer' }} onClick={alCerrar}>cerrar</a>}>
      <p className="tenue" style={{ fontSize: 13, marginTop: 0 }}>
        Usuario {tecnico.nombreUsuario} · especialidad {tecnico.especialidad.replace(/_/g, ' ')} ·
        laboral: <b>{tecnico.activo ? (tecnico.disponible ? 'activo y disponible' : 'activo, no disponible') : 'dado de baja'}</b> ·
        cuenta: <b>{tecnico.cuentaActiva ? (tecnico.cuentaBloqueada ? 'bloqueada' : 'activa') : 'desactivada'}</b>
        {' '}(la cuenta se gestiona en la pestaña Usuarios)
      </p>
      <p style={{ fontSize: 13 }}>
        {tecnico.ordenes.length} orden(es) abiertas · {tecnico.visitasProgramadas} visita(s) programadas ·{' '}
        {tecnico.bodega === null ? 'sin bodega propia' : `${tecnico.unidadesEnBodega} unidad(es) en ${tecnico.bodega}`}
      </p>
      {tecnico.ordenes.length === 0 ? null : (
        <p style={{ fontSize: 12.5 }}>
          {tecnico.ordenes.slice(0, 20).map((orden) => (
            <Link key={orden.id} to={`/ordenes/${orden.id}`} style={{ marginRight: 8 }}>{orden.codigo}</Link>
          ))}
          {tecnico.ordenes.length > 20 ? '…' : null}
        </p>
      )}
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}

      {puedeAdministrar ? (
        <div className="tools" style={{ marginBottom: 8 }}>
          {tecnico.activo ? (
            <>
              <button type="button" className="btn" onClick={() => setAccion('editar')}>Editar</button>
              <button type="button" className="btn peligro" onClick={() => setAccion('baja')}>Dar de baja</button>
            </>
          ) : <button type="button" className="btn" onClick={() => setAccion('alta')}>Reactivar</button>}
        </div>
      ) : null}

      {accion === 'editar' ? (
        <>
          <div className="g g4">
            <div><label>Nombre</label><input value={edicion.nombres} onChange={(e) => setEdicion({ ...edicion, nombres: e.target.value })} /></div>
            <div>
              <label>Especialidad</label>
              <select value={edicion.especialidad} onChange={(e) => setEdicion({ ...edicion, especialidad: e.target.value })}>
                {[...new Set([tecnico.especialidad, ...especialidades])].map((n) => <option key={n} value={n}>{n.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label>Recibe asignaciones</label>
              <select value={edicion.disponible ? '1' : ''} onChange={(e) => setEdicion({ ...edicion, disponible: e.target.value === '1' })}>
                <option value="1">Si, disponible</option>
                <option value="">No (vacaciones, incapacidad…)</option>
              </select>
            </div>
            <div>
              <label>Modalidad</label>
              <select value={edicion.tipo} onChange={(e) => setEdicion({ ...edicion, tipo: e.target.value })}>
                <option value="ruta">Ruta</option>
                <option value="planta">Planta</option>
              </select>
            </div>
          </div>
          {cambiaTipo ? (
            <>
              <Aviso tono="warn">Cambiar la modalidad cambia tambien el rol de su cuenta. Requiere que no tenga ordenes abiertas.</Aviso>
              <label>Motivo * (minimo 10)</label>
              <input value={edicion.motivo} onChange={(e) => setEdicion({ ...edicion, motivo: e.target.value })} />
            </>
          ) : null}
          <div className="tools" style={{ marginTop: 8 }}>
            <button
              type="button" className="btn pri"
              disabled={guardando || Object.keys(cambios).length === 0 || (cambiaTipo && edicion.motivo.trim().length < 10)}
              onClick={() => {
                void enviar(`/tecnicos/${tecnico.id}`, 'PATCH',
                  { ...cambios, ...(cambiaTipo ? { motivo: edicion.motivo.trim() } : {}) }, 'Tecnico actualizado.');
              }}
            >
              Guardar cambios
            </button>
            <button type="button" className="btn" onClick={() => setAccion(null)}>Cancelar</button>
          </div>
        </>
      ) : null}

      {accion === 'baja' ? (
        <>
          <Aviso tono="warn">
            Dar de baja no borra nada ni desactiva su cuenta: deja de recibir ordenes y su historial se conserva.
            {pendiente ? ' Tiene trabajo pendiente: elija quien lo recibe. Cada orden se reasigna con este motivo en su historial y cada visita se reprograma al reemplazo en la misma fecha y franja.' : ''}
            {tecnico.unidadesEnBodega > 0 ? ' Tiene piezas en su bodega: registre su devolucion antes.' : ''}
          </Aviso>
          <div className="g g2">
            <div><label>Motivo * (minimo 10)</label><input value={baja.motivo} onChange={(e) => setBaja({ ...baja, motivo: e.target.value })} /></div>
            {pendiente ? (
              <div>
                <label>Reasignar su trabajo a *</label>
                <select value={baja.idTecnicoReemplazo} onChange={(e) => setBaja({ ...baja, idTecnicoReemplazo: e.target.value })} disabled={!puedeReasignar}>
                  <option value="">Elija…</option>
                  {(otros.datos?.datos ?? []).filter((otro) => otro.id !== tecnico.id).map((otro) => (
                    <option key={otro.id} value={otro.id}>{otro.nombres} · {otro.tipo} · {otro.ordenesAbiertas} abiertas</option>
                  ))}
                </select>
                {puedeReasignar ? null : <small className="tenue">Reasignar ordenes requiere el permiso de asignar ordenes.</small>}
              </div>
            ) : null}
          </div>
          <div className="tools" style={{ marginTop: 8 }}>
            <button
              type="button" className="btn peligro"
              disabled={guardando || baja.motivo.trim().length < 10 || (pendiente && baja.idTecnicoReemplazo === '')}
              onClick={() => {
                if (!window.confirm(`¿Dar de baja a ${tecnico.nombres}?`)) return;
                void enviar(`/tecnicos/${tecnico.id}/desactivar`, 'POST', {
                  motivo: baja.motivo.trim(),
                  ...(baja.idTecnicoReemplazo === '' ? {} : { idTecnicoReemplazo: baja.idTecnicoReemplazo }),
                }, `${tecnico.nombres} dado de baja.`);
              }}
            >
              Confirmar baja
            </button>
            <button type="button" className="btn" onClick={() => setAccion(null)}>Cancelar</button>
          </div>
        </>
      ) : null}

      {accion === 'alta' ? (
        <>
          <label>Motivo * (minimo 10)</label>
          <input value={baja.motivo} onChange={(e) => setBaja({ ...baja, motivo: e.target.value })} />
          <div className="tools" style={{ marginTop: 8 }}>
            <button
              type="button" className="btn pri" disabled={guardando || baja.motivo.trim().length < 10}
              onClick={() => { void enviar(`/tecnicos/${tecnico.id}/activar`, 'POST', { motivo: baja.motivo.trim() }, `${tecnico.nombres} reactivado.`); }}
            >
              Reactivar
            </button>
            <button type="button" className="btn" onClick={() => setAccion(null)}>Cancelar</button>
          </div>
          {!tecnico.cuentaActiva ? <Aviso tono="info">Su cuenta de acceso sigue desactivada: reactivela en Usuarios para que pueda entrar.</Aviso> : null}
        </>
      ) : null}
    </Tarjeta>
  );
}
