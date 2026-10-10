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
 * promete al cliente por telefono sea el mismo que se aplica al cerrar la
 * orden tres semanas despues.
 *
 * El numero correlativo lo asigna el servidor al guardar. Aqui no se
 * inventa ninguno.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FRANJAS_HORARIAS, MODALIDAD_SERVICIO, esFechaValida, ultimoDiaCubierto,
  type CatalogosDeApoyo, type EvaluacionCobertura, type FichaArticulo, type FichaCliente,
  type FichaOrden, type ResumenArticulo, type ResumenCliente,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Tarjeta, cordobas } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';

/** Lo que se espera desde la ultima tecla al buscar cliente. */
const RETARDO_MS = 300;

export function NuevaOrden(): JSX.Element {
  const { api, usuario } = useSesion();
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
    conGarantiaAdicional: false, fechaContratacion: '', mesesAdicional: '',
  });
  const mesesAdicional = Number(nuevoArticulo.mesesAdicional);
  const adicionalCompleta = nuevoArticulo.conGarantiaAdicional
    && esFechaValida(nuevoArticulo.fechaContratacion) && Number.isInteger(mesesAdicional) && mesesAdicional >= 1 && mesesAdicional <= 120;
  // Vista previa: la misma funcion que usa el servidor, que es quien guarda.
  const venceAdicional = adicionalCompleta ? ultimoDiaCubierto(nuevoArticulo.fechaContratacion, mesesAdicional) : null;

  // ── paso 3: cobertura (la calcula el servidor) ──
  const [cobertura, setCobertura] = useState<EvaluacionCobertura | null>(null);
  /*
   * Con que se atendera: se pregunta antes de crear la orden, despues de
   * ver el estado de cada garantia. Vacio = todavia no se eligio.
   */
  const [modalidadGarantia, setModalidadGarantia] = useState<'' | 'proveedor' | 'adicional' | 'particular'>('');
  const [evaluando, setEvaluando] = useState(false);

  // ── paso 4: falla y asignacion ──
  const [fallaReportada, setFallaReportada] = useState('');
  /*
   * Modalidad de SERVICIO: visita a domicilio (ruta) o el cliente lleva el
   * articulo al taller. Sin valor por defecto: se elige siempre, a la
   * vista, antes de guardar. No tiene que ver con la garantia.
   */
  const [modalidad, setModalidad] = useState<'' | 'ruta' | 'taller'>('');
  const [fechaVisita, setFechaVisita] = useState('');
  const [franjaVisita, setFranjaVisita] = useState('');
  const [idTecnicoVisita, setIdTecnicoVisita] = useState('');
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

  /*
   * Si se llego desde la ficha de un cliente (o desde sus ordenes), ya viene
   * elegido. Se precarga UNA vez por identificador: antes, «Cambiar de
   * cliente» dejaba el cliente en null y el efecto lo volvia a cargar, asi
   * que no habia forma de elegir otro. Y si la precarga fallaba —cliente
   * inexistente, desactivado, sin permiso— la pantalla se quedaba en la
   * busqueda sin decir por que.
   */
  const idClienteInicial = parametros.get('idCliente');
  const [precargado, setPrecargado] = useState<string | null>(null);
  const [precargando, setPrecargando] = useState(false);
  const [errorPrecarga, setErrorPrecarga] = useState<string | null>(null);
  useEffect(() => {
    if (idClienteInicial === null || idClienteInicial === precargado) return;
    setPrecargado(idClienteInicial);
    setPrecargando(true);
    setErrorPrecarga(null);
    void api.pedir<FichaCliente>(`/clientes/${idClienteInicial}`)
      .then((ficha) => {
        if (ficha.idClientePrincipal !== null) {
          setErrorPrecarga('Ese cliente fue fusionado con otra ficha. Busque la ficha principal.');
          return;
        }
        if (!ficha.activo) {
          setErrorPrecarga(
            `${ficha.nombres} ${ficha.apellidos ?? ''} esta desactivado y no puede recibir ordenes nuevas.`,
          );
          return;
        }
        setCliente(ficha);
        setTelefonoContacto(ficha.telefonoVigente ?? '');
        setDireccionServicio(ficha.direccionPrincipal ?? '');
      })
      .catch((fallo: unknown) => {
        setErrorPrecarga(fallo instanceof ErrorDeApi
          ? `No se pudo cargar el cliente indicado: ${fallo.message}`
          : 'No se pudo cargar el cliente indicado. Busquelo por nombre o telefono.');
      })
      .finally(() => setPrecargando(false));
  }, [api, idClienteInicial, precargado]);

  const articulos = useRecurso<PaginaDeDatos<ResumenArticulo>>(
    () => (cliente === null
      ? Promise.resolve({ datos: [], paginacion: { pagina: 1, tamano: 0, total: 0, totalPaginas: 0 } })
      : api.pedirPagina<ResumenArticulo>('/articulos', { idCliente: cliente.id, tamano: 50 })),
    [cliente?.id],
  );

  /**
   * Pregunta al servidor quién paga. NO se calcula aquí: el motor de
   * garantías vive en el servidor y es el mismo que reevalúa la cobertura
   * tras el diagnóstico. Dos motores darían dos respuestas, y la mala saldría
   * a la luz semanas después.
   */
  async function evaluarCobertura(id: string): Promise<void> {
    if (id === '' || cliente === null) return;
    setEvaluando(true);
    setError(null);
    try {
      setModalidadGarantia('');
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
          garantiaAdicional: adicionalCompleta
            ? { fechaContratacion: nuevoArticulo.fechaContratacion, meses: mesesAdicional }
            : null,
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
          tipoGarantiaElegida: modalidadGarantia,
          ...(modalidad === MODALIDAD_SERVICIO.RUTA && fechaVisita !== '' && franjaVisita !== ''
            ? {
              visita: {
                fechaProgramada: fechaVisita,
                franjaHoraria: franjaVisita,
                ...(idTecnicoVisita === '' ? {} : { idTecnico: idTecnicoVisita }),
              },
            }
            : {}),
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

  const listo = cliente !== null && idArticulo !== '' && fallaReportada.trim().length >= 10
    && modalidadGarantia !== '' && modalidad !== ''
    && (modalidad !== MODALIDAD_SERVICIO.RUTA || (direccionServicio.trim() !== '' && telefonoContacto.trim() !== ''))
    // Fecha y franja van juntas; el tecnico, solo si hay fecha y franja.
    && (fechaVisita === '') === (franjaVisita === '')
    && (idTecnicoVisita === '' || fechaVisita !== '');
  const puedeProgramar = tienePermiso(usuario, 'ordenes.asignar') && tienePermiso(usuario, 'agenda.programar');
  const articuloElegido = (articulos.datos?.datos ?? []).find((articulo) => articulo.id === idArticulo) ?? null;

  return (
    <>
      <h2 className="scr">Nueva orden de servicio</h2>
      <p className="sub">El numero correlativo se genera al guardar</p>

      {error === null ? null : <Aviso>{error}</Aviso>}

      {/* ── 1 · Cliente ── */}
      <Tarjeta titulo="1 · Cliente">
        {precargando ? <Cargando que="el cliente" /> : null}
        {errorPrecarga === null || cliente !== null ? null : <Aviso tono="warn">{errorPrecarga}</Aviso>}
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
                <Link to="/clientes">Registrelo primero en Clientes</Link>.
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

              <fieldset style={{ border: '1px solid var(--line)', margin: '10px 0', padding: '8px 12px' }}>
                <legend style={{ fontSize: 12.5, fontWeight: 600 }}>Garantia adicional (opcional)</legend>
                <label className="opcion">
                  <input
                    type="checkbox" checked={nuevoArticulo.conGarantiaAdicional}
                    onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, conGarantiaAdicional: e.target.checked })}
                  />
                  El cliente compro una garantia adicional
                </label>
                {nuevoArticulo.conGarantiaAdicional ? (
                  <div className="g g3">
                    <div>
                      <label>Fecha de contratacion *</label>
                      <input
                        type="date" value={nuevoArticulo.fechaContratacion}
                        onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, fechaContratacion: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Duracion en meses *</label>
                      <input
                        type="number" min={1} max={120} value={nuevoArticulo.mesesAdicional}
                        onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, mesesAdicional: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Vence (calculado)</label>
                      <input readOnly value={venceAdicional ?? '—'} />
                    </div>
                  </div>
                ) : <small className="tenue">Si no la compro, deje esto sin marcar: no hace falta ninguna fecha.</small>}
                <small className="tenue" style={{ display: 'block' }}>
                  Es distinta de la garantia del fabricante, que se calcula con la fecha de compra. El vencimiento lo
                  calcula el servidor al guardar: cubre hasta el dia anterior al mismo dia, N meses despues
                  (o hasta el ultimo dia del mes si ese dia no existe).
                </small>
              </fieldset>

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
                    || nuevoArticulo.idCategoria === '' || nuevoArticulo.idTiendaOrigen === ''
                    || (nuevoArticulo.conGarantiaAdicional && !adicionalCompleta)}
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
                  {cobertura.tipo === 'particular'
                    ? 'La reparacion necesitara la autorizacion del cliente tras el diagnostico.'
                    : 'La reparacion esta cubierta por la garantia.'}
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
                mismo motor que reevalua la cobertura tras el diagnostico.
              </p>

              {articuloElegido === null ? null : (
                <p style={{ fontSize: 12.5, margin: '10px 0 0' }}>
                  <b>Articulo:</b> {articuloElegido.marca} {articuloElegido.modelo ?? ''} · serie{' '}
                  {articuloElegido.numeroSerie ?? 'no registrada'} · compra {articuloElegido.fechaCompra ?? 'sin fecha'}
                </p>
              )}

              {cobertura.garantias === undefined ? null : (
                <>
                  <table className="d" style={{ marginTop: 8 }}>
                    <thead><tr><th>Garantia</th><th>Desde</th><th>Meses</th><th>Vence</th><th>Vigencia</th><th>¿Se puede usar?</th></tr></thead>
                    <tbody>
                      {(['proveedor', 'adicional'] as const).map((clave) => {
                        const estado = cobertura.garantias![clave];
                        return (
                          <tr key={clave}>
                            <td>{clave === 'proveedor' ? 'Del proveedor (fabricante)' : 'Adicional'}</td>
                            <td>{estado.desde ?? '—'}<br /><small className="tenue">{clave === 'proveedor' ? 'compra' : 'contratacion'}</small></td>
                            <td>{estado.meses ?? '—'}</td>
                            <td>{estado.venceEl ?? '—'}</td>
                            <td>
                              <span className={estado.vigencia === 'vigente' ? 'tag t-t' : estado.vigencia === 'vencida' ? 'tag t-r' : 'tag t-g'}>
                                {estado.vigencia === 'no_registrada' ? 'no registrada' : estado.vigencia}
                              </span>
                              {estado.origen === 'regla' ? <small className="tenue"> (calculada por la regla)</small> : null}
                            </td>
                            <td>{estado.aplicable ? 'si' : <span className="tenue">no · {estado.motivo}</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <fieldset style={{ border: '1px solid var(--line)', marginTop: 10, padding: '8px 12px' }}>
                    <legend style={{ fontSize: 12.5, fontWeight: 600 }}>¿Con que garantia se atendera? *</legend>
                    {([
                      { valor: 'proveedor', nombre: 'Garantia del proveedor', posible: cobertura.garantias.proveedor.aplicable },
                      { valor: 'adicional', nombre: 'Garantia adicional', posible: cobertura.garantias.adicional.aplicable },
                      { valor: 'particular', nombre: 'Servicio particular (lo paga el cliente)', posible: true },
                    ] as const).map((opcion) => (
                      <label key={opcion.valor} className="opcion" style={{ opacity: opcion.posible ? 1 : 0.5 }}>
                        <input
                          type="radio" name="modalidad-garantia" value={opcion.valor}
                          disabled={!opcion.posible}
                          checked={modalidadGarantia === opcion.valor}
                          onChange={() => setModalidadGarantia(opcion.valor)}
                        />{' '}
                        {opcion.nombre}{opcion.posible ? '' : ' — no disponible'}
                      </label>
                    ))}
                    <small className="tenue">
                      Una garantia vigente no garantiza que la reparacion quede cubierta: golpes, mal uso y fallas
                      excluidas se determinan en el diagnostico. Si el daño ya es evidente, elija servicio particular.
                    </small>
                  </fieldset>
                </>
              )}
            </>
          )}
        </Tarjeta>
      )}

      {/* ── 4 · Modalidad de servicio: domicilio o taller ── */}
      {idArticulo === '' ? null : (
        <Tarjeta titulo="4 · Modalidad de servicio *" acento="var(--amber)">
          <p className="tenue" style={{ fontSize: 12.5, marginTop: 0 }}>
            Es independiente de la garantia elegida arriba: un servicio a domicilio o en taller puede ser de
            garantia o particular.
          </p>
          <div className="g g2">
            {([
              { valor: MODALIDAD_SERVICIO.RUTA, titulo: 'Visita a domicilio (ruta)', texto: 'Un tecnico va a la casa del cliente.' },
              { valor: MODALIDAD_SERVICIO.TALLER, titulo: 'El cliente lleva el articulo al taller', texto: 'Recepcion en el centro, cola de taller, diagnostico y reparacion. Sin visita.' },
            ] as const).map((opcion) => (
              <label
                key={opcion.valor} className="opcion"
                style={{ border: `2px solid ${modalidad === opcion.valor ? 'var(--ink)' : 'var(--line)'}`, borderRadius: 4, padding: 10, cursor: 'pointer' }}
              >
                <input
                  type="radio" name="modalidad-servicio" value={opcion.valor}
                  checked={modalidad === opcion.valor} onChange={() => setModalidad(opcion.valor)}
                />
                <span><b>{opcion.titulo}</b><br /><small className="tenue">{opcion.texto}</small></span>
              </label>
            ))}
          </div>

          {modalidad === MODALIDAD_SERVICIO.RUTA ? (
            <>
              <div className="g g3" style={{ marginTop: 10 }}>
                <div>
                  <label>Direccion de la visita *</label>
                  <input value={direccionServicio} onChange={(evento) => setDireccionServicio(evento.target.value)} />
                </div>
                <div>
                  <label>Referencia</label>
                  <input
                    value={referenciaUbicacion} onChange={(evento) => setReferenciaUbicacion(evento.target.value)}
                    placeholder="Porton verde, frente a la pulperia"
                  />
                </div>
                <div>
                  <label>Telefono de contacto *</label>
                  <input value={telefonoContacto} onChange={(evento) => setTelefonoContacto(evento.target.value)} />
                </div>
                <div>
                  <label>Zona</label>
                  <select value={idZona} onChange={(evento) => setIdZona(evento.target.value)}>
                    <option value="">Tomar la del cliente</option>
                    {(catalogos.datos?.zonas ?? []).map((zona) => (
                      <option key={zona.id} value={zona.id}>{zona.nombre} · {cordobas(zona.cargoVisita)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Fecha {puedeProgramar ? 'de la visita' : 'solicitada por el cliente'}</label>
                  <input type="date" value={fechaVisita} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setFechaVisita(e.target.value)} />
                </div>
                <div>
                  <label>Franja horaria</label>
                  <select value={franjaVisita} onChange={(e) => setFranjaVisita(e.target.value)}>
                    <option value="">Sin franja</option>
                    {FRANJAS_HORARIAS.map((franja) => <option key={franja} value={franja}>{franja}</option>)}
                  </select>
                </div>
                {puedeProgramar ? (
                  <div>
                    <label>Tecnico (opcional)</label>
                    <select value={idTecnicoVisita} onChange={(e) => setIdTecnicoVisita(e.target.value)}>
                      <option value="">Asignar despues</option>
                      {(catalogos.datos?.tecnicos ?? []).filter((t) => t.tipo === 'ruta').map((tecnico) => (
                        <option key={tecnico.id} value={tecnico.id}>
                          {tecnico.nombre} · {tecnico.cargaActual} abiertas{tecnico.disponible ? '' : ' · no disponible'}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
              {(fechaVisita === '') !== (franjaVisita === '') ? (
                <p className="mensaje-error">Indique fecha y franja juntas, o deje las dos vacias.</p>
              ) : null}
              <Aviso tono="info">
                {idTecnicoVisita !== '' && fechaVisita !== ''
                  ? 'Al guardar se asigna el tecnico y la visita queda en su agenda para esa fecha y franja.'
                  : fechaVisita !== ''
                    ? 'La fecha y franja quedan anotadas como solicitud del cliente; la jefatura de tecnicos asigna y programa la visita.'
                    : 'La visita se programa despues desde la agenda.'}
                {' '}La direccion, la zona y el cargo por visita{' '}
                {zonaElegida === undefined ? '' : `(${cordobas(zonaElegida.cargoVisita)}) `}
                se <b>congelan</b> en la orden al crearla (RN-22).
              </Aviso>
            </>
          ) : null}

          {modalidad === MODALIDAD_SERVICIO.TALLER ? (
            <Aviso tono="info">
              El cliente entrega el articulo en el centro. No se pide direccion ni franja: la orden sigue
              recepcion, cola de taller, diagnostico y reparacion.
            </Aviso>
          ) : null}
        </Tarjeta>
      )}

      {/* ── 5 · Falla reportada ── */}
      {idArticulo === '' ? null : (
        <Tarjeta titulo="5 · Falla reportada por el cliente">
          <textarea
            rows={3}
            value={fallaReportada}
            onChange={(evento) => setFallaReportada(evento.target.value)}
            placeholder="No enfria la parte baja. El motor enciende pero se apaga a los pocos minutos."
          />
          {fallaReportada.trim().length > 0 && fallaReportada.trim().length < 10 ? (
            <p className="mensaje-error">Describa la falla con algo mas de detalle.</p>
          ) : null}
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
