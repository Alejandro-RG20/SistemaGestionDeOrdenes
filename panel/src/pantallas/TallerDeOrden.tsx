/**
 * Diagnostico y cotizacion: la MISMA seccion para todas las ordenes, sean de
 * garantia del proveedor, garantia adicional o particulares.
 *
 * Muestra el diagnostico (falla, componente, tecnico, fecha), los repuestos
 * de la orden con su estado y su precio de inventario, la cotizacion
 * vigente con cada concepto, sus ajustes y quien lo paga, las versiones
 * anteriores y la decision del cliente. Lo que el usuario puede hacer lo
 * decide el servidor (`puede`), que lo vuelve a comprobar todo al guardar.
 * Registrar algo aqui NO mueve la orden: los pasos de estado se dan en
 * «Mover la orden».
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  NOMBRE_RESPONSABLE_PAGO, calcularCotizacion,
  type AjusteConcepto, type CotizacionDeOrden, type DatosDeTaller, type DetalleCotizacion, type FichaOrden,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio, cordobas, fechaHora } from '../componentes/piezas.js';
import { ErrorDeApi } from '../api/cliente.js';

const FORMAS = [
  { valor: 'llamada', nombre: 'Por llamada' },
  { valor: 'mensaje', nombre: 'Por mensaje' },
  { valor: 'correo', nombre: 'Por correo' },
  { valor: 'firma_presencial', nombre: 'Firma presencial' },
] as const;

const ESTADO_COTIZACION: Readonly<Record<CotizacionDeOrden['estado'], { texto: string; clase: string }>> = {
  pendiente: { texto: 'esperando al cliente', clase: 'tag t-a' },
  aceptada: { texto: 'aceptada', clase: 'tag t-t' },
  rechazada: { texto: 'rechazada', clase: 'tag t-r' },
  reemplazada: { texto: 'reemplazada', clase: 'tag t-g' },
  no_requiere: { texto: 'cubierta: no requiere aceptacion', clase: 'tag t-b' },
};

const ESTADO_SOLICITUD: Readonly<Record<string, string>> = {
  solicitada: 'solicitado', en_revision: 'en revision', aprobada: 'reservado', preparada: 'preparado',
  entregada: 'entregado', recibida: 'recibido', rechazada: 'rechazado', anulada: 'anulado',
};

type AjusteEnFormulario = { tipo: AjusteConcepto['tipo']; valor: string };
const SIN_AJUSTE: AjusteEnFormulario = { tipo: 'ninguno', valor: '' };

const numero = (valor: string): number => Number(valor.replace(',', '.'));

function aAjuste(ajuste: AjusteEnFormulario): AjusteConcepto {
  if (ajuste.tipo === 'porcentaje' || ajuste.tipo === 'importe') return { tipo: ajuste.tipo, valor: numero(ajuste.valor) };
  return { tipo: ajuste.tipo };
}

function textoAjuste(ajuste: AjusteConcepto): string {
  switch (ajuste.tipo) {
    case 'porcentaje': return `descuento ${ajuste.valor} %`;
    case 'importe': return `descuento ${cordobas(ajuste.valor)}`;
    case 'exoneracion_total': return 'exonerado';
    default: return '—';
  }
}

/** Conceptos de una cotizacion: original, ajuste, final y quien lo paga. */
function VistaDetalle({ detalle }: { detalle: DetalleCotizacion }): JSX.Element {
  const paga = NOMBRE_RESPONSABLE_PAGO[detalle.responsablePago];
  const filas = [
    { nombre: 'Mano de obra', c: detalle.manoObra },
    { nombre: 'Visita tecnica', c: detalle.visita },
    { nombre: 'Repuestos', c: detalle.repuestos },
  ];
  return (
    <>
      <table className="d" style={{ marginTop: 6 }}>
        <thead><tr><th>Concepto</th><th>Original</th><th>Descuento / exoneracion</th><th>Final</th><th>Paga</th></tr></thead>
        <tbody>
          {filas.map(({ nombre, c }) => (
            <tr key={nombre}>
              <td>{nombre}</td><td>{cordobas(c.original)}</td>
              <td>{c.descuento === 0 ? '—' : <>{textoAjuste(c.ajuste)} (−{cordobas(c.descuento)})</>}</td>
              <td>{cordobas(c.final)}</td><td>{paga}</td>
            </tr>
          ))}
          <tr><td><b>Total</b></td><td>{cordobas(detalle.totalOriginal)}</td><td /><td><b>{cordobas(detalle.totalFinal)}</b></td><td>{paga}</td></tr>
        </tbody>
      </table>
      {detalle.repuestos.lineas.length === 0 ? null : (
        <table className="d" style={{ marginTop: 6 }}>
          <thead><tr><th>Codigo</th><th>Repuesto</th><th>Cant.</th><th>Precio inventario</th><th>Precio cotizado</th><th>Subtotal</th></tr></thead>
          <tbody>
            {detalle.repuestos.lineas.map((l) => (
              <tr key={l.idRepuesto}>
                <td>{l.codigo}</td><td>{l.descripcion}</td><td>{l.cantidad}</td>
                <td>{l.precioInventario === null ? <span className="tenue">sin precio</span> : cordobas(l.precioInventario)}</td>
                <td>
                  {l.precioUnitario === null ? <span className="tag t-a">pendiente</span> : cordobas(l.precioUnitario)}
                  {l.motivoPrecio === null ? null : <small className="tenue"> · {l.motivoPrecio}</small>}
                </td>
                <td>{l.subtotal === null ? <span className="tag t-a">pendiente</span> : cordobas(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ margin: '6px 0 0', fontSize: 12.5 }}>
        <b>El cliente paga: {cordobas(detalle.pagaCliente)}</b>
        {detalle.responsablePago === 'cliente' ? null : <span className="tenue"> · lo cubierto lo paga {paga.toLowerCase()}</span>}
      </p>
    </>
  );
}

function EditorAjuste({ etiqueta, valor, alCambiar }: {
  etiqueta: string; valor: AjusteEnFormulario; alCambiar: (nuevo: AjusteEnFormulario) => void;
}): JSX.Element {
  return (
    <div>
      <label>{etiqueta}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={valor.tipo} onChange={(e) => alCambiar({ tipo: e.target.value as AjusteConcepto['tipo'], valor: '' })}>
          <option value="ninguno">Sin ajuste</option>
          <option value="porcentaje">Descuento %</option>
          <option value="importe">Descuento C$</option>
          <option value="exoneracion_total">Exonerar total</option>
        </select>
        {valor.tipo === 'porcentaje' || valor.tipo === 'importe' ? (
          <input inputMode="decimal" style={{ width: 90 }} value={valor.valor} onChange={(e) => alCambiar({ ...valor, valor: e.target.value })} />
        ) : null}
      </div>
    </div>
  );
}

export function TallerDeOrden({ orden, alCambiar }: { orden: FichaOrden; alCambiar: () => void }): JSX.Element {
  const { api } = useSesion();
  const datos = useRecurso<DatosDeTaller>(() => api.pedir<DatosDeTaller>(`/ordenes/${orden.id}/taller`), [orden.id, orden.estado, orden.tipoGarantia]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [diagnostico, setDiagnostico] = useState({ fallaReal: '', componente: '', observaciones: '', noCubierta: false, exclusion: '' });
  const [cotizando, setCotizando] = useState(false);
  const [cotizacion, setCotizacion] = useState({
    manoObra: '', cargoVisita: '', motivo: '',
    ajustes: { manoObra: SIN_AJUSTE, visita: SIN_AJUSTE, repuestos: SIN_AJUSTE },
    precios: {} as Record<string, string>,
  });
  const [decision, setDecision] = useState({ forma: 'llamada', observacion: '' });

  if (datos.cargando) return <Cargando que="diagnostico y cotizacion" />;
  if (datos.error !== null || datos.datos === null) return <Fallo error={datos.error} alReintentar={datos.recargar} />;
  const taller = datos.datos;
  const puede = taller.puede;
  const vigente = taller.cotizaciones[taller.cotizaciones.length - 1] ?? null;
  const anteriores = taller.cotizaciones.slice(0, -1);
  const pedidos = taller.repuestos.filter((r) => r.cantidad > 0);

  async function enviar(ruta: string, cuerpo: unknown, mensaje: string, limpiar: () => void): Promise<void> {
    setGuardando(true); setError(null); setAviso(null);
    try {
      await api.pedir(ruta, { metodo: 'POST', cuerpo });
      limpiar();
      setAviso(mensaje);
      datos.recargar();
      alCambiar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  // Vista previa con la MISMA funcion que usa el servidor para guardar.
  const visitaOriginal = cotizacion.cargoVisita === '' ? taller.cargoVisita : numero(cotizacion.cargoVisita);
  const preciosCambiados = Object.entries(cotizacion.precios)
    .filter(([, valor]) => valor.trim() !== '')
    .map(([idRepuesto, valor]) => ({ idRepuesto, precioUnitario: numero(valor) }));
  let vistaPrevia: DetalleCotizacion | null = null;
  let errorVistaPrevia: string | null = null;
  if (cotizando) {
    try {
      vistaPrevia = calcularCotizacion({
        tipoGarantia: taller.tipoGarantia,
        manoObra: cotizacion.manoObra === '' ? 0 : numero(cotizacion.manoObra),
        visita: visitaOriginal,
        lineas: pedidos.map((r) => {
          const cambiado = preciosCambiados.find((p) => p.idRepuesto === r.idRepuesto);
          return {
            idRepuesto: r.idRepuesto, codigo: r.codigo, descripcion: r.descripcion, cantidad: r.cantidad,
            precioInventario: r.precioInventario,
            precioUnitario: cambiado?.precioUnitario ?? r.precioInventario,
            motivoPrecio: null,
          };
        }),
        ajustes: {
          manoObra: aAjuste(cotizacion.ajustes.manoObra),
          visita: aAjuste(cotizacion.ajustes.visita),
          repuestos: aAjuste(cotizacion.ajustes.repuestos),
        },
      });
    } catch (fallo) {
      errorVistaPrevia = fallo instanceof Error ? fallo.message : 'Importes no validos.';
    }
  }
  const exigeMotivo = vigente !== null || (vistaPrevia !== null && (
    preciosCambiados.length > 0 || visitaOriginal !== taller.cargoVisita
    || Object.values(cotizacion.ajustes).some((a) => a.tipo !== 'ninguno')));

  return (
    <Tarjeta titulo="Diagnostico y cotizacion" extra={<span>paga: <b>{NOMBRE_RESPONSABLE_PAGO[taller.responsablePago]}</b></span>}>
      {taller.antecedentes === null ? null : (
        <Aviso tono="info">
          Continua la orden <Link to={`/ordenes/${taller.antecedentes.idOrden}`}>{taller.antecedentes.codigo}</Link>{' '}
          (garantia {taller.antecedentes.tipoGarantia} no aplicable). Diagnostico de origen:{' '}
          {taller.antecedentes.diagnosticos.map((d) => `${d.fallaReal}${d.componente ? ` (${d.componente})` : ''}`).join('; ') || '—'}.
        </Aviso>
      )}

      {/* ── Diagnostico ── */}
      {taller.diagnosticos.length === 0 ? <Vacio>Todavia no hay diagnostico.</Vacio> : (
        <table className="d">
          <thead><tr><th>Fecha</th><th>Tecnico</th><th>Falla encontrada</th><th>Componente</th></tr></thead>
          <tbody>
            {taller.diagnosticos.map((d) => (
              <tr key={d.id}><td>{fechaHora(d.momento)}</td><td>{d.tecnico}</td><td>{d.fallaReal}</td><td>{d.componente ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      {puede.diagnosticar ? (
        <div style={{ marginTop: 10 }}>
          <div className="g g3">
            <div><label>Falla real encontrada *</label><input value={diagnostico.fallaReal} onChange={(e) => setDiagnostico({ ...diagnostico, fallaReal: e.target.value })} /></div>
            <div><label>Componente</label><input value={diagnostico.componente} onChange={(e) => setDiagnostico({ ...diagnostico, componente: e.target.value })} /></div>
            <div>
              <label>¿Constato una posible exclusion?</label>
              <select value={diagnostico.noCubierta ? '1' : ''} onChange={(e) => setDiagnostico({ ...diagnostico, noCubierta: e.target.value === '1' })}>
                <option value="">No</option>
                <option value="1">Si: golpe, mal uso u otra</option>
              </select>
            </div>
          </div>
          <label>Observaciones</label>
          <textarea rows={2} value={diagnostico.observaciones} onChange={(e) => setDiagnostico({ ...diagnostico, observaciones: e.target.value })}
            placeholder="Lo que encontro, pruebas realizadas, estado del articulo…" />
          {diagnostico.noCubierta ? (
            <>
              <label>Exclusion constatada *</label>
              <input value={diagnostico.exclusion} onChange={(e) => setDiagnostico({ ...diagnostico, exclusion: e.target.value })}
                placeholder="Golpe en la carcasa trasera; tarjeta con humedad…" />
            </>
          ) : null}
          <p className="tenue" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
            El diagnostico no cambia la garantia de la orden. Las observaciones y la exclusion quedan en el historial;
            las fotos se cargan en la pestaña de evidencias. Si la garantia debe cambiar, la reclasifica quien tiene
            permiso, con motivo, desde el bloque «Garantia de la orden».
          </p>
          <button
            type="button" className="btn pri" style={{ marginTop: 8 }}
            disabled={guardando || diagnostico.fallaReal.trim().length < 5 || (diagnostico.noCubierta && diagnostico.exclusion.trim().length < 5)}
            onClick={() => {
              void enviar(`/ordenes/${orden.id}/diagnostico`, {
                fallaReal: diagnostico.fallaReal.trim(),
                componente: diagnostico.componente.trim() === '' ? null : diagnostico.componente.trim(),
                observaciones: diagnostico.observaciones.trim() === '' ? null : diagnostico.observaciones.trim(),
                exclusion: diagnostico.noCubierta ? diagnostico.exclusion.trim() : null,
              }, 'Diagnostico registrado. La garantia de la orden no cambio.',
              () => setDiagnostico({ fallaReal: '', componente: '', observaciones: '', noCubierta: false, exclusion: '' }));
            }}
          >
            Registrar diagnostico
          </button>
        </div>
      ) : null}


      {/* ── Repuestos de la orden: estado y precio de hoy en inventario ── */}
      {taller.repuestos.length === 0 ? null : (
        <table className="d" style={{ marginTop: 10 }}>
          <thead><tr><th>Codigo</th><th>Repuesto</th><th>Cant.</th><th>Estado</th><th>Instalado</th><th>Precio unitario</th><th>Subtotal</th></tr></thead>
          <tbody>
            {taller.repuestos.map((r) => (
              <tr key={r.idRepuesto}>
                <td>{r.codigo}</td><td>{r.descripcion}</td><td>{r.cantidad}</td>
                <td className="tenue">{Object.entries(r.porEstado).map(([e, n]) => `${n} ${ESTADO_SOLICITUD[e] ?? e}`).join(', ') || '—'}</td>
                <td>{r.utilizada}</td>
                <td>{r.precioInventario === null ? <span className="tag t-a">pendiente</span> : cordobas(r.precioInventario)}</td>
                <td>{r.precioInventario === null ? <span className="tag t-a">pendiente</span> : cordobas(r.precioInventario * r.cantidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Cotizacion vigente y versiones anteriores ── */}
      {vigente === null ? (
        <p className="tenue" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Todavia no hay cotizacion registrada.</p>
      ) : (
        <div style={{ marginTop: 10 }}>
          <b>Cotizacion vigente</b> · {fechaHora(vigente.creadoEn)} · {vigente.registradoPor ?? '—'}{' '}
          <span className={ESTADO_COTIZACION[vigente.estado].clase}>{ESTADO_COTIZACION[vigente.estado].texto}</span>
          {vigente.aceptada === null ? null : (
            <small className="tenue"> · {fechaHora(vigente.momentoAceptacion)} · {vigente.observacionDecision ?? vigente.formaAceptacion}</small>
          )}
          {vigente.motivo === null ? null : <div className="tenue" style={{ fontSize: 12 }}>Motivo: {vigente.motivo}</div>}
          {vigente.detalle === null ? (
            <table className="d" style={{ marginTop: 6 }}>
              <thead><tr><th>Mano de obra</th><th>Repuestos</th><th>Visita</th><th>Total</th></tr></thead>
              <tbody><tr><td>{cordobas(vigente.manoObra)}</td><td>{cordobas(vigente.totalRepuestos)}</td><td>{cordobas(vigente.cargoVisita)}</td><td><b>{cordobas(vigente.total)}</b></td></tr></tbody>
            </table>
          ) : <VistaDetalle detalle={vigente.detalle} />}
        </div>
      )}
      {anteriores.length === 0 ? null : (
        <details style={{ marginTop: 8 }}>
          <summary className="tenue">Versiones anteriores ({anteriores.length})</summary>
          <table className="d">
            <thead><tr><th>Fecha</th><th>Registro</th><th>Total</th><th>Estado</th><th>Motivo</th></tr></thead>
            <tbody>
              {anteriores.map((c) => (
                <tr key={c.id}>
                  <td>{fechaHora(c.creadoEn)}</td><td>{c.registradoPor ?? '—'}</td><td>{cordobas(c.total)}</td>
                  <td><span className={ESTADO_COTIZACION[c.estado].clase}>{ESTADO_COTIZACION[c.estado].texto}</span></td>
                  <td className="tenue">{c.motivo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* ── Registrar cotizacion o una version nueva ── */}
      {!puede.cotizar ? null : !cotizando ? (
        <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => setCotizando(true)}>
          {vigente === null ? 'Registrar cotizacion' : 'Registrar una nueva version'}
        </button>
      ) : (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <div className="g g3">
            <div><label>Mano de obra (C$)</label><input inputMode="decimal" value={cotizacion.manoObra} onChange={(e) => setCotizacion({ ...cotizacion, manoObra: e.target.value })} /></div>
            <div>
              <label>Visita tecnica (C$)</label>
              <input inputMode="decimal" placeholder={String(taller.cargoVisita)} disabled={!puede.ajustar}
                value={cotizacion.cargoVisita} onChange={(e) => setCotizacion({ ...cotizacion, cargoVisita: e.target.value })} />
            </div>
          </div>
          {pedidos.length === 0 ? null : (
            <p className="tenue" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Los repuestos y sus precios salen de las solicitudes de la orden y del inventario; no se escriben a mano.
            </p>
          )}
          {!puede.ajustar ? null : (
            <>
              <div className="g g3" style={{ marginTop: 6 }}>
                <EditorAjuste etiqueta="Mano de obra" valor={cotizacion.ajustes.manoObra}
                  alCambiar={(a) => setCotizacion({ ...cotizacion, ajustes: { ...cotizacion.ajustes, manoObra: a } })} />
                <EditorAjuste etiqueta="Visita tecnica" valor={cotizacion.ajustes.visita}
                  alCambiar={(a) => setCotizacion({ ...cotizacion, ajustes: { ...cotizacion.ajustes, visita: a } })} />
                <EditorAjuste etiqueta="Repuestos" valor={cotizacion.ajustes.repuestos}
                  alCambiar={(a) => setCotizacion({ ...cotizacion, ajustes: { ...cotizacion.ajustes, repuestos: a } })} />
              </div>
              {pedidos.map((r) => (
                <div key={r.idRepuesto} className="g g3" style={{ marginTop: 4 }}>
                  <div className="tenue" style={{ alignSelf: 'end', fontSize: 12 }}>
                    {r.codigo} · inventario {r.precioInventario === null ? 'sin precio' : cordobas(r.precioInventario)}
                  </div>
                  <div>
                    <label>Precio cotizado (opcional, con motivo)</label>
                    <input inputMode="decimal" value={cotizacion.precios[r.idRepuesto] ?? ''}
                      onChange={(e) => setCotizacion({ ...cotizacion, precios: { ...cotizacion.precios, [r.idRepuesto]: e.target.value } })} />
                  </div>
                </div>
              ))}
            </>
          )}
          {errorVistaPrevia !== null ? <Aviso tono="warn">{errorVistaPrevia}</Aviso> : null}
          {vistaPrevia === null ? null : (
            <>
              {vistaPrevia.preciosPendientes.length === 0 ? null : (
                <Aviso tono="warn">Sin precio registrado: {vistaPrevia.preciosPendientes.join(', ')}. La cotizacion no se puede registrar asi.</Aviso>
              )}
              <VistaDetalle detalle={vistaPrevia} />
            </>
          )}
          {exigeMotivo ? (
            <>
              <label>Motivo * <small className="tenue">(nueva version, descuento, exoneracion o precio; queda en la bitacora)</small></label>
              <input value={cotizacion.motivo} onChange={(e) => setCotizacion({ ...cotizacion, motivo: e.target.value })} />
            </>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button" className="btn pri"
              disabled={guardando || vistaPrevia === null || vistaPrevia.preciosPendientes.length > 0
                || (exigeMotivo && cotizacion.motivo.trim().length < 10)}
              onClick={() => {
                const ajustes = {
                  manoObra: aAjuste(cotizacion.ajustes.manoObra),
                  visita: aAjuste(cotizacion.ajustes.visita),
                  repuestos: aAjuste(cotizacion.ajustes.repuestos),
                };
                void enviar(`/ordenes/${orden.id}/cotizaciones`, {
                  manoObra: cotizacion.manoObra === '' ? 0 : numero(cotizacion.manoObra),
                  ...(cotizacion.cargoVisita === '' ? {} : { cargoVisita: numero(cotizacion.cargoVisita) }),
                  ...(puede.ajustar ? { ajustes, preciosRepuestos: preciosCambiados } : {}),
                  ...(cotizacion.motivo.trim() === '' ? {} : { motivo: cotizacion.motivo.trim() }),
                }, vigente === null ? 'Cotizacion registrada.' : 'Nueva version registrada; la anterior se conserva.', () => {
                  setCotizando(false);
                  setCotizacion({ manoObra: '', cargoVisita: '', motivo: '', ajustes: { manoObra: SIN_AJUSTE, visita: SIN_AJUSTE, repuestos: SIN_AJUSTE }, precios: {} });
                });
              }}
            >
              Guardar cotizacion
            </button>
            <button type="button" className="btn" onClick={() => setCotizando(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Decision del cliente (solo particulares) ── */}
      {puede.decidir && vigente !== null ? (
        <div style={{ marginTop: 10 }}>
          <label>Decision del cliente sobre la cotizacion de {cordobas(vigente.total)}</label>
          <div className="g g3">
            <div>
              <select value={decision.forma} onChange={(e) => setDecision({ ...decision, forma: e.target.value })}>
                {FORMAS.map((f) => <option key={f.valor} value={f.valor}>{f.nombre}</option>)}
              </select>
            </div>
            <div><input placeholder="Observacion (opcional)" value={decision.observacion} onChange={(e) => setDecision({ ...decision, observacion: e.target.value })} /></div>
            <div className="tools">
              {[true, false].map((aceptada) => (
                <button
                  key={String(aceptada)} type="button" className={aceptada ? 'btn pri' : 'btn peligro'} disabled={guardando}
                  onClick={() => {
                    if (!window.confirm(aceptada ? '¿Registrar que el cliente ACEPTO la cotizacion?' : '¿Registrar que el cliente NO acepto la cotizacion?')) return;
                    void enviar(`/ordenes/${orden.id}/cotizaciones/decision`, {
                      aceptada, forma: decision.forma,
                      observacion: decision.observacion.trim() === '' ? null : decision.observacion.trim(),
                    }, aceptada ? 'Aceptacion del cliente registrada. Falta autorizar la orden.' : 'Rechazo del cliente registrado: puede cerrar la orden sin reparar.',
                    () => setDecision({ forma: 'llamada', observacion: '' }));
                  }}
                >
                  {aceptada ? 'El cliente acepto' : 'El cliente no acepto'}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {aviso === null ? null : <Aviso tono="ok">{aviso}</Aviso>}
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
    </Tarjeta>
  );
}
