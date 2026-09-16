/**
 * W-03 · Nueva orden de servicio.
 *
 * Es la pantalla que el prototipo pone primero en la tabla de
 * correspondencia, y con razon: **la garantia se evalua AL CREAR LA ORDEN,
 * no al facturar**. Cuando el agente termina el paso 2, el sistema ya sabe
 * quien paga, y se lo dice antes de guardar nada.
 *
 * Eso decide la forma de la pantalla. Son cuatro pasos y el tercero no es
 * un formulario: es el veredicto del motor de garantias, consultado contra
 * el servidor con el articulo real. Que sea el servidor quien lo diga no es
 * un detalle de arquitectura — es lo que hace que el numero que se le
 * promete al cliente por telefono sea el mismo que va a salir en el
 * expediente de cobro tres semanas despues.
 *
 * El numero correlativo lo asigna el servidor al guardar. Aqui no se
 * inventa ninguno.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MODALIDAD_SERVICIO,
  type CatalogosDeApoyo, type EvaluacionCobertura, type FichaArticulo, type FichaCliente,
  type FichaOrden, type ResumenArticulo, type ResumenCliente,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Tarjeta, cordobas } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

/** Lo que se espera desde la ultima tecla al buscar cliente. */
const RETARDO_MS = 300;

export function NuevaOrden(): JSX.Element {
  const { api } = useSesion();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();

  // ── paso 1: cliente ──
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [cliente, setCliente] = useState<ResumenCliente | null>(null);

  // ── paso 2: articulo ──
  const [idArticulo, setIdArticulo] = useState('');
  const [creandoArticulo, setCreandoArticulo] = useState(false);
  const [nuevoArticulo, setNuevoArticulo] = useState({
    idMarca: '', idCategoria: '', idTiendaOrigen: '',
    modelo: '', numeroSerie: '', fechaCompra: '', facturaReferencia: '',
  });

  // ── paso 3: cobertura (la calcula el servidor) ──
  const [cobertura, setCobertura] = useState<EvaluacionCobertura | null>(null);
  const [evaluando, setEvaluando] = useState(false);

  // ── paso 4: falla y asignacion ──
  const [fallaReportada, setFallaReportada] = useState('');
  const [modalidad, setModalidad] = useState<'ruta' | 'taller'>(MODALIDAD_SERVICIO.RUTA);
  const [idZona, setIdZona] = useState('');
  const [direccionServicio, setDireccionServicio] = useState('');
  const [referenciaUbicacion, setReferenciaUbicacion] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogos = useRecurso<CatalogosDeApoyo>(
    () => api.pedir<CatalogosDeApoyo>('/catalogos'), [],
  );

  // Búsqueda incremental de cliente, esperando a que deje de teclear: sin
  // eso, escribir un nombre dispara catorce consultas y las respuestas
  // llegan desordenadas.
  useEffect(() => {
    const temporizador = setTimeout(() => setConsulta(texto.trim()), RETARDO_MS);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const sugerencias = useRecurso<PaginaDeDatos<ResumenCliente>>(
    () => (consulta.length < 2
      ? Promise.resolve({ datos: [], paginacion: { pagina: 1, tamano: 0, total: 0, totalPaginas: 0 } })
      : api.pedirPagina<ResumenCliente>('/clientes', { texto: consulta, tamano: 8 })),
    [consulta],
  );

  // Si se llegó desde la ficha de un cliente, ya viene elegido.
  const idClienteInicial = parametros.get('idCliente');
  useEffect(() => {
    if (idClienteInicial === null || cliente !== null) return;
    void api.pedir<FichaCliente>(`/clientes/${idClienteInicial}`)
      .then((ficha) => { setCliente(ficha); setTelefonoContacto(ficha.telefonoVigente ?? ''); })
      .catch(() => undefined);
  }, [api, idClienteInicial, cliente]);

  const articulos = useRecurso<PaginaDeDatos<ResumenArticulo>>(
    () => (cliente === null
      ? Promise.resolve({ datos: [], paginacion: { pagina: 1, tamano: 0, total: 0, totalPaginas: 0 } })
      : api.pedirPagina<ResumenArticulo>('/articulos', { idCliente: cliente.id, tamano: 50 })),
    [cliente?.id],
  );

  /**
   * Pregunta al servidor quién paga. NO se calcula aquí: el motor de
   * garantías vive en el servidor y es el mismo que decidirá el expediente
   * de cobro. Dos motores darían dos respuestas, y la mala saldría a la luz
   * semanas después.
   */
  async function evaluarCobertura(id: string): Promise<void> {
    if (id === '' || cliente === null) return;
    setEvaluando(true);
    setError(null);
    try {
      setCobertura(await api.pedir<EvaluacionCobertura>('/coberturas/evaluar', {
        metodo: 'POST',
        cuerpo: { idArticulo: id, idClienteSolicitante: cliente.id },
      }));
    } catch (fallo) {
      setCobertura(null);
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo evaluar la cobertura.');
    } finally {
      setEvaluando(false);
    }
  }

  async function registrarArticulo(): Promise<void> {
    if (cliente === null) return;
    setGuardando(true);
    setError(null);
    try {
      const creado = await api.pedir<FichaArticulo>('/articulos', {
        metodo: 'POST',
        cuerpo: {
          idCliente: cliente.id,
          idMarca: nuevoArticulo.idMarca,
          idCategoria: nuevoArticulo.idCategoria,
          idTiendaOrigen: nuevoArticulo.idTiendaOrigen,
          modelo: nuevoArticulo.modelo.trim() === '' ? null : nuevoArticulo.modelo.trim(),
          numeroSerie: nuevoArticulo.numeroSerie.trim() === '' ? null : nuevoArticulo.numeroSerie.trim(),
          fechaCompra: nuevoArticulo.fechaCompra === '' ? null : nuevoArticulo.fechaCompra,
          facturaReferencia: nuevoArticulo.facturaReferencia.trim() === ''
            ? null : nuevoArticulo.facturaReferencia.trim(),
        },
      });
      setCreandoArticulo(false);
      setIdArticulo(creado.id);
      articulos.recargar();
      await evaluarCobertura(creado.id);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo registrar el articulo.');
    } finally {
      setGuardando(false);
    }
  }

  async function guardar(): Promise<void> {
    if (cliente === null || idArticulo === '') return;
    setGuardando(true);
    setError(null);
    try {
      const creada = await api.pedir<FichaOrden>('/ordenes', {
        metodo: 'POST',
        cuerpo: {
          idCliente: cliente.id,
          idArticulo,
          modalidad,
          fallaReportada: fallaReportada.trim(),
          ...(telefonoContacto.trim() === '' ? {} : { telefonoContacto: telefonoContacto.trim() }),
          ...(modalidad === MODALIDAD_SERVICIO.RUTA
            ? {
              ...(idZona === '' ? {} : { idZona }),
              ...(direccionServicio.trim() === '' ? {} : { direccionServicio: direccionServicio.trim() }),
              ...(referenciaUbicacion.trim() === ''
                ? {} : { referenciaUbicacion: referenciaUbicacion.trim() }),
            }
            : {}),
        },
      });
      // El número correlativo lo asignó el servidor; se va a la ficha.
      navegar(`/ordenes/${creada.id}`);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo crear la orden.');
    } finally {
      setGuardando(false);
    }
  }

  const zonaElegida = useMemo(
    () => catalogos.datos?.zonas.find((zona) => zona.id === idZona),
    [catalogos.datos, idZona],
  );

  const listo = cliente !== null && idArticulo !== '' && fallaReportada.trim().length >= 10;

  return (
    <>
      <h2 className="scr">Nueva orden de servicio</h2>
      <p className="sub">El numero correlativo se genera al guardar</p>

      {error === null ? null : <Aviso>{error}</Aviso>}

      {/* ── 1 · Cliente ── */}
      <Tarjeta titulo="1 · Cliente">
        {cliente === null ? (
          <>
            <div className="g g3">
              <div>
                <label>Buscar</label>
                <input
                  value={texto}
                  onChange={(evento) => setTexto(evento.target.value)}
                  placeholder="Nombre, identificacion o telefono"
                  autoFocus
                />
              </div>
            </div>
            {sugerencias.datos !== null && sugerencias.datos.datos.length > 0 ? (
              <div className="sugerencias">
                {sugerencias.datos.datos.map((candidato) => (
                  <button
                    key={candidato.id}
                    type="button"
                    onClick={() => {
                      setCliente(candidato);
                      setTelefonoContacto(candidato.telefonoVigente ?? '');
                      setDireccionServicio(candidato.direccionPrincipal ?? '');
                    }}
                  >
                    {candidato.nombres} {candidato.apellidos ?? ''}
                    <small>
                      {candidato.identificacion ?? 'sin identificacion'} ·{' '}
                      {candidato.telefonoVigente ?? 'sin telefono'}
                    </small>
                  </button>
                ))}
              </div>
            ) : null}
            {consulta.length >= 2 && sugerencias.datos?.datos.length === 0 && !sugerencias.cargando ? (
              <p className="cargando">
                Ningun cliente coincide con «{consulta}».{' '}
                <a href="/clientes">Registrelo primero en Clientes</a>.
              </p>
            ) : null}
          </>
        ) : (
          <div className="g g3">
            <div>
              <label>Nombre</label>
              <input value={`${cliente.nombres} ${cliente.apellidos ?? ''}`.trim()} readOnly />
            </div>
            <div>
              <label>Telefono de contacto</label>
              {/* Se copia a la orden y queda congelado ahí (RN-22). */}
              <input
                value={telefonoContacto}
                onChange={(evento) => setTelefonoContacto(evento.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setCliente(null); setIdArticulo(''); setCobertura(null); setTexto('');
                }}
              >
                Cambiar de cliente
              </button>
            </div>
          </div>
        )}
      </Tarjeta>

      {/* ── 2 · Artículo ── */}
      {cliente === null ? null : (
        <Tarjeta titulo="2 · Articulo">
          {!creandoArticulo ? (
            <>
              <div className="g g2">
                <div>
                  <label>Articulo del cliente</label>
                  <select
                    value={idArticulo}
                    onChange={(evento) => {
                      setIdArticulo(evento.target.value);
                      void evaluarCobertura(evento.target.value);
                    }}
                  >
                    <option value="">Seleccione…</option>
                    {(articulos.datos?.datos ?? []).map((articulo) => (
                      <option key={articulo.id} value={articulo.id}>
                        {articulo.marca} {articulo.modelo ?? ''} ·{' '}
                        {articulo.numeroSerie ?? 'sin serie'}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => setCreandoArticulo(true)}>
                    Registrar un articulo nuevo
                  </button>
                </div>
              </div>
              {articulos.datos?.datos.length === 0 && !articulos.cargando ? (
                <p className="cargando">
                  Este cliente no tiene articulos registrados. Registre uno para continuar.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="g g4">
                <div>
                  <label>Categoria</label>
                  <select
                    value={nuevoArticulo.idCategoria}
                    onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, idCategoria: e.target.value })}
                  >
                    <option value="">Seleccione…</option>
                    {(catalogos.datos?.categorias ?? []).map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.nombre.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Marca</label>
                  <select
                    value={nuevoArticulo.idMarca}
                    onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, idMarca: e.target.value })}
                  >
                    <option value="">Seleccione…</option>
                    {(catalogos.datos?.marcas ?? []).map((marca) => (
                      <option key={marca.id} value={marca.id}>{marca.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Modelo</label>
                  <input
                    value={nuevoArticulo.modelo}
                    onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, modelo: e.target.value })}
                  />
                </div>
                <div>
                  <label>N.º de serie</label>
                  <input
                    value={nuevoArticulo.numeroSerie}
                    onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, numeroSerie: e.target.value })}
                  />
                </div>
              </div>

              <div className="g g3" style={{ marginTop: 11 }}>
                <div>
                  <label>Tienda de origen</label>
                  <select
                    value={nuevoArticulo.idTiendaOrigen}
                    onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, idTiendaOrigen: e.target.value })}
                  >
                    <option value="">Seleccione…</option>
                    {(catalogos.datos?.tiendas ?? []).map((tienda) => (
                      <option key={tienda.id} value={tienda.id}>
                        {tienda.nombre}{tienda.perteneceAlGrupo ? '' : ' (externa)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Fecha de compra</label>
                  <input
                    type="date"
                    value={nuevoArticulo.fechaCompra}
                    onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, fechaCompra: e.target.value })}
                  />
                </div>
                <div>
                  <label>Factura</label>
                  <input
                    value={nuevoArticulo.facturaReferencia}
                    onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, facturaReferencia: e.target.value })}
                    placeholder="F-88214"
                  />
                </div>
              </div>

              <Aviso tono="warn">
                <b>La tienda de origen y la fecha de compra deciden quien paga.</b> Un articulo
                del grupo lo cubre el proveedor; el mismo articulo como externo lo paga el
                cliente. Despues de registrarlo, corregir cualquiera de los dos exige jefatura,
                motivo escrito y queda en bitacora (RN-24).
              </Aviso>

              <div className="tools">
                <button
                  type="button"
                  className="btn pri"
                  disabled={guardando || nuevoArticulo.idMarca === ''
                    || nuevoArticulo.idCategoria === '' || nuevoArticulo.idTiendaOrigen === ''}
                  onClick={() => void registrarArticulo()}
                >
                  Registrar articulo
                </button>
                <button type="button" className="btn" onClick={() => setCreandoArticulo(false)}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </Tarjeta>
      )}

      {/* ── 3 · Cobertura: el veredicto del servidor ── */}
      {idArticulo === '' ? null : (
        <Tarjeta titulo="3 · Evaluacion de cobertura" acento="var(--blue)">
          {evaluando ? <Cargando que="la cobertura" /> : null}
          {cobertura === null || evaluando ? null : (
            <>
              <Aviso tono={cobertura.tipo === 'particular' ? 'warn' : 'info'}>
                <b>El sistema determino: garantia {cobertura.tipo.replace(/_/g, ' ')}.</b>{' '}
                {cobertura.motivo}{' '}
                <b>
                  Costo para el cliente:{' '}
                  {cobertura.tipo === 'particular'
                    ? 'lo que resulte de la cotizacion'
                    : `${cordobas(0)}, se reclama al responsable`}
                  .
                </b>
              </Aviso>
              {/* El desglose es lo que hace auditable el veredicto: no dice
                  solo "particular", dice que condicion fallo. */}
              <table className="d">
                <thead>
                  <tr><th>Condicion evaluada</th><th>Resultado</th></tr>
                </thead>
                <tbody>
                  {cobertura.desglose.map((condicion) => (
                    <tr key={condicion.nombre}>
                      <td>{condicion.nombre.replace(/_/g, ' ')}</td>
                      <td>
                        <span className={condicion.seCumplio ? 'tag t-t' : 'tag t-r'}>
                          {condicion.seCumplio ? 'se cumple' : 'no se cumple'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '10px 0 0' }}>
                La cobertura se reevalua tras el diagnostico: si la falla resulta excluida, la
                orden se detiene y pasa a particular (RN-04, RN-05). Este veredicto lo emite el
                mismo motor que decidira el expediente de cobro.
              </p>
            </>
          )}
        </Tarjeta>
      )}

      {/* ── 4 · Falla y asignación ── */}
      {idArticulo === '' ? null : (
        <Tarjeta titulo="4 · Falla y modalidad">
          <div className="g g2">
            <div>
              <label>Falla reportada por el cliente</label>
              <textarea
                rows={3}
                value={fallaReportada}
                onChange={(evento) => setFallaReportada(evento.target.value)}
                placeholder="No enfria la parte baja. El motor enciende pero se apaga a los pocos minutos."
              />
              {fallaReportada.trim().length > 0 && fallaReportada.trim().length < 10 ? (
                <p className="mensaje-error">Describa la falla con algo mas de detalle.</p>
              ) : null}
            </div>
            <div>
              <label>Modalidad</label>
              <select
                value={modalidad}
                onChange={(evento) => setModalidad(evento.target.value as 'ruta' | 'taller')}
              >
                <option value={MODALIDAD_SERVICIO.RUTA}>Ruta — visita a domicilio</option>
                <option value={MODALIDAD_SERVICIO.TALLER}>Taller — el cliente traslada el articulo</option>
              </select>

              {modalidad === MODALIDAD_SERVICIO.RUTA ? (
                <>
                  <div style={{ marginTop: 10 }}>
                    <label>Zona</label>
                    <select value={idZona} onChange={(evento) => setIdZona(evento.target.value)}>
                      <option value="">Tomar la del cliente</option>
                      {(catalogos.datos?.zonas ?? []).map((zona) => (
                        <option key={zona.id} value={zona.id}>
                          {zona.nombre} · {cordobas(zona.cargoVisita)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label>Direccion del servicio</label>
                    <input
                      value={direccionServicio}
                      onChange={(evento) => setDireccionServicio(evento.target.value)}
                    />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label>Referencia</label>
                    <input
                      value={referenciaUbicacion}
                      onChange={(evento) => setReferenciaUbicacion(evento.target.value)}
                      placeholder="Porton verde, frente a la pulperia"
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {modalidad === MODALIDAD_SERVICIO.RUTA ? (
            <Aviso tono="info">
              La direccion, la zona y el cargo por visita{' '}
              {zonaElegida === undefined ? '' : `(${cordobas(zonaElegida.cargoVisita)}) `}
              se <b>congelan</b> en la orden al crearla: describen como eran las cosas cuando
              ocurrio el servicio, y cambiarlos despues en la ficha del cliente no las altera
              (RN-22).
            </Aviso>
          ) : null}

          <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '10px 0 0' }}>
            El tecnico se asigna despues, desde la agenda o la cola de taller: quien reparte el
            trabajo es la jefatura de tecnicos y ve la carga de cada uno.
          </p>
        </Tarjeta>
      )}

      <div className="tools">
        <button
          type="button"
          className="btn pri"
          disabled={!listo || guardando}
          onClick={() => void guardar()}
        >
          {guardando ? 'Guardando…' : 'Guardar orden'}
        </button>
        <button type="button" className="btn" onClick={() => navegar('/ordenes')}>
          Cancelar
        </button>
      </div>
    </>
  );
}
