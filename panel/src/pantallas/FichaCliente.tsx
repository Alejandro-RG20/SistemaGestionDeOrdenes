/**
 * W-13 · Ficha del cliente.
 *
 * Lo que el prototipo demuestra aqui es **datos vivos frente a datos
 * congelados**, y por eso la pantalla lo dice con todas las letras en vez
 * de dejarlo a la intuicion:
 *
 *  - El nombre y el telefono son VIVOS: se actualizan en todas partes.
 *  - La direccion, la zona y el cargo por visita quedaron COPIADOS en cada
 *    orden al programarse. Cambiarlos aqui no altera una sola orden ya
 *    abierta, y eso no es un defecto: es lo que impide que un expediente
 *    presentado al proveedor deje de coincidir con lo que se presento.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  CatalogosDeApoyo, FichaCliente as Ficha, ResumenArticulo, ResumenOrden,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import {
  Aviso, Cargando, EtiquetaEstado, Fallo, Garantia, Tarjeta, Vacio, fechaCorta,
} from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';

type Edicion = 'datos' | 'telefono' | 'direccion' | 'estado' | null;

export function FichaCliente(): JSX.Element {
  const { id = '' } = useParams();
  const { api, usuario } = useSesion();
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const puedeEditar = tienePermiso(usuario, 'clientes.editar');
  // Retirar una ficha lo hace quien supervisa los datos de clientes: el
  // mismo permiso que fusionar duplicados (el servidor lo exige igual).
  const puedeRetirar = tienePermiso(usuario, 'clientes.fusionar');
  const puedeAbrirOrden = tienePermiso(usuario, 'ordenes.crear');

  const ficha = useRecurso<Ficha>(() => api.pedir<Ficha>(`/clientes/${id}`), [id]);
  const articulos = useRecurso<PaginaDeDatos<ResumenArticulo>>(
    () => api.pedirPagina<ResumenArticulo>('/articulos', { idCliente: id, tamano: 50 }), [id],
  );
  const ordenes = useRecurso<PaginaDeDatos<ResumenOrden>>(
    () => api.pedirPagina<ResumenOrden>('/ordenes', { idCliente: id, tamano: 25 }), [id],
  );

  if (ficha.cargando) return <Cargando que="la ficha" />;
  if (ficha.error !== null) return <Fallo error={ficha.error} alReintentar={ficha.recargar} />;
  if (ficha.datos === null) return <Fallo error={null} alReintentar={ficha.recargar} />;

  const cliente = ficha.datos;
  const retirado = !cliente.activo || cliente.idClientePrincipal !== null;

  /** Tras guardar: se cierra el formulario y se relee la ficha del servidor. */
  const alGuardar = (mensaje: string): void => {
    setEdicion(null);
    setAviso(mensaje);
    ficha.recargar();
  };

  return (
    <>
      <h2 className="scr">{cliente.nombres} {cliente.apellidos ?? ''}</h2>
      <p className="sub">
        {cliente.cantidadOrdenes} ordenes · {cliente.cantidadArticulos} articulos registrados
        {cliente.activo ? '' : ' · cliente desactivado'}
      </p>

      {cliente.idClientePrincipal === null ? null : (
        <Aviso tono="warn">
          Este registro fue <b>fusionado</b> en otro cliente. Se conserva porque sustenta
          ordenes ya cerradas, pero no debe usarse para abrir ninguna nueva.{' '}
          <Link to={`/clientes/${cliente.idClientePrincipal}`}>Abrir la ficha principal</Link>
        </Aviso>
      )}
      {cliente.activo || cliente.idClientePrincipal !== null ? null : (
        <Aviso tono="warn">
          Este cliente esta <b>desactivado</b>: no aparece en las busquedas y no puede recibir
          ordenes nuevas. Su historial sigue intacto.
        </Aviso>
      )}
      {aviso === null ? null : <Aviso tono="ok">{aviso}</Aviso>}

      {cliente.idClientePrincipal !== null ? null : (
        <div className="tools" style={{ marginBottom: 12 }}>
          {puedeEditar && cliente.activo ? (
            <>
              <button type="button" className="btn" onClick={() => setEdicion('datos')}>Editar datos</button>
              <button type="button" className="btn" onClick={() => setEdicion('telefono')}>Cambiar o agregar telefono</button>
              <button type="button" className="btn" onClick={() => setEdicion('direccion')}>Agregar direccion</button>
            </>
          ) : null}
          {puedeRetirar ? (
            <button type="button" className="btn" onClick={() => setEdicion('estado')}>
              {cliente.activo ? 'Desactivar cliente' : 'Reactivar cliente'}
            </button>
          ) : null}
        </div>
      )}

      {edicion === 'datos' ? (
        <EditarDatos cliente={cliente} alCancelar={() => setEdicion(null)} alGuardar={alGuardar} />
      ) : null}
      {edicion === 'telefono' ? (
        <AgregarTelefono idCliente={cliente.id} alCancelar={() => setEdicion(null)} alGuardar={alGuardar} />
      ) : null}
      {edicion === 'direccion' ? (
        <AgregarDireccion idCliente={cliente.id} alCancelar={() => setEdicion(null)} alGuardar={alGuardar} />
      ) : null}
      {edicion === 'estado' ? (
        <CambiarEstado cliente={cliente} alCancelar={() => setEdicion(null)} alGuardar={alGuardar} />
      ) : null}

      <Tarjeta titulo="Datos personales" extra="datos vivos · se actualizan en todas partes">
        <div className="g g3">
          <div>
            <label>Nombres y apellidos</label>
            <input value={`${cliente.nombres} ${cliente.apellidos ?? ''}`.trim()} readOnly />
          </div>
          <div>
            <label>Identificacion</label>
            <input value={cliente.identificacion ?? '—'} readOnly />
          </div>
          <div>
            <label>Correo</label>
            <input value={cliente.correo ?? '—'} readOnly />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Telefonos">
        <table className="d">
          <thead>
            <tr><th>Numero</th><th>Tipo</th><th>Estado</th><th>Desde</th></tr>
          </thead>
          <tbody>
            {cliente.telefonos.map((telefono) => (
              <tr key={telefono.id}>
                <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{telefono.numero}</td>
                <td>{telefono.tipo ?? '—'}</td>
                <td>
                  {telefono.vigente
                    ? <span className="tag t-t">Vigente</span>
                    : <span className="tag t-g">Anterior</span>}
                </td>
                <td className="tenue">{fechaCorta(telefono.desde)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Aviso tono="info">
          El numero anterior <b>se conserva</b>: la consulta del portal publico acepta tanto el
          telefono vigente como el que estaba registrado al abrirse cada orden (RF-66).
        </Aviso>
      </Tarjeta>

      <Tarjeta titulo="Direcciones">
        <table className="d">
          <thead>
            <tr><th>Direccion</th><th>Zona</th><th>Referencia</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {cliente.direcciones.map((direccion) => (
              <tr key={direccion.id}>
                <td>{direccion.detalle}</td>
                <td className="tenue">{direccion.zona ?? '—'}</td>
                <td className="tenue">{direccion.referencia ?? '—'}</td>
                <td>
                  {direccion.principal
                    ? <span className="tag t-t">Principal</span>
                    : <span className="tag t-g">Anterior</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Aviso tono="warn">
          <b>Cambiar la direccion no altera las ordenes ya programadas.</b> Cada orden copio la
          direccion, la zona y el cargo por visita vigentes al momento de crearse (RF-73,
          RN-22). La direccion nueva se usara en ordenes futuras.
        </Aviso>
      </Tarjeta>

      <Tarjeta titulo="Articulos del cliente">
        {articulos.cargando ? <Cargando que="los articulos" /> : null}
        {articulos.datos === null || articulos.datos.datos.length === 0 ? (
          <Vacio>Este cliente no tiene articulos registrados.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr>
                <th>Articulo</th><th>N.º de serie</th><th>Tienda</th>
                <th>Compra</th><th>Categoria</th>
              </tr>
            </thead>
            <tbody>
              {articulos.datos.datos.map((articulo) => (
                <tr key={articulo.id}>
                  <td>
                    <Link to={`/articulos/${articulo.id}`}>
                      {articulo.marca} {articulo.modelo ?? ''}
                    </Link>
                  </td>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                    {articulo.numeroSerie ?? (articulo.sinSerieLegible ? 'serie ilegible' : '—')}
                  </td>
                  <td>
                    {articulo.tiendaOrigen}
                    {articulo.tiendaPerteneceAlGrupo
                      ? null
                      : <span className="tag t-a" style={{ marginLeft: 6 }}>externa</span>}
                  </td>
                  <td className="tenue">{fechaCorta(articulo.fechaCompra)}</td>
                  <td className="tenue">{articulo.categoria.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>

      <Tarjeta titulo="Ordenes de este cliente">
        {ordenes.cargando ? <Cargando que="las ordenes" /> : null}
        {ordenes.datos === null || ordenes.datos.datos.length === 0 ? (
          <Vacio>Sin ordenes registradas.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr><th>N.º</th><th>Articulo</th><th>Garantia</th><th>Estado</th><th>Recepcion</th></tr>
            </thead>
            <tbody>
              {ordenes.datos.datos.map((orden) => (
                <tr key={orden.id}>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                    <Link to={`/ordenes/${orden.id}`}>{orden.numero}</Link>
                  </td>
                  <td>{orden.articulo}</td>
                  <td><Garantia tipo={orden.tipoGarantia} /></td>
                  <td><EtiquetaEstado estado={orden.estado} /></td>
                  <td className="tenue">{fechaCorta(orden.fechaRecepcion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>

      <div className="tools">
        {puedeAbrirOrden && !retirado ? (
          <Link className="btn pri" to={`/ordenes/nueva?idCliente=${cliente.id}`}>
            Nueva orden para este cliente
          </Link>
        ) : null}
        <Link className="btn" to="/clientes">Volver</Link>
      </div>

      <Aviso>
        <b>Desactivar no es eliminar.</b> Un cliente desactivado deja de aparecer en busquedas y
        no puede usarse en ordenes nuevas, pero sus ordenes, sus articulos y sus coberturas
        permanecen intactos porque son el historial de servicio que se puede consultar (RN-21).
      </Aviso>
    </>
  );
}

interface PropsFormulario {
  readonly alCancelar: () => void;
  readonly alGuardar: (mensaje: string) => void;
}

/** Envia, y si el servidor rechaza, muestra su mensaje y los campos que señala. */
function useEnvio(): {
  enviar: (accion: () => Promise<unknown>, mensaje: string, alGuardar: (m: string) => void) => Promise<void>;
  guardando: boolean; error: string | null; campos: Record<string, string>;
} {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  async function enviar(
    accion: () => Promise<unknown>, mensaje: string, alGuardar: (m: string) => void,
  ): Promise<void> {
    setGuardando(true);
    setError(null);
    setCampos({});
    try {
      await accion();
      alGuardar(mensaje);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo guardar el cambio.');
      setCampos(fallo instanceof ErrorDeApi ? fallo.campos ?? {} : {});
    } finally {
      setGuardando(false);
    }
  }
  return { enviar, guardando, error, campos };
}

function Pista({ campos, clave }: { campos: Record<string, string>; clave: string }): JSX.Element | null {
  return campos[clave] === undefined ? null : <small style={{ color: 'var(--red)' }}>{campos[clave]}</small>;
}

const vacioANulo = (valor: string): string | null => (valor.trim() === '' ? null : valor.trim());

function EditarDatos({ cliente, alCancelar, alGuardar }: PropsFormulario & { cliente: Ficha }): JSX.Element {
  const { api } = useSesion();
  const { enviar, guardando, error, campos } = useEnvio();
  const [datos, setDatos] = useState({
    nombres: cliente.nombres, apellidos: cliente.apellidos ?? '',
    identificacion: cliente.identificacion ?? '', correo: cliente.correo ?? '',
  });
  const poner = (clave: keyof typeof datos) =>
    (evento: { target: { value: string } }) => setDatos({ ...datos, [clave]: evento.target.value });

  return (
    <Tarjeta titulo="Editar datos personales">
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
      <div className="g g4">
        <div><label>Nombres *</label><input value={datos.nombres} onChange={poner('nombres')} /><Pista campos={campos} clave="nombres" /></div>
        <div><label>Apellidos</label><input value={datos.apellidos} onChange={poner('apellidos')} /><Pista campos={campos} clave="apellidos" /></div>
        <div><label>Identificacion</label><input value={datos.identificacion} onChange={poner('identificacion')} /><Pista campos={campos} clave="identificacion" /></div>
        <div><label>Correo</label><input value={datos.correo} onChange={poner('correo')} type="email" /><Pista campos={campos} clave="correo" /></div>
      </div>
      <p className="tenue" style={{ fontSize: 12 }}>
        Cada cambio queda en la bitacora con el valor anterior. Las ordenes ya abiertas conservan
        lo que copiaron al crearse.
      </p>
      <div className="tools">
        <button
          type="button" className="btn pri" disabled={guardando || datos.nombres.trim().length < 2}
          onClick={() => {
            void enviar(() => api.pedir(`/clientes/${cliente.id}`, {
              metodo: 'PATCH',
              cuerpo: {
                nombres: datos.nombres.trim(),
                apellidos: vacioANulo(datos.apellidos),
                identificacion: vacioANulo(datos.identificacion),
                correo: vacioANulo(datos.correo),
              },
            }), 'Datos del cliente actualizados.', alGuardar);
          }}
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" className="btn" onClick={alCancelar}>Cancelar</button>
      </div>
    </Tarjeta>
  );
}

function AgregarTelefono({ idCliente, alCancelar, alGuardar }: PropsFormulario & { idCliente: string }): JSX.Element {
  const { api } = useSesion();
  const { enviar, guardando, error, campos } = useEnvio();
  const [numero, setNumero] = useState('');
  const [tipo, setTipo] = useState('celular');
  const [reemplaza, setReemplaza] = useState(true);

  return (
    <Tarjeta titulo="Telefono">
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
      <div className="g g3">
        <div>
          <label>Numero *</label>
          <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="8888 7777" inputMode="tel" />
          <Pista campos={campos} clave="numero" />
        </div>
        <div>
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="celular">Celular</option>
            <option value="casa">Casa</option>
            <option value="trabajo">Trabajo</option>
          </select>
        </div>
        <div>
          <label>Que hacer con el vigente</label>
          <select value={reemplaza ? '1' : ''} onChange={(e) => setReemplaza(e.target.value === '1')}>
            <option value="1">Reemplazarlo (pasa a historico)</option>
            <option value="">Conservarlo tambien vigente</option>
          </select>
        </div>
      </div>
      <div className="tools" style={{ marginTop: 10 }}>
        <button
          type="button" className="btn pri"
          disabled={guardando || numero.replace(/[\s-]/g, '').length !== 8}
          onClick={() => {
            void enviar(() => api.pedir(`/clientes/${idCliente}/telefonos`, {
              metodo: 'POST', cuerpo: { numero, tipo, reemplazaAlVigente: reemplaza },
            }), 'Telefono registrado. El anterior se conserva en el historial.', alGuardar);
          }}
        >
          {guardando ? 'Guardando…' : 'Guardar telefono'}
        </button>
        <button type="button" className="btn" onClick={alCancelar}>Cancelar</button>
      </div>
    </Tarjeta>
  );
}

function AgregarDireccion({ idCliente, alCancelar, alGuardar }: PropsFormulario & { idCliente: string }): JSX.Element {
  const { api } = useSesion();
  const { enviar, guardando, error, campos } = useEnvio();
  const catalogos = useRecurso<CatalogosDeApoyo | null>(
    () => api.pedir<CatalogosDeApoyo>('/catalogos').catch(() => null), [],
  );
  const [detalle, setDetalle] = useState('');
  const [referencia, setReferencia] = useState('');
  const [idZona, setIdZona] = useState('');
  const [principal, setPrincipal] = useState(true);

  return (
    <Tarjeta titulo="Nueva direccion">
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
      <div className="g g4">
        <div><label>Direccion *</label><input value={detalle} onChange={(e) => setDetalle(e.target.value)} /><Pista campos={campos} clave="detalle" /></div>
        <div><label>Referencia</label><input value={referencia} onChange={(e) => setReferencia(e.target.value)} /></div>
        <div>
          <label>Zona</label>
          <select value={idZona} onChange={(e) => setIdZona(e.target.value)}>
            <option value="">Sin zona</option>
            {(catalogos.datos?.zonas ?? []).map((zona) => (
              <option key={zona.id} value={zona.id}>{zona.nombre}</option>
            ))}
          </select>
          <Pista campos={campos} clave="idZona" />
        </div>
        <div>
          <label>Uso</label>
          <select value={principal ? '1' : ''} onChange={(e) => setPrincipal(e.target.value === '1')}>
            <option value="1">Principal</option>
            <option value="">Adicional</option>
          </select>
        </div>
      </div>
      <div className="tools" style={{ marginTop: 10 }}>
        <button
          type="button" className="btn pri" disabled={guardando || detalle.trim().length < 5}
          onClick={() => {
            void enviar(() => api.pedir(`/clientes/${idCliente}/direcciones`, {
              metodo: 'POST',
              cuerpo: {
                detalle: detalle.trim(), referencia: vacioANulo(referencia),
                idZona: idZona === '' ? null : idZona, esPrincipal: principal,
              },
            }), 'Direccion registrada. Las ordenes ya programadas no cambian.', alGuardar);
          }}
        >
          {guardando ? 'Guardando…' : 'Guardar direccion'}
        </button>
        <button type="button" className="btn" onClick={alCancelar}>Cancelar</button>
      </div>
    </Tarjeta>
  );
}

function CambiarEstado({ cliente, alCancelar, alGuardar }: PropsFormulario & { cliente: Ficha }): JSX.Element {
  const { api } = useSesion();
  const { enviar, guardando, error, campos } = useEnvio();
  const [motivo, setMotivo] = useState('');
  const desactivar = cliente.activo;

  return (
    <Tarjeta titulo={desactivar ? 'Desactivar cliente' : 'Reactivar cliente'}>
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
      <Aviso tono="info">
        {desactivar
          ? 'El cliente dejara de aparecer en las busquedas y no podra recibir ordenes nuevas. '
            + 'No se borra nada: sus ordenes, articulos y su historial quedan intactos y se puede reactivar.'
          : 'El cliente volvera a aparecer en las busquedas y podra recibir ordenes nuevas.'}
      </Aviso>
      <label>Motivo * (minimo 10 caracteres, queda en la bitacora)</label>
      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
      <Pista campos={campos} clave="motivo" />
      <div className="tools" style={{ marginTop: 10 }}>
        <button
          type="button" className="btn pri" disabled={guardando || motivo.trim().length < 10}
          onClick={() => {
            void enviar(() => api.pedir(`/clientes/${cliente.id}/${desactivar ? 'desactivar' : 'activar'}`, {
              metodo: 'POST', cuerpo: { motivo: motivo.trim() },
            }), desactivar ? 'Cliente desactivado.' : 'Cliente reactivado.', alGuardar);
          }}
        >
          {guardando ? 'Guardando…' : desactivar ? 'Confirmar desactivacion' : 'Confirmar reactivacion'}
        </button>
        <button type="button" className="btn" onClick={alCancelar}>Cancelar</button>
      </div>
    </Tarjeta>
  );
}
