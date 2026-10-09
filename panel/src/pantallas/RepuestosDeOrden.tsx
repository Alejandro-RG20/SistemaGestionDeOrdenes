/**
 * Los repuestos de una orden: lo que se pidio, lo que se entrego, lo que se
 * instalo y lo que se devolvio.
 *
 * Son cinco operaciones distintas y cada una deja su rastro propio:
 *
 *   solicitar  ->  una solicitud, que bodega revisa.
 *   reservar   ->  bodega la aprueba; solo si hay disponibilidad.
 *   entregar   ->  movimiento de la bodega a la bodega personal del tecnico.
 *   consumir   ->  movimiento de consumo contra la orden, desde esa bodega.
 *   devolver   ->  movimiento de devolucion de lo que no se uso.
 *
 * Cada boton aparece solo para quien tiene el permiso, y el servidor lo
 * vuelve a comprobar: ocultar un boton no protege nada.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ETIQUETA_ESTADO_SOLICITUD, ESTADO_SOLICITUD, PASOS_CON_MOTIVO, TIPO_MOVIMIENTO,
  type DisponibilidadRepuesto, type EstadoSolicitud, type ExistenciaEnBodega, type FichaOrden,
  type ResumenBodega, type ResumenMovimiento, type ResumenRepuesto, type SolicitudConRecorrido,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio, fechaHora } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';

const ACCION: Record<string, string> = {
  en_revision: 'Revisar',
  aprobada: 'Aprobar (reservar)',
  rechazada: 'Rechazar',
  preparada: 'Preparar',
  entregada: 'Entregar al tecnico',
  recibida: 'Confirmar recibido',
  anulada: 'Anular',
};

const PAGINA_VACIA = { datos: [], paginacion: { pagina: 1, tamano: 0, total: 0, totalPaginas: 0 } };

function mensajeDe(error: unknown, porDefecto: string): string {
  return error instanceof ErrorDeApi ? error.message : porDefecto;
}

export function RepuestosDeOrden({ orden }: { orden: FichaOrden }): JSX.Element {
  const { api, usuario } = useSesion();
  const cerrada = orden.destinosPosibles.length === 0;

  const puedeSolicitar = !cerrada && orden.idTecnico !== null && (
    tienePermiso(usuario, 'inventario.solicitud.crear')
    || tienePermiso(usuario, 'inventario.solicitud.gestionar'));
  const puedeConsumir = !cerrada && tienePermiso(usuario, 'inventario.consumo.registrar');
  const puedeDevolver = tienePermiso(usuario, 'inventario.devolucion.registrar');

  const solicitudes = useRecurso<PaginaDeDatos<SolicitudConRecorrido>>(
    () => api.pedirPagina<SolicitudConRecorrido>('/solicitudes-repuesto/recorrido', {
      idOrden: orden.id, tamano: 50,
    }),
    [orden.id],
  );
  const movimientos = useRecurso<PaginaDeDatos<ResumenMovimiento>>(
    () => api.pedirPagina<ResumenMovimiento>('/movimientos', { idOrden: orden.id, tamano: 100 }),
    [orden.id],
  );
  const bodegas = useRecurso<readonly ResumenBodega[]>(
    () => api.pedir<readonly ResumenBodega[]>('/bodegas').catch(() => []), [],
  );

  // La bodega personal del tecnico de la orden: de ahi se consume y desde
  // ahi se devuelve. Las centrales que surten son de donde se entrega.
  const bodegaDelTecnico = (bodegas.datos ?? []).find(
    (b) => b.tipo === 'movil' && b.activa && b.idTecnico === orden.idTecnico,
  ) ?? null;
  const centrales = (bodegas.datos ?? []).filter((b) => b.tipo === 'central' && b.activa && b.surteRepuestos);

  const enPoder = useRecurso<PaginaDeDatos<ExistenciaEnBodega>>(
    () => (bodegaDelTecnico === null
      ? Promise.resolve(PAGINA_VACIA)
      : api.pedirPagina<ExistenciaEnBodega>('/existencias', { idBodega: bodegaDelTecnico.id, tamano: 100 })),
    [bodegaDelTecnico?.id],
  );

  const [fallo, setFallo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function recargarTodo(): void {
    solicitudes.recargar();
    movimientos.recargar();
    enPoder.recargar();
  }

  async function ejecutar(accion: () => Promise<unknown>, exito: string): Promise<void> {
    setFallo(null);
    setAviso(null);
    setOcupado(true);
    try {
      await accion();
      setAviso(exito);
      recargarTodo();
    } catch (error) {
      setFallo(mensajeDe(error, 'No se pudo completar la operacion.'));
    } finally {
      setOcupado(false);
    }
  }

  // ── pasos de una solicitud ──
  const [origenEntrega, setOrigenEntrega] = useState('');
  async function darPaso(solicitud: SolicitudConRecorrido, hacia: string): Promise<void> {
    const cuerpo: Record<string, unknown> = { hacia };
    if (PASOS_CON_MOTIVO.includes(hacia as EstadoSolicitud)) {
      const motivo = window.prompt('Escriba el motivo. Queda en el historial de la orden.');
      if (motivo === null || motivo.trim() === '') return;
      cuerpo['motivo'] = motivo.trim();
    }
    if (hacia === ESTADO_SOLICITUD.ENTREGADA) {
      const origen = origenEntrega !== '' ? origenEntrega : centrales[0]?.id;
      if (origen === undefined) { setFallo('No hay una bodega central activa de donde entregar.'); return; }
      const nombre = centrales.find((b) => b.id === origen)?.nombre ?? '';
      if (!window.confirm(
        `Entregar ${solicitud.cantidad} x ${solicitud.codigo} desde «${nombre}» a ${orden.tecnico ?? 'el tecnico'}? `
        + 'Se descuenta de la bodega y pasa a la bodega personal del tecnico.',
      )) return;
      cuerpo['idBodegaOrigen'] = origen;
    }
    await ejecutar(
      () => api.pedir(`/solicitudes-repuesto/${solicitud.id}/pasos`, { metodo: 'POST', cuerpo }),
      `Solicitud ${solicitud.codigo}: ${ETIQUETA_ESTADO_SOLICITUD[hacia as EstadoSolicitud] ?? hacia}.`,
    );
  }

  // ── consumir y devolver ──
  async function consumir(existencia: ExistenciaEnBodega): Promise<void> {
    const texto = window.prompt(
      `Cuantas unidades de ${existencia.codigo} se instalaron en esta orden? (tiene ${existencia.cantidad})`, '1',
    );
    if (texto === null) return;
    const cantidad = Number(texto);
    if (!Number.isInteger(cantidad) || cantidad <= 0) { setFallo('La cantidad debe ser un entero mayor que cero.'); return; }
    await ejecutar(
      () => api.pedir(`/ordenes/${orden.id}/consumos`, {
        metodo: 'POST',
        cuerpo: { consumos: [{ idRepuesto: existencia.idRepuesto, cantidad, idBodegaOrigen: existencia.idBodega }] },
      }),
      `Consumo registrado: ${cantidad} x ${existencia.codigo} en la orden ${orden.codigo}.`,
    );
  }

  async function devolver(existencia: ExistenciaEnBodega): Promise<void> {
    const destino = centrales[0];
    if (destino === undefined) { setFallo('No hay una bodega central activa a donde devolver.'); return; }
    const texto = window.prompt(
      `Cuantas unidades de ${existencia.codigo} se devuelven a «${destino.nombre}» sin usar? (tiene ${existencia.cantidad})`,
      String(existencia.cantidad),
    );
    if (texto === null) return;
    const cantidad = Number(texto);
    if (!Number.isInteger(cantidad) || cantidad <= 0) { setFallo('La cantidad debe ser un entero mayor que cero.'); return; }
    await ejecutar(
      () => api.pedir('/movimientos', {
        metodo: 'POST',
        cuerpo: {
          tipo: TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL,
          idRepuesto: existencia.idRepuesto,
          idBodegaOrigen: existencia.idBodega,
          idBodegaDestino: destino.id,
          cantidad,
          idOrden: orden.id,
          justificacion: `Repuesto no utilizado en la orden ${orden.codigo}`,
        },
      }),
      `Devolucion registrada: ${cantidad} x ${existencia.codigo} a ${destino.nombre}.`,
    );
  }

  return (
    <>
      {fallo === null ? null : <Aviso tono="warn">{fallo}</Aviso>}
      {aviso === null ? null : <Aviso tono="ok">{aviso}</Aviso>}

      {puedeSolicitar ? (
        <SolicitarRepuesto idOrden={orden.id} alSolicitar={(texto) => { setAviso(texto); recargarTodo(); }} />
      ) : null}
      {!cerrada && orden.idTecnico === null ? (
        <Aviso tono="info">
          La orden no tiene tecnico asignado. Los repuestos se piden y se entregan al tecnico de la
          orden: asignelo primero.
        </Aviso>
      ) : null}

      <Tarjeta titulo="Solicitudes de repuesto de esta orden">
        {solicitudes.cargando ? <Cargando que="las solicitudes" /> : null}
        {solicitudes.error !== null
          ? <Fallo error={solicitudes.error} alReintentar={solicitudes.recargar} /> : null}
        {solicitudes.datos !== null && solicitudes.datos.datos.length === 0
          ? <Vacio>No se han solicitado repuestos para esta orden.</Vacio> : null}
        {solicitudes.datos !== null && solicitudes.datos.datos.length > 0 ? (
          <>
            {centrales.length > 1 && solicitudes.datos.datos.some((s) => s.pasosPosibles.includes('entregada')) ? (
              <div style={{ maxWidth: 320, marginBottom: 8 }}>
                <label htmlFor="origen-entrega">Bodega de donde se entrega</label>
                <select id="origen-entrega" value={origenEntrega} onChange={(e) => setOrigenEntrega(e.target.value)}>
                  {centrales.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </div>
            ) : null}
            <table className="d">
              <thead>
                <tr>
                  <th>Repuesto</th><th className="numero">Cant.</th><th>Estado</th>
                  <th className="numero">Disponible</th><th>Recorrido</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.datos.datos.map((s) => (
                  <tr key={s.id}>
                    <td>{s.codigo}<br /><span className="tenue">{s.descripcion}</span></td>
                    <td className="numero">{s.cantidad}</td>
                    <td>
                      <span className="estado">{s.etiquetaEstado}</span>
                      {s.motivo === null ? null : <><br /><span className="tenue">{s.motivo}</span></>}
                    </td>
                    <td className="numero">
                      <span className={s.disponible >= s.cantidad ? 'estado estado-exito' : 'estado estado-alerta'}>
                        {s.disponible}
                      </span>
                    </td>
                    <td className="tenue" style={{ fontSize: 11 }}>
                      Pidio {s.solicitadaPor ?? '—'} · {s.fechaSolicitud}<br />
                      {s.revisadaPor === null ? null : <>Reviso {s.revisadaPor} · {fechaHora(s.revisadaEn)}<br /></>}
                      {s.preparadaPor === null ? null : <>Preparo {s.preparadaPor} · {fechaHora(s.preparadaEn)}<br /></>}
                      {s.entregadaPor === null ? null : <>Entrego {s.entregadaPor} · {fechaHora(s.entregadaEn)}<br /></>}
                      {s.recibidaEn === null ? null : <>Recibida {fechaHora(s.recibidaEn)}</>}
                    </td>
                    <td>
                      {s.pasosPosibles.length === 0 ? <span className="tenue">—</span> : s.pasosPosibles.map((paso) => (
                        <button
                          key={paso} type="button"
                          className={paso === 'rechazada' || paso === 'anulada' ? 'btn chico peligro' : 'btn chico'}
                          disabled={ocupado}
                          onClick={() => { void darPaso(s, paso); }}
                        >
                          {ACCION[paso] ?? paso}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </Tarjeta>

      {orden.idTecnico === null ? null : (
        <Tarjeta
          titulo={`En poder del tecnico${bodegaDelTecnico === null ? '' : ` · ${bodegaDelTecnico.nombre}`}`}
          extra="se consume desde aqui; lo que no se use se devuelve"
        >
          {bodegaDelTecnico === null ? (
            <Vacio>
              El tecnico todavia no tiene bodega personal. Se le abre al entregarle la primera pieza.
            </Vacio>
          ) : null}
          {enPoder.cargando && bodegaDelTecnico !== null ? <Cargando que="la bodega del tecnico" /> : null}
          {enPoder.datos !== null && bodegaDelTecnico !== null && enPoder.datos.datos.filter((e) => e.cantidad > 0).length === 0
            ? <Vacio>El tecnico no tiene repuestos en su bodega.</Vacio> : null}
          {enPoder.datos !== null && enPoder.datos.datos.some((e) => e.cantidad > 0) ? (
            <table className="d">
              <thead><tr><th>Repuesto</th><th className="numero">Tiene</th><th>Acciones</th></tr></thead>
              <tbody>
                {enPoder.datos.datos.filter((e) => e.cantidad > 0).map((e) => (
                  <tr key={e.idRepuesto}>
                    <td>{e.codigo}<br /><span className="tenue">{e.descripcion}</span></td>
                    <td className="numero">{e.cantidad}</td>
                    <td>
                      {puedeConsumir ? (
                        <button type="button" className="btn chico" disabled={ocupado}
                          onClick={() => { void consumir(e); }}>Registrar uso en esta orden</button>
                      ) : null}
                      {puedeDevolver ? (
                        <button type="button" className="btn chico" disabled={ocupado}
                          onClick={() => { void devolver(e); }}>Devolver sin usar</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Tarjeta>
      )}

      <Tarjeta titulo="Movimientos de inventario de esta orden" extra="no se editan ni se borran">
        {movimientos.cargando ? <Cargando que="los movimientos" /> : null}
        {movimientos.error !== null
          ? <Fallo error={movimientos.error} alReintentar={movimientos.recargar} /> : null}
        {movimientos.datos !== null && movimientos.datos.datos.length === 0
          ? <Vacio>Esta orden todavia no tiene movimientos de inventario.</Vacio> : null}
        {movimientos.datos !== null && movimientos.datos.datos.length > 0 ? (
          <table className="d">
            <thead>
              <tr>
                <th>Fecha</th><th>Tipo</th><th>Repuesto</th><th className="numero">Cant.</th>
                <th>Origen → destino</th><th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.datos.datos.map((m) => (
                <tr key={m.id}>
                  <td className="tenue">{fechaHora(m.creadoEn)}</td>
                  <td>{m.tipo.replace(/_/g, ' ')}</td>
                  <td>
                    <Link to={`/inventario/kardex/${m.idRepuesto}`}>{m.codigo}</Link>
                    {' '}<span className="tenue">{m.descripcion}</span>
                  </td>
                  <td className="numero">{m.cantidad}</td>
                  <td className="tenue">{m.bodegaOrigen ?? '—'} → {m.bodegaDestino ?? '—'}</td>
                  <td className="tenue">
                    {m.responsable}
                    {m.registradoSinConexion ? <span className="tag t-a" style={{ marginLeft: 6 }}>sin conexion</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Tarjeta>
    </>
  );
}

/** Buscar un repuesto del catalogo, ver lo disponible y pedirlo para la orden. */
function SolicitarRepuesto(
  { idOrden, alSolicitar }: { idOrden: string; alSolicitar: (texto: string) => void },
): JSX.Element {
  const { api } = useSesion();
  const [texto, setTexto] = useState('');
  const [buscado, setBuscado] = useState('');
  const [elegido, setElegido] = useState<ResumenRepuesto | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [fallo, setFallo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const resultados = useRecurso<PaginaDeDatos<ResumenRepuesto>>(
    () => (buscado.length < 2
      ? Promise.resolve(PAGINA_VACIA)
      : api.pedirPagina<ResumenRepuesto>('/repuestos', { texto: buscado, tamano: 10 })),
    [buscado],
  );
  const disponibilidad = useRecurso<PaginaDeDatos<DisponibilidadRepuesto>>(
    () => (elegido === null
      ? Promise.resolve(PAGINA_VACIA)
      : api.pedirPagina<DisponibilidadRepuesto>('/disponibilidad', { idRepuesto: elegido.id })),
    [elegido?.id],
  );
  const disponible = useMemo(() => disponibilidad.datos?.datos[0] ?? null, [disponibilidad.datos]);

  async function solicitar(): Promise<void> {
    if (elegido === null) return;
    if (!Number.isInteger(cantidad) || cantidad <= 0) { setFallo('La cantidad debe ser un entero mayor que cero.'); return; }
    setFallo(null);
    setEnviando(true);
    try {
      await api.pedir(`/ordenes/${idOrden}/solicitudes-repuesto`, {
        metodo: 'POST', cuerpo: { idRepuesto: elegido.id, cantidad },
      });
      alSolicitar(
        `Se solicito ${cantidad} x ${elegido.codigo}. Bodega la revisa`
        + (disponible !== null && disponible.disponible < cantidad
          ? '; hoy no hay disponibilidad suficiente, asi que quedara pendiente hasta que entre.'
          : '.'),
      );
      setElegido(null);
      setTexto('');
      setBuscado('');
      setCantidad(1);
    } catch (error) {
      setFallo(mensajeDe(error, 'No se pudo registrar la solicitud.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tarjeta titulo="Solicitar un repuesto para esta orden">
      <div className="g g3">
        <div>
          <label htmlFor="buscar-repuesto">Buscar en el catalogo (codigo o nombre)</label>
          <input
            id="buscar-repuesto" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setBuscado(texto.trim()); }}
            placeholder="Escriba y presione Enter"
          />
        </div>
        <div>
          <label htmlFor="cantidad-repuesto">Cantidad</label>
          <input
            id="cantidad-repuesto" type="number" min={1} value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
          />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <button type="button" className="btn pri" disabled={elegido === null || enviando}
            onClick={() => { void solicitar(); }}>
            {enviando ? 'Enviando…' : 'Solicitar a bodega'}
          </button>
        </div>
      </div>

      {elegido !== null ? (
        <p style={{ fontSize: 12.5, margin: '8px 0 0' }}>
          <b>{elegido.codigo}</b> · {elegido.descripcion}
          {disponible === null ? null : (
            <> — disponible <b>{disponible.disponible}</b> · reservado {disponible.reservado}
              {' '}· pedido sin revisar {disponible.comprometido}</>
          )}
          {' '}<a style={{ cursor: 'pointer' }} onClick={() => setElegido(null)}>cambiar</a>
        </p>
      ) : null}

      {elegido === null && resultados.datos !== null && resultados.datos.datos.length > 0 ? (
        <table className="d" style={{ marginTop: 8 }}>
          <tbody>
            {resultados.datos.datos.map((r) => (
              <tr key={r.id}>
                <td>{r.codigo}</td><td>{r.descripcion}</td>
                <td><button type="button" className="btn chico" onClick={() => setElegido(r)}>Elegir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {elegido === null && buscado.length >= 2 && resultados.datos !== null && resultados.datos.datos.length === 0
        ? <Vacio>No hay repuestos que coincidan con «{buscado}».</Vacio> : null}
      {fallo === null ? null : <Aviso tono="warn">{fallo}</Aviso>}
    </Tarjeta>
  );
}
