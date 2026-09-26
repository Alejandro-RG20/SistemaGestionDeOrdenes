/**
 * W-05 · Tiendas (sucursales).
 *
 * La casilla «pertenece al grupo» NO es decorativa: es lo que el motor de
 * garantias consulta para decidir si la garantia del proveedor aplica. Por
 * eso la pantalla lo dice donde se marca, y no en una ayuda escondida:
 * marcarla mal regala o niega garantias.
 *
 * Y no hay boton de borrar. Una sucursal que cierra se desactiva: las
 * ordenes que entraron por ella tienen que seguir diciendo de donde
 * vinieron.
 */
import { useState } from 'react';
import type { Tienda } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Etiqueta, Fallo, Tarjeta, Vacio } from '../componentes/piezas.js';
import { tienePermiso } from '../sesion/navegacion.js';
import { ErrorDeApi } from '../api/cliente.js';

const VACIA = {
  codigo: '', nombre: '', direccion: '', telefono: '', perteneceAlGrupo: true,
};

export function Tiendas(): JSX.Element {
  const { api, usuario } = useSesion();
  const [ronda, setRonda] = useState(0);
  const [fallo, setFallo] = useState<string | null>(null);
  const [formulario, setFormulario] = useState({ ...VACIA });
  const [editando, setEditando] = useState<string | null>(null);
  const puedeGestionar = tienePermiso(usuario, 'tiendas.gestionar');

  const { datos, cargando, error, recargar } = useRecurso<Tienda[]>(
    () => api.pedir<Tienda[]>('/tiendas'), [ronda],
  );

  function empezarEdicion(tienda: Tienda): void {
    setEditando(tienda.id);
    setFormulario({
      codigo: tienda.codigo ?? '',
      nombre: tienda.nombre,
      direccion: tienda.direccion ?? '',
      telefono: tienda.telefono ?? '',
      perteneceAlGrupo: tienda.perteneceAlGrupo,
    });
  }

  async function guardar(): Promise<void> {
    setFallo(null);
    const cuerpo = {
      codigo: formulario.codigo.trim(),
      nombre: formulario.nombre.trim(),
      ...(formulario.direccion.trim() === '' ? {} : { direccion: formulario.direccion.trim() }),
      ...(formulario.telefono.trim() === '' ? {} : { telefono: formulario.telefono.trim() }),
      perteneceAlGrupo: formulario.perteneceAlGrupo,
    };
    try {
      if (editando === null) {
        await api.pedir('/tiendas', { metodo: 'POST', cuerpo });
      } else {
        await api.pedir(`/tiendas/${editando}`, { metodo: 'PUT', cuerpo });
      }
      setFormulario({ ...VACIA });
      setEditando(null);
      setRonda(ronda + 1);
    } catch (problema) {
      setFallo(problema instanceof ErrorDeApi ? problema.message : 'No se pudo guardar.');
    }
  }

  async function cambiarActiva(id: string, activa: boolean): Promise<void> {
    setFallo(null);
    try {
      await api.pedir(`/tiendas/${id}/${activa ? 'activar' : 'desactivar'}`, { metodo: 'POST' });
      setRonda(ronda + 1);
    } catch (problema) {
      setFallo(problema instanceof ErrorDeApi ? problema.message : 'No se pudo cambiar.');
    }
  }

  return (
    <>
      <h2 className="scr">Tiendas</h2>
      <p className="sub">
        Las sucursales desde las que entra el trabajo. Una tienda desactivada no recibe
        ordenes nuevas, pero las viejas siguen diciendo que vinieron de ahi.
      </p>

      {fallo !== null ? <Aviso tono="warn">{fallo}</Aviso> : null}

      {puedeGestionar ? (
        <Tarjeta titulo={editando === null ? 'Agregar tienda' : 'Editar tienda'}>
          <div className="g g4">
            <div>
              <label htmlFor="codigo">Codigo</label>
              <input
                id="codigo" value={formulario.codigo}
                onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value })}
                placeholder="CUR-004"
              />
            </div>
            <div>
              <label htmlFor="nombre">Nombre</label>
              <input
                id="nombre" value={formulario.nombre}
                onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="direccion">Direccion</label>
              <input
                id="direccion" value={formulario.direccion}
                onChange={(e) => setFormulario({ ...formulario, direccion: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="telefono">Telefono</label>
              <input
                id="telefono" value={formulario.telefono}
                onChange={(e) => setFormulario({ ...formulario, telefono: e.target.value })}
              />
            </div>
          </div>

          <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 10 }}>
            <input
              type="checkbox" checked={formulario.perteneceAlGrupo}
              onChange={(e) => setFormulario({ ...formulario, perteneceAlGrupo: e.target.checked })}
            />
            <span style={{ fontSize: 12.5 }}>
              <b>Pertenece al Grupo Unicomer.</b> Esto decide si la garantia del proveedor
              aplica a lo comprado aqui. Marcarlo mal regala o niega garantias.
            </span>
          </label>

          <div className="tools" style={{ marginTop: 10 }}>
            <button
              type="button" className="btn pri"
              disabled={formulario.codigo.trim().length < 3 || formulario.nombre.trim().length < 3}
              onClick={() => void guardar()}
            >
              {editando === null ? 'Agregar' : 'Guardar cambios'}
            </button>
            {editando !== null ? (
              <button
                type="button" className="btn"
                onClick={() => { setEditando(null); setFormulario({ ...VACIA }); }}
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </Tarjeta>
      ) : null}

      {cargando ? <Cargando que="las tiendas" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}

      {datos !== null && error === null ? (
        datos.length === 0 ? <Vacio>No hay tiendas registradas.</Vacio> : (
          <table>
            <thead>
              <tr>
                <th>Codigo</th><th>Nombre</th><th>Direccion</th><th>Telefono</th>
                <th>Grupo</th><th>Estado</th>{puedeGestionar ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {datos.map((tienda) => (
                <tr key={tienda.id}>
                  <td><code>{tienda.codigo ?? '—'}</code></td>
                  <td>{tienda.nombre}</td>
                  <td className="tenue">{tienda.direccion ?? '—'}</td>
                  <td className="tenue">{tienda.telefono ?? '—'}</td>
                  <td>
                    {tienda.perteneceAlGrupo
                      ? <Etiqueta tono="t-t">del grupo</Etiqueta>
                      : <Etiqueta tono="t-g">externa</Etiqueta>}
                  </td>
                  <td>
                    {tienda.activa
                      ? <Etiqueta tono="t-t">activa</Etiqueta>
                      : <Etiqueta tono="t-g">inactiva</Etiqueta>}
                  </td>
                  {puedeGestionar ? (
                    <td>
                      <div className="acciones-fila">
                        <button
                          type="button" className="btn chico"
                          onClick={() => empezarEdicion(tienda)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={tienda.activa ? 'btn chico peligro' : 'btn chico'}
                          onClick={() => void cambiarActiva(tienda.id, !tienda.activa)}
                        >
                          {tienda.activa ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </>
  );
}
