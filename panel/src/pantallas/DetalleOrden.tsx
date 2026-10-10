/**
 * W-05 · Detalle de la orden, con las pestanas del prototipo.
 *
 * Lo que el prototipo demuestra aqui es que **el plazo comprometido esta
 * visible en todo momento** (RN-16): va en la cabecera, junto al
 * responsable y al tecnico asignado, no escondido en una pestana.
 *
 * El historial es la respuesta a «¿que paso con esta orden?»: reune en orden
 * cronologico los cambios de estado, asignaciones, diagnosticos, evidencias,
 * solicitudes de repuesto, movimientos de inventario, la revision, la
 * entrega y las correcciones, cada uno con quien lo hizo.
 *
 * Las pestanas cargan bajo demanda. Una orden con doscientos eventos de
 * bitacora y treinta evidencias no puede hacer esperar a quien solo queria
 * ver en que estado esta.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ESTADO_ORDEN,
  type CatalogosDeApoyo, type EstadoOrden, type EventoDeHistorial, type FichaOrden,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import {
  Aviso, Cargando, Cifra, EtiquetaEstado, Fallo, Garantia, Tarjeta, Vacio,
  fechaHora, plazoEnPalabras,
} from '../componentes/piezas.js';
import { ErrorDeApi } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';
import { EvidenciasDeOrden } from './EvidenciasDeOrden.js';
import { ModalBitacora, avisoDeEntrada } from './BitacoraDeOrden.js';
import { TallerDeOrden } from './TallerDeOrden.js';
import { GarantiaDeOrden } from './GarantiaDeOrden.js';
import { VisitasDeOrden } from './VisitasDeOrden.js';
import { RepuestosDeOrden } from './RepuestosDeOrden.js';

const PESTANAS = ['Resumen', 'Repuestos', 'Evidencia', 'Visitas', 'Historial'] as const;

const TITULO_TIPO: Record<string, string> = {
  estado: 'Estado', asignacion: 'Asignacion', cambio: 'Cambio', diagnostico: 'Diagnostico',
  evidencia: 'Evidencia', solicitud: 'Repuesto', movimiento: 'Inventario', visita: 'Visita',
  autorizacion: 'Cliente', validacion: 'Revision', entrega: 'Entrega', correccion: 'Correccion',
  bitacora: 'BITÁCORA',
};
type Pestana = (typeof PESTANAS)[number];

export function DetalleOrden(): JSX.Element {
  const { id = '' } = useParams();
  const { api, usuario } = useSesion();
  const [pestana, setPestana] = useState<Pestana>('Resumen');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState(false);

  const ficha = useRecurso<FichaOrden>(() => api.pedir<FichaOrden>(`/ordenes/${id}`), [id]);

  const historial = useRecurso<readonly EventoDeHistorial[]>(
    () => (pestana === 'Historial'
      ? api.pedir<readonly EventoDeHistorial[]>(`/ordenes/${id}/historial`)
      : Promise.resolve([])),
    [id, pestana],
  );

  const puedeAsignar = tienePermiso(usuario, 'ordenes.asignar');
  const catalogos = useRecurso<CatalogosDeApoyo | null>(
    () => (puedeAsignar ? api.pedir<CatalogosDeApoyo>('/catalogos') : Promise.resolve(null)),
    [puedeAsignar],
  );
  const [idTecnicoNuevo, setIdTecnicoNuevo] = useState('');
  const [motivoAsignacion, setMotivoAsignacion] = useState('');
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  const [avisoAsignacion, setAvisoAsignacion] = useState<string | null>(null);
  const [escribiendo, setEscribiendo] = useState(false);
  const [avisoBitacora, setAvisoBitacora] = useState<string | null>(null);

  /*
   * El selector muestra el tecnico GUARDADO. Antes, despues de asignar se
   * dejaba en «Elija…» y la opcion del tecnico asignado aparecia
   * deshabilitada: la pantalla no decia a quien tenia la orden. Se vuelve
   * a sincronizar cada vez que llega la ficha del servidor.
   */
  const idTecnicoGuardado = ficha.datos?.idTecnico ?? null;
  useEffect(() => { setIdTecnicoNuevo(idTecnicoGuardado ?? ''); }, [idTecnicoGuardado]);



  if (ficha.cargando) return <Cargando que="la orden" />;
  if (ficha.error !== null) return <Fallo error={ficha.error} alReintentar={ficha.recargar} />;
  if (ficha.datos === null) return <Fallo error={null} alReintentar={ficha.recargar} />;

  const orden = ficha.datos;
  // Escriben en la bitacora quienes operan ordenes (misma lista que el servidor).
  const puedeEscribirBitacora = [
    'ordenes.crear', 'ordenes.asignar', 'ordenes.cerrar', 'ordenes.entregar', 'taller.diagnostico.registrar',
    'campo.evidencia.cargar', 'inventario.solicitud.gestionar', 'taller.validacion.registrar',
  ].some((permiso) => tienePermiso(usuario, permiso));
  const plazo = plazoEnPalabras(orden.horasParaVencer, orden.vencida);

  async function asignar(): Promise<void> {
    setErrorAsignacion(null);
    setAvisoAsignacion(null);
    if (idTecnicoNuevo === '') { setErrorAsignacion('Elija el tecnico.'); return; }
    if (idTecnicoNuevo === orden.idTecnico) { setErrorAsignacion('Ese tecnico ya es el asignado.'); return; }
    const reasignando = orden.idTecnico !== null;
    if (reasignando && motivoAsignacion.trim() === '') {
      setErrorAsignacion('Para reasignar escriba el motivo: queda en el historial de la orden.');
      return;
    }
    const nombreNuevo = (catalogos.datos?.tecnicos ?? []).find((t) => t.id === idTecnicoNuevo)?.nombre ?? 'el tecnico elegido';
    if (reasignando && !window.confirm(`¿Reasignar la orden de ${orden.tecnico ?? 'su tecnico'} a ${nombreNuevo}?`)) return;
    setMoviendo(true);
    try {
      // La respuesta es la orden tal como quedo guardada: de ahi sale lo que se muestra.
      const guardada = await api.pedir<{ tecnico: string | null }>(`/ordenes/${orden.id}/tecnico`, {
        metodo: 'PUT',
        cuerpo: {
          idTecnico: idTecnicoNuevo,
          ...(motivoAsignacion.trim() === '' ? {} : { motivo: motivoAsignacion.trim() }),
        },
      });
      setMotivoAsignacion('');
      setAvisoAsignacion(`Asignacion guardada: ${guardada.tecnico ?? nombreNuevo}. El estado no cambia hasta que se mueva la orden.`);
      ficha.recargar();
      historial.recargar();
    } catch (fallo) {
      setErrorAsignacion(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo asignar el tecnico.');
    } finally {
      setMoviendo(false);
    }
  }

  async function mover(hacia: EstadoOrden): Promise<void> {
    // Anular y cerrar sin reparar no tienen vuelta atras: se confirman.
    if ((hacia === ESTADO_ORDEN.ANULADA || hacia === ESTADO_ORDEN.CERRADA_SIN_REPARAR)
      && !window.confirm(`La orden pasara a «${hacia.replace(/_/g, ' ')}» y no se podra reabrir. Continuar?`)) {
      return;
    }
    if (hacia === ESTADO_ORDEN.AUTORIZADA
      && !window.confirm('Autorizar la orden deja constancia, a su nombre, de que la autorizacion comercial esta '
        + 'confirmada. No inicia la visita ni la reparacion. ¿Continuar?')) {
      return;
    }
    setMoviendo(true);
    setError(null);
    try {
      await api.pedir(`/ordenes/${orden.id}/estado`, {
        metodo: 'POST',
        cuerpo: {
          hacia,
          // Anular exige motivo escrito; el servidor lo rechaza si falta.
          ...(motivo.trim() === '' ? {} : { motivo: motivo.trim() }),
        },
      });
      setMotivo('');
      ficha.recargar();
      historial.recargar();
    } catch (fallo) {
      // El servidor explica por qué no se puede; se muestra tal cual.
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo mover la orden.');
    } finally {
      setMoviendo(false);
    }
  }

  return (
    <>
      <h2 className="scr">Orden {orden.codigo}</h2>
      <p className="sub">
        {orden.cliente} · {orden.articulo} · <Garantia tipo={orden.tipoGarantia} /> ·{' '}
        {orden.modalidad === 'ruta' ? `ruta · ${orden.zona ?? 'sin zona'}` : 'taller'}
        {orden.tienda === null ? '' : ` · entro por ${orden.tienda}`}
      </p>

      {/*
        La entrega y la revision tecnica cuelgan de la orden, no del menu:
        son el ultimo tramo de ESTA orden. Se ofrecen segun el permiso de
        quien mira, que es lo unico que decide si el enlace le sirve.
      */}
      <div className="tools" style={{ marginBottom: 12 }}>
        {tienePermiso(usuario, 'taller.validacion.registrar') ? (
          <Link className="btn" to={`/validaciones/${orden.id}`}>Revisar el trabajo</Link>
        ) : null}
        {tienePermiso(usuario, 'ordenes.entregar') ? (
          <Link className="btn" to={`/ordenes/${orden.id}/entrega`}>Entregar el articulo</Link>
        ) : null}
      </div>

      {/* La cabecera: estado, responsable, plazo y tecnico. */}
      <div className="g g4" style={{ marginBottom: 12 }}>
        <Cifra valor={<EtiquetaEstado estado={orden.estado} />} etiqueta="Estado actual" pequena />
        <Cifra valor={orden.responsableActual ?? 'sin responsable'} etiqueta="Responsable actual" pequena />
        <Cifra
          valor={plazo.texto}
          etiqueta="Plazo comprometido"
          color={plazo.color}
          pequena
        />
        <Cifra valor={orden.tecnico ?? 'sin asignar'} etiqueta="Tecnico asignado" pequena />
        <Cifra
          valor={orden.modalidad === 'ruta' ? 'Visita a domicilio (ruta)' : 'El cliente lo lleva al taller'}
          etiqueta="Modalidad de servicio" pequena
        />
        <Cifra valor={<Garantia tipo={orden.tipoGarantia} />} etiqueta="Garantia (quien paga)" pequena />
      </div>

      <div className="tabs">
        {PESTANAS.map((nombre) => (
          <span
            key={nombre}
            className={pestana === nombre ? 'on' : ''}
            onClick={() => setPestana(nombre)}
          >
            {nombre}
          </span>
        ))}
      </div>

      {pestana === 'Resumen' ? (
        <>
          <Tarjeta titulo="Falla reportada por el cliente">
            <p style={{ fontSize: 12.5, margin: 0 }}>{orden.fallaReportada}</p>
          </Tarjeta>

          <Tarjeta titulo="Datos congelados al crearse la orden" extra="RN-22 · no cambian nunca">
            <div className="g g3">
              <div><label>Telefono de contacto</label><input value={orden.telefonoContacto} readOnly /></div>
              <div>
                <label>Direccion del servicio</label>
                <input value={orden.direccionServicio ?? 'orden de taller'} readOnly />
              </div>
              <div><label>Tienda de procedencia</label><input value={orden.tienda ?? 'sin tienda registrada'} readOnly /></div>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '10px 0 0' }}>
              Cambiar la direccion en la ficha del cliente no altera esta orden: describe como
              eran las cosas cuando se programo el servicio.
            </p>
          </Tarjeta>

          {puedeAsignar && orden.destinosPosibles.length > 0 ? (
            <Tarjeta titulo={orden.idTecnico === null ? 'Asignar tecnico' : 'Reasignar tecnico'}>
              <div className="g g3">
                <div>
                  <label htmlFor="tecnico-nuevo">Tecnico</label>
                  <select id="tecnico-nuevo" value={idTecnicoNuevo} onChange={(e) => { setIdTecnicoNuevo(e.target.value); setAvisoAsignacion(null); }}>
                    {orden.idTecnico === null ? <option value="">Elija…</option> : null}
                    {/* El asignado aparece aunque ya no este activo: es la asignacion real. */}
                    {orden.idTecnico !== null
                      && !(catalogos.datos?.tecnicos ?? []).some((t) => t.id === orden.idTecnico) ? (
                        <option value={orden.idTecnico}>{orden.tecnico ?? 'tecnico asignado'} · (inactivo)</option>
                      ) : null}
                    {(catalogos.datos?.tecnicos ?? []).map((tecnico) => (
                      <option key={tecnico.id} value={tecnico.id}>
                        {tecnico.nombre} · {tecnico.tipo} · {tecnico.cargaActual} abiertas
                        {tecnico.disponible ? '' : ' · no disponible'}
                        {tecnico.id === orden.idTecnico ? ' · ASIGNADO' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="motivo-asignacion">
                    Motivo {orden.idTecnico === null ? '(opcional)' : '(obligatorio al reasignar)'}
                  </label>
                  <input id="motivo-asignacion" value={motivoAsignacion}
                    onChange={(e) => setMotivoAsignacion(e.target.value)} />
                </div>
                <div style={{ alignSelf: 'end' }}>
                  <button
                    type="button" className="btn pri"
                    disabled={moviendo || idTecnicoNuevo === '' || idTecnicoNuevo === orden.idTecnico}
                    onClick={() => { void asignar(); }}
                  >
                    {orden.idTecnico === null ? 'Asignar' : 'Reasignar'}
                  </button>
                </div>
              </div>
              {avisoAsignacion === null ? null : <Aviso tono="ok">{avisoAsignacion}</Aviso>}
              {errorAsignacion === null ? null : <Aviso tono="warn">{errorAsignacion}</Aviso>}
            </Tarjeta>
          ) : null}

          <GarantiaDeOrden orden={orden} alCambiar={() => { ficha.recargar(); historial.recargar(); }} />

          <TallerDeOrden orden={orden} alCambiar={() => { ficha.recargar(); historial.recargar(); }} />

          <Tarjeta titulo="Mover la orden">
            {orden.destinosPosibles.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--soft)', margin: 0 }}>
                Esta orden esta en un estado final y no se modifica. Si hay algo que corregir,
                se le adjunta una nota de correccion.
              </p>
            ) : (
              <>
                <label>Motivo u observacion · obligatorio para anular</label>
                <textarea
                  rows={2}
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value)}
                  placeholder="Por que se mueve la orden"
                />
                {/*
                  Las acciones vienen evaluadas por el servidor para ESTE
                  usuario y ESTA orden: las mismas reglas que aplicara al
                  pulsar. Las que no puede dar se explican, no se esconden.
                */}
                <div className="tools">
                  {orden.acciones.filter((accion) => accion.permitida).map((accion) => (
                    <button
                      key={accion.hacia}
                      type="button"
                      className={accion.hacia === ESTADO_ORDEN.ANULADA ? 'btn peligro'
                        : accion.hacia === ESTADO_ORDEN.AUTORIZADA ? 'btn teal' : 'btn pri'}
                      disabled={moviendo || (accion.pideMotivo && motivo.trim().length < 10)}
                      title={accion.pideMotivo ? 'Escriba el motivo (al menos 10 caracteres)' : undefined}
                      onClick={() => void mover(accion.hacia)}
                    >
                      {accion.hacia === ESTADO_ORDEN.AUTORIZADA ? 'Autorizar orden' : accion.hacia.replace(/_/g, ' ')}
                    </button>
                  ))}
                  {orden.acciones.every((accion) => !accion.permitida) ? (
                    <span className="tenue" style={{ fontSize: 12.5 }}>Ahora mismo usted no puede mover esta orden.</span>
                  ) : null}
                </div>
                {orden.acciones.some((accion) => !accion.permitida) ? (
                  <details style={{ marginTop: 8 }}>
                    <summary className="tenue" style={{ cursor: 'pointer', fontSize: 12.5 }}>
                      Pasos que no estan disponibles y por que
                    </summary>
                    <ul style={{ fontSize: 12.5, margin: '6px 0 0 18px', padding: 0 }}>
                      {orden.acciones.filter((accion) => !accion.permitida).map((accion) => (
                        <li key={accion.hacia}>
                          <b>{accion.hacia === ESTADO_ORDEN.AUTORIZADA ? 'Autorizar orden' : accion.hacia.replace(/_/g, ' ')}:</b>{' '}
                          {accion.motivo}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            )}
            {error === null ? null : <Aviso>{error}</Aviso>}
          </Tarjeta>

          {orden.notas.length === 0 ? null : (
            <Tarjeta titulo="Notas de correccion">
              {orden.notas.map((nota) => (
                <div key={nota.id} className="rowcard">
                  <div className="r2">{nota.motivo}</div>
                  <div className="r3">{nota.detalle}</div>
                  <div className="r3">{nota.autor} · {fechaHora(nota.creadoEn)}</div>
                </div>
              ))}
            </Tarjeta>
          )}
        </>
      ) : null}

      {pestana === 'Evidencia' ? (
        <EvidenciasDeOrden idOrden={orden.id} cerrada={orden.destinosPosibles.length === 0} />
      ) : null}

      {pestana === 'Repuestos' ? <RepuestosDeOrden orden={orden} /> : null}

      {pestana === 'Visitas' ? (
        <VisitasDeOrden orden={orden} alCambiar={() => { ficha.recargar(); historial.recargar(); }} />
      ) : null}

      {pestana === 'Historial' ? (
        <Tarjeta
          titulo="Historial completo de la orden"
          extra={puedeEscribirBitacora ? (
            <button type="button" className="btn chico" onClick={() => { setAvisoBitacora(null); setEscribiendo(true); }}>
              Registrar bitacora
            </button>
          ) : 'no se edita ni se borra'}
        >
          {avisoBitacora === null ? null : <Aviso tono="ok">{avisoBitacora}</Aviso>}
          {escribiendo ? (
            <ModalBitacora
              orden={orden}
              alCerrar={() => setEscribiendo(false)}
              alGuardar={(entrada) => {
                setEscribiendo(false);
                setAvisoBitacora(avisoDeEntrada(entrada));
                historial.recargar();
              }}
            />
          ) : null}
          {historial.cargando ? <Cargando que="el historial" /> : null}
          {historial.error !== null ? <Fallo error={historial.error} alReintentar={historial.recargar} /> : null}
          {historial.datos !== null && !historial.cargando && historial.datos.length === 0
            ? <Vacio>Esta orden todavia no tiene eventos.</Vacio> : null}
          {historial.datos !== null && historial.datos.length > 0 ? (
            <table className="d historial">
              <thead>
                <tr><th>Momento</th><th>Tipo</th><th>Que paso</th><th>Quien</th></tr>
              </thead>
              <tbody>
                {historial.datos.map((evento) => (
                  <tr key={`${evento.tipo}-${evento.id}`}>
                    <td className="tenue" style={{ whiteSpace: 'nowrap' }}>{fechaHora(evento.momento)}</td>
                    <td className="tipo">{TITULO_TIPO[evento.tipo] ?? evento.tipo}</td>
                    <td style={evento.tipo === 'bitacora' ? { whiteSpace: 'pre-wrap' } : undefined}>
                      {evento.titulo}
                      {evento.registradoSinConexion ? (
                        <span className="tag t-a" style={{ marginLeft: 6 }}>sin conexion</span>
                      ) : null}
                      {evento.detalle === null || evento.detalle === ''
                        ? null : <><br /><span className="tenue">{evento.detalle}</span></>}
                    </td>
                    <td className="tenue">{evento.responsable ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Tarjeta>
      ) : null}

      <div className="tools">
        <Link className="btn" to={`/clientes/${orden.idCliente}`}>Ficha del cliente</Link>
        <Link className="btn" to={`/articulos/${orden.idArticulo}`}>Ficha del articulo</Link>
        <Link className="btn" to="/ordenes">Volver</Link>
      </div>
    </>
  );
}
