/**
 * W-21 · Compras al proveedor, y W-22 · Proveedores.
 *
 * LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO: una compra no es mercaderia.
 * Por eso la lista muestra «recibido de pedido» en piezas y no un simple
 * estado: un pedido confirmado con 0 de 40 recibidas y uno con 39 de 40 se
 * ven igual si solo se lee el estado, y no son lo mismo para nadie.
 *
 * Y por eso el boton de recibir solo aparece para quien tiene el permiso
 * de bodega: quien pide no cuenta lo que llega.
 */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ESTADO_COMPRA,
  type CompraDetallada, type EstadoCompra, type Proveedor, type ResumenCompra,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import {
  Aviso, Cargando, cordobas, Etiqueta, Fallo, fechaCorta, Tarjeta, Vacio,
} from '../componentes/piezas.js';
import { tienePermiso } from '../sesion/navegacion.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

function tonoDeEstado(estado: EstadoCompra): string {
  if (estado === ESTADO_COMPRA.RECIBIDA) return 't-t';
  if (estado === ESTADO_COMPRA.CANCELADA) return 't-g';
  if (estado === ESTADO_COMPRA.RECIBIDA_PARCIAL) return 't-a';
  if (estado === ESTADO_COMPRA.BORRADOR) return 't-b';
  return 't-r';
}

export function Compras(): JSX.Element {
  const { api, usuario } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const estado = parametros.get('estado') ?? '';
  const pagina = Number(parametros.get('pagina') ?? '1');
  const puedeGestionar = tienePermiso(usuario, 'compras.gestionar');

  const { datos, cargando, error, recargar } = useRecurso<PaginaDeDatos<ResumenCompra>>(
    () => api.pedirPagina<ResumenCompra>('/compras', {
      estado: estado === '' ? undefined : estado,
      pagina,
    }),
    [estado, pagina],
  );

  function cambiar(valor: string): void {
    const siguientes = new URLSearchParams(parametros);
    if (valor === '') siguientes.delete('estado'); else siguientes.set('estado', valor);
    siguientes.delete('pagina');
    setParametros(siguientes);
  }

  return (
    <>
      <h2 className="scr">Compras al proveedor</h2>
      <p className="sub">
        Un pedido no es mercaderia: la existencia la mueve bodega cuando cuenta lo que llego.
      </p>

      <Tarjeta titulo="Filtros">
        <div className="g g4">
          <div>
            <label htmlFor="estado">Estado</label>
            <select id="estado" value={estado} onChange={(e) => cambiar(e.target.value)}>
              <option value="">Todos</option>
              {Object.values(ESTADO_COMPRA).map((uno) => (
                <option key={uno} value={uno}>{uno.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="tools" style={{ marginTop: 10 }}>
          <Link className="btn" to="/proveedores">Ver proveedores</Link>
          {puedeGestionar ? (
            <Link className="btn pri" to="/compras/nueva">Nuevo pedido</Link>
          ) : null}
        </div>
      </Tarjeta>

      {cargando ? <Cargando que="las compras" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}

      {datos !== null && error === null ? (
        datos.datos.length === 0 ? (
          <Vacio>No hay compras con ese filtro.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>N.º</th><th>Proveedor</th><th>Estado</th>
                <th>Pedido</th><th>Recibido</th><th>Total</th><th>Llega</th><th />
              </tr>
            </thead>
            <tbody>
              {datos.datos.map((compra) => (
                <tr key={compra.id}>
                  <td><code>{compra.numero}</code></td>
                  <td>{compra.proveedor}</td>
                  <td>
                    <Etiqueta tono={tonoDeEstado(compra.estado)}>
                      {compra.estado.replace(/_/g, ' ')}
                    </Etiqueta>
                  </td>
                  <td>{compra.pedido}</td>
                  {/* Lo recibido en piezas, no solo el estado: un pedido con
                      0 de 40 y uno con 39 de 40 no son lo mismo. */}
                  <td style={compra.recibido < compra.pedido
                    ? { color: 'var(--amber)', fontWeight: 600 } : {}}
                  >
                    {compra.recibido}
                  </td>
                  <td>{cordobas(compra.total)}</td>
                  <td className="tenue">{fechaCorta(compra.fechaEstimada)}</td>
                  <td><Link className="btn chico" to={`/compras/${compra.id}`}>Ver</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </>
  );
}

export function DetalleCompra(): JSX.Element {
  const { id = '' } = useParams();
  const { api, usuario } = useSesion();
  const [ronda, setRonda] = useState(0);
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [contado, setContado] = useState<Record<string, number>>({});
  const [idBodega, setIdBodega] = useState('');

  const puedeRecibir = tienePermiso(usuario, 'compras.recibir');
  const puedeGestionar = tienePermiso(usuario, 'compras.gestionar');

  const { datos, cargando, error, recargar } = useRecurso<CompraDetallada>(
    () => api.pedir<CompraDetallada>(`/compras/${id}`), [id, ronda],
  );
  const bodegas = useRecurso<{ id: string; nombre: string; tipo: string }[]>(
    () => api.pedir<{ id: string; nombre: string; tipo: string }[]>('/bodegas'), [],
  );

  if (cargando) return <Cargando que="la compra" />;
  if (error !== null) return <Fallo error={error} alReintentar={recargar} />;
  if (datos === null) return <Vacio>No se encontro la compra.</Vacio>;

  async function mover(hacia: EstadoCompra): Promise<void> {
    setTrabajando(true);
    setFallo(null);
    try {
      await api.pedir(`/compras/${id}/estado`, {
        metodo: 'POST',
        cuerpo: {
          hacia,
          ...(hacia === ESTADO_COMPRA.CANCELADA ? { motivoCancelacion: motivo.trim() } : {}),
        },
      });
      setRonda(ronda + 1);
    } catch (problema) {
      setFallo(problema instanceof ErrorDeApi ? problema.message : 'No se pudo mover la compra.');
    } finally {
      setTrabajando(false);
    }
  }

  async function recibir(): Promise<void> {
    setTrabajando(true);
    setFallo(null);
    try {
      await api.pedir(`/compras/${id}/recepcion`, {
        metodo: 'POST',
        cuerpo: {
          idBodega,
          lineas: Object.entries(contado)
            .filter(([, cantidad]) => cantidad > 0)
            .map(([idLinea, cantidad]) => ({ idLinea, cantidad })),
        },
      });
      setContado({});
      setRonda(ronda + 1);
    } catch (problema) {
      setFallo(problema instanceof ErrorDeApi ? problema.message : 'No se pudo recibir.');
    } finally {
      setTrabajando(false);
    }
  }

  const centrales = (bodegas.datos ?? []).filter((b) => b.tipo === 'central');
  const algoContado = Object.values(contado).some((cantidad) => cantidad > 0);
  const cancelando = motivo.trim().length > 0;

  return (
    <>
      <h2 className="scr">Compra {datos.numero}</h2>
      <p className="sub">
        {datos.proveedor} · pedida el {fechaCorta(datos.fechaPedido)}
        {' '}<Etiqueta tono={tonoDeEstado(datos.estado)}>
          {datos.estado.replace(/_/g, ' ')}
        </Etiqueta>
      </p>

      {datos.motivoCancelacion !== null ? (
        <Aviso tono="warn"><b>Cancelada.</b> {datos.motivoCancelacion}</Aviso>
      ) : null}
      {fallo !== null ? <Aviso tono="warn">{fallo}</Aviso> : null}

      <Tarjeta titulo="Lo pedido">
        <table>
          <thead>
            <tr>
              <th>Codigo</th><th>Repuesto</th><th>Pedido</th><th>Recibido</th>
              <th>Precio</th>{datos.admiteRecepcion && puedeRecibir ? <th>Llego ahora</th> : null}
            </tr>
          </thead>
          <tbody>
            {datos.detalle.map((linea) => {
              const pendiente = linea.cantidad - linea.cantidadRecibida;
              return (
                <tr key={linea.id}>
                  <td><code>{linea.codigoRepuesto}</code></td>
                  <td>{linea.descripcion}</td>
                  <td>{linea.cantidad}</td>
                  <td>{linea.cantidadRecibida}</td>
                  <td>{cordobas(linea.precioUnitario)}</td>
                  {datos.admiteRecepcion && puedeRecibir ? (
                    <td>
                      {pendiente === 0 ? (
                        <span className="tenue">completa</span>
                      ) : (
                        <input
                          type="number" min={0} max={pendiente} style={{ width: 90 }}
                          value={contado[linea.id] ?? ''}
                          placeholder={`hasta ${pendiente}`}
                          onChange={(evento) => setContado({
                            ...contado,
                            [linea.id]: Math.max(0, Math.min(pendiente, Number(evento.target.value))),
                          })}
                        />
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="meas" style={{ marginTop: 10 }}>
          <span>Total</span><b>{cordobas(datos.total)}</b>
        </div>
      </Tarjeta>

      {datos.admiteRecepcion && puedeRecibir ? (
        <Tarjeta titulo="Registrar lo que llego">
          <p className="tenue" style={{ fontSize: 12.5, marginTop: 0 }}>
            Cuente las piezas y anote lo que hay. El estado de la compra lo decide el
            sistema comparando lo contado con lo pedido: no se marca «recibida» a mano.
          </p>
          <div className="g g2">
            <div>
              <label htmlFor="bodega">A que bodega entra</label>
              <select
                id="bodega" value={idBodega}
                onChange={(evento) => setIdBodega(evento.target.value)}
              >
                <option value="">Elija la bodega</option>
                {centrales.map((bodega) => (
                  <option key={bodega.id} value={bodega.id}>{bodega.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button" className="btn pri" style={{ marginTop: 10 }}
            disabled={trabajando || idBodega === '' || !algoContado}
            onClick={() => void recibir()}
          >
            {trabajando ? 'Registrando…' : 'Registrar la recepcion'}
          </button>
        </Tarjeta>
      ) : null}

      {puedeGestionar && datos.transicionesPosibles.length > 0 ? (
        <Tarjeta titulo="Mover la compra">
          {datos.transicionesPosibles.includes(ESTADO_COMPRA.CANCELADA) ? (
            <div style={{ marginBottom: 9 }}>
              <label htmlFor="motivo">Si la cancela, explique por que</label>
              <input
                id="motivo" value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                placeholder="El proveedor descontinuo la pieza…"
              />
            </div>
          ) : null}
          <div className="tools">
            {datos.transicionesPosibles.map((hacia) => (
              <button
                key={hacia} type="button"
                className={hacia === ESTADO_COMPRA.CANCELADA ? 'btn peligro' : 'btn pri'}
                disabled={trabajando || (hacia === ESTADO_COMPRA.CANCELADA && !cancelando)}
                onClick={() => void mover(hacia)}
              >
                {hacia === ESTADO_COMPRA.CANCELADA
                  ? 'Cancelar la compra'
                  : `Marcar como ${hacia.replace(/_/g, ' ')}`}
              </button>
            ))}
          </div>
        </Tarjeta>
      ) : null}

      <Link className="btn" to="/compras" style={{ marginTop: 12 }}>Volver a las compras</Link>
    </>
  );
}

export function NuevaCompra(): JSX.Element {
  const { api } = useSesion();
  const [idProveedor, setIdProveedor] = useState('');
  const [fechaEstimada, setFechaEstimada] = useState('');
  const [lineas, setLineas] = useState<
  { idRepuesto: string; cantidad: number; precioUnitario: number }[]
  >([]);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [creada, setCreada] = useState<string | null>(null);

  const proveedores = useRecurso<Proveedor[]>(
    () => api.pedir<Proveedor[]>('/proveedores?soloActivos=true'), [],
  );
  const repuestos = useRecurso<PaginaDeDatos<{
    id: string; codigo: string; descripcion: string; precio: number;
  }>>(
    () => api.pedirPagina('/repuestos', { busqueda: busqueda === '' ? undefined : busqueda }),
    [busqueda],
  );

  const catalogo = repuestos.datos?.datos ?? [];
  const total = lineas.reduce((suma, l) => suma + l.cantidad * l.precioUnitario, 0);

  async function crear(): Promise<void> {
    setGuardando(true);
    setFallo(null);
    try {
      const compra = await api.pedir<CompraDetallada>('/compras', {
        metodo: 'POST',
        cuerpo: {
          idProveedor,
          ...(fechaEstimada === '' ? {} : { fechaEstimada }),
          lineas,
        },
      });
      setCreada(compra.id);
    } catch (problema) {
      setFallo(problema instanceof ErrorDeApi ? problema.message : 'No se pudo crear el pedido.');
    } finally {
      setGuardando(false);
    }
  }

  if (creada !== null) {
    return (
      <>
        <h2 className="scr">Pedido creado</h2>
        <Aviso tono="ok">
          El pedido quedo en <b>borrador</b>. Todavia no ha salido del centro y no suma
          existencia: reviselo y envielo al proveedor desde su detalle.
        </Aviso>
        <div className="tools">
          <Link className="btn pri" to={`/compras/${creada}`}>Ver el pedido</Link>
          <Link className="btn" to="/compras">Volver a las compras</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="scr">Nuevo pedido al proveedor</h2>
      <p className="sub">
        Se crea en borrador. Nada de esto suma existencia hasta que bodega cuente lo que llegue.
      </p>

      {fallo !== null ? <Aviso tono="warn">{fallo}</Aviso> : null}

      <Tarjeta titulo="A quien se le pide">
        <div className="g g2">
          <div>
            <label htmlFor="proveedor">Proveedor</label>
            <select
              id="proveedor" value={idProveedor}
              onChange={(evento) => setIdProveedor(evento.target.value)}
            >
              <option value="">Elija el proveedor</option>
              {(proveedores.datos ?? []).map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.codigo} · {proveedor.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fecha">Cuando deberia llegar</label>
            <input
              id="fecha" type="date" value={fechaEstimada}
              onChange={(evento) => setFechaEstimada(evento.target.value)}
            />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Que se pide">
        <div style={{ marginBottom: 9 }}>
          <label htmlFor="busqueda">Buscar el repuesto</label>
          <input
            id="busqueda" value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Codigo o descripcion"
          />
        </div>

        {busqueda !== '' ? (
          <table>
            <thead><tr><th>Codigo</th><th>Repuesto</th><th>Precio</th><th /></tr></thead>
            <tbody>
              {catalogo.slice(0, 10).map((repuesto) => (
                <tr key={repuesto.id}>
                  <td><code>{repuesto.codigo}</code></td>
                  <td>{repuesto.descripcion}</td>
                  <td>{cordobas(repuesto.precio)}</td>
                  <td>
                    <button
                      type="button" className="btn chico"
                      disabled={lineas.some((l) => l.idRepuesto === repuesto.id)}
                      onClick={() => setLineas([...lineas, {
                        idRepuesto: repuesto.id, cantidad: 1, precioUnitario: repuesto.precio,
                      }])}
                    >
                      Agregar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Tarjeta>

      {lineas.length > 0 ? (
        <Tarjeta titulo="El pedido">
          <table>
            <thead><tr><th>Repuesto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th><th /></tr></thead>
            <tbody>
              {lineas.map((linea, indice) => {
                const repuesto = catalogo.find((r) => r.id === linea.idRepuesto);
                return (
                  <tr key={linea.idRepuesto}>
                    <td>{repuesto?.descripcion ?? linea.idRepuesto}</td>
                    <td>
                      <input
                        type="number" min={1} style={{ width: 80 }} value={linea.cantidad}
                        onChange={(evento) => {
                          const copia = [...lineas];
                          copia[indice] = {
                            ...linea, cantidad: Math.max(1, Number(evento.target.value)),
                          };
                          setLineas(copia);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min={0} step={0.01} style={{ width: 110 }}
                        value={linea.precioUnitario}
                        onChange={(evento) => {
                          const copia = [...lineas];
                          copia[indice] = {
                            ...linea, precioUnitario: Math.max(0, Number(evento.target.value)),
                          };
                          setLineas(copia);
                        }}
                      />
                    </td>
                    <td>{cordobas(linea.cantidad * linea.precioUnitario)}</td>
                    <td>
                      <button
                        type="button" className="btn chico peligro"
                        onClick={() => setLineas(lineas.filter((_, i) => i !== indice))}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="meas" style={{ marginTop: 10 }}>
            <span>Total del pedido</span><b>{cordobas(total)}</b>
          </div>
        </Tarjeta>
      ) : null}

      <button
        type="button" className="btn pri"
        disabled={guardando || idProveedor === '' || lineas.length === 0}
        onClick={() => void crear()}
      >
        {guardando ? 'Creando…' : 'Crear el pedido'}
      </button>
    </>
  );
}

export function Proveedores(): JSX.Element {
  const { api, usuario } = useSesion();
  const [ronda, setRonda] = useState(0);
  const [fallo, setFallo] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({
    codigo: '', nombre: '', contacto: '', telefono: '', correo: '',
    direccion: '', atiendeGarantias: false,
  });
  const puedeGestionar = tienePermiso(usuario, 'compras.proveedor.gestionar');

  const { datos, cargando, error, recargar } = useRecurso<Proveedor[]>(
    () => api.pedir<Proveedor[]>('/proveedores'), [ronda],
  );

  async function guardar(): Promise<void> {
    setFallo(null);
    try {
      await api.pedir('/proveedores', {
        metodo: 'POST',
        cuerpo: {
          codigo: nuevo.codigo.trim(),
          nombre: nuevo.nombre.trim(),
          ...(nuevo.contacto.trim() === '' ? {} : { contacto: nuevo.contacto.trim() }),
          ...(nuevo.telefono.trim() === '' ? {} : { telefono: nuevo.telefono.trim() }),
          ...(nuevo.correo.trim() === '' ? {} : { correo: nuevo.correo.trim() }),
          ...(nuevo.direccion.trim() === '' ? {} : { direccion: nuevo.direccion.trim() }),
          atiendeGarantias: nuevo.atiendeGarantias,
        },
      });
      setNuevo({
        codigo: '', nombre: '', contacto: '', telefono: '', correo: '',
        direccion: '', atiendeGarantias: false,
      });
      setRonda(ronda + 1);
    } catch (problema) {
      setFallo(problema instanceof ErrorDeApi ? problema.message : 'No se pudo guardar.');
    }
  }

  async function cambiarActivo(id: string, activo: boolean): Promise<void> {
    setFallo(null);
    try {
      await api.pedir(`/proveedores/${id}/${activo ? 'activar' : 'desactivar'}`, {
        metodo: 'POST',
      });
      setRonda(ronda + 1);
    } catch (problema) {
      setFallo(problema instanceof ErrorDeApi ? problema.message : 'No se pudo cambiar.');
    }
  }

  return (
    <>
      <h2 className="scr">Proveedores</h2>
      <p className="sub">
        Un proveedor no se borra: se desactiva. Las compras viejas siguen apuntando a el,
        y el historial tiene que poder decir a quien se le compro.
      </p>

      {fallo !== null ? <Aviso tono="warn">{fallo}</Aviso> : null}

      {puedeGestionar ? (
        <Tarjeta titulo="Agregar proveedor">
          <div className="g g3">
            <div>
              <label htmlFor="codigo">Codigo</label>
              <input
                id="codigo" value={nuevo.codigo}
                onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
                placeholder="PRV-009"
              />
            </div>
            <div>
              <label htmlFor="nombre">Nombre</label>
              <input
                id="nombre" value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="contacto">Contacto</label>
              <input
                id="contacto" value={nuevo.contacto}
                onChange={(e) => setNuevo({ ...nuevo, contacto: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="telefono">Telefono</label>
              <input
                id="telefono" value={nuevo.telefono}
                onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="correo">Correo</label>
              <input
                id="correo" value={nuevo.correo}
                onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="direccion">Direccion</label>
              <input
                id="direccion" value={nuevo.direccion}
                onChange={(e) => setNuevo({ ...nuevo, direccion: e.target.value })}
              />
            </div>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 9 }}>
            <input
              type="checkbox" checked={nuevo.atiendeGarantias}
              onChange={(e) => setNuevo({ ...nuevo, atiendeGarantias: e.target.checked })}
            />
            <span style={{ fontSize: 12.5 }}>
              Atiende reclamos de garantia del fabricante
            </span>
          </label>
          <button
            type="button" className="btn pri" style={{ marginTop: 10 }}
            disabled={nuevo.codigo.trim().length < 3 || nuevo.nombre.trim().length < 3}
            onClick={() => void guardar()}
          >
            Agregar
          </button>
        </Tarjeta>
      ) : null}

      {cargando ? <Cargando que="los proveedores" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}

      {datos !== null && error === null ? (
        datos.length === 0 ? <Vacio>No hay proveedores registrados.</Vacio> : (
          <table>
            <thead>
              <tr>
                <th>Codigo</th><th>Nombre</th><th>Contacto</th><th>Telefono</th>
                <th>Garantias</th><th>Estado</th>{puedeGestionar ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {datos.map((proveedor) => (
                <tr key={proveedor.id}>
                  <td><code>{proveedor.codigo}</code></td>
                  <td>{proveedor.nombre}</td>
                  <td className="tenue">{proveedor.contacto ?? '—'}</td>
                  <td className="tenue">{proveedor.telefono ?? '—'}</td>
                  <td>{proveedor.atiendeGarantias ? <Etiqueta tono="t-t">si</Etiqueta> : '—'}</td>
                  <td>
                    {proveedor.activo
                      ? <Etiqueta tono="t-t">activo</Etiqueta>
                      : <Etiqueta tono="t-g">inactivo</Etiqueta>}
                  </td>
                  {puedeGestionar ? (
                    <td>
                      <button
                        type="button"
                        className={proveedor.activo ? 'btn chico peligro' : 'btn chico'}
                        onClick={() => void cambiarActivo(proveedor.id, !proveedor.activo)}
                      >
                        {proveedor.activo ? 'Desactivar' : 'Activar'}
                      </button>
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
