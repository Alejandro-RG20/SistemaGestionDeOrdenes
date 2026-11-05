/**
 * M-06 · Cotizacion en el domicilio (RF-27), sin conexion.
 *
 * Mano de obra, repuestos de la bodega movil al precio del catalogo
 * descargado y el cargo de visita de la zona, congelado en la orden. El
 * total se calcula con la MISMA funcion que usa el servidor
 * (`calcularCotizacion`), asi que lo que el cliente ve aqui es lo que se
 * registra. Se guarda en el dispositivo y viaja por la cola.
 *
 * Despues de cotizar, el cliente firma la autorizacion en la pantalla
 * (Evidencia · «Autorizacion firmada del cliente»). La aceptacion se anota
 * en el panel, que es quien tiene el permiso de registrarla.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NOMBRE_RESPONSABLE_PAGO, TIPO_GARANTIA, calcularCotizacion, type DetalleCotizacion } from '@servitotal/compartido';
import { useCampo } from '../../campo/contexto.js';
import { Aviso, Garantia, cordobas } from '../../componentes/piezas.js';
import { BarraDeSincronizacion, Pasos } from '../../componentes/ArmazonCampo.js';
import { useDelCampo } from './datos.js';

export function Cotizacion(): JSX.Element {
  const { id = '' } = useParams();
  const { campo, refrescar } = useCampo();
  const { datos, cargando } = useDelCampo(async (coordinador) => {
    const orden = await coordinador.orden(id);
    if (orden === null) return null;
    return { orden, repuestos: await coordinador.repuestos() };
  }, [id]);

  const [manoObra, setManoObra] = useState('');
  const [cantidades, setCantidades] = useState<Readonly<Record<string, number>>>({});
  const [guardando, setGuardando] = useState(false);
  const [guardada, setGuardada] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const elegidos = useMemo(() => (datos?.repuestos ?? [])
    .filter((r) => (cantidades[r.id] ?? 0) > 0)
    .map((r) => ({ repuesto: r, cantidad: cantidades[r.id]! })), [datos, cantidades]);

  if (cargando) return <p className="sub">Leyendo la orden guardada…</p>;
  if (datos === null) return <Aviso tono="warn">Esta orden no esta en la ruta que bajo.</Aviso>;
  const { orden } = datos;
  const visita = orden.cargoVisita ?? 0;
  const conExistencia = datos.repuestos.filter((r) => r.cantidad > 0);

  let detalle: DetalleCotizacion | null = null;
  let error: string | null = null;
  try {
    detalle = calcularCotizacion({
      tipoGarantia: orden.tipoGarantia,
      manoObra: manoObra === '' ? 0 : Number(manoObra.replace(',', '.')),
      visita,
      lineas: elegidos.map(({ repuesto, cantidad }) => ({
        idRepuesto: repuesto.id, codigo: repuesto.codigo, descripcion: repuesto.descripcion, cantidad,
        precioInventario: repuesto.precio > 0 ? repuesto.precio : null,
        precioUnitario: repuesto.precio > 0 ? repuesto.precio : null,
        motivoPrecio: null,
      })),
    });
  } catch (problema) {
    error = problema instanceof Error ? problema.message : 'Importes no validos.';
  }

  const guardar = async (): Promise<void> => {
    if (campo === null || detalle === null) return;
    setGuardando(true);
    setFallo(null);
    try {
      await campo.coordinador.registrarCotizacion(orden.id, detalle.manoObra.original, elegidos.map(({ repuesto, cantidad }) => ({
        idRepuesto: repuesto.id, cantidad, precioUnitario: repuesto.precio,
      })));
      await refrescar();
      setGuardada(true);
    } catch (problema) {
      setFallo(problema instanceof Error ? problema.message : 'No se pudo guardar la cotizacion.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <BarraDeSincronizacion />
      <Pasos de={5} />
      <h2 className="scr">Cotizacion</h2>
      <p className="sub">N.º {orden.numero} · {orden.articulo} · <Garantia tipo={orden.tipoGarantia} /></p>

      {orden.tipoGarantia === TIPO_GARANTIA.POR_VALIDAR ? (
        <Aviso tono="warn">La garantia de esta orden esta por validar: la oficina debe confirmarla antes de cotizar.</Aviso>
      ) : orden.tipoGarantia !== TIPO_GARANTIA.PARTICULAR ? (
        <Aviso tono="info">
          Esta orden la cubre una garantia ({NOMBRE_RESPONSABLE_PAGO[detalle?.responsablePago ?? 'proveedor']}): el cliente no paga
          lo cubierto. Puede registrar la cotizacion para el expediente; no hace falta su firma.
        </Aviso>
      ) : null}

      <div className="card">
        <h3>Conceptos</h3>
        <label htmlFor="mano-obra">Mano de obra (C$)</label>
        <input id="mano-obra" inputMode="decimal" value={manoObra} onChange={(e) => setManoObra(e.target.value)} />
        <p style={{ fontSize: 12, margin: '6px 0' }}>
          Visita tecnica (cargo de la zona): <b>{cordobas(visita)}</b>
        </p>
        <b style={{ fontSize: 12.5 }}>Repuestos de mi bodega movil</b>
        {conExistencia.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--soft)', margin: '4px 0 0' }}>Su bodega movil esta vacia segun la ultima descarga.</p>
        ) : conExistencia.map((r) => (
          <div key={r.id} className="meas" style={{ minHeight: 46 }}>
            <span>{r.descripcion}<br /><small style={{ color: 'var(--soft)' }}>{r.codigo} · {r.precio > 0 ? cordobas(r.precio) : 'sin precio'}</small></span>
            <input
              aria-label={`Cantidad de ${r.descripcion}`} type="number" inputMode="numeric" min={0} max={r.cantidad}
              style={{ width: 70 }} value={cantidades[r.id] ?? 0}
              onChange={(e) => setCantidades({ ...cantidades, [r.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          </div>
        ))}
        <p style={{ fontSize: 11, color: 'var(--soft)', margin: '6px 0 0' }}>
          Si la orden tiene repuestos pedidos a bodega, el servidor los suma con su precio de inventario.
        </p>
      </div>

      {error !== null ? <Aviso tono="warn">{error}</Aviso> : null}
      {detalle === null ? null : (
        <div className="card">
          <h3>Total</h3>
          {detalle.preciosPendientes.length > 0 ? (
            <Aviso tono="warn">Sin precio en el catalogo: {detalle.preciosPendientes.join(', ')}. No se puede cotizar asi.</Aviso>
          ) : null}
          <div className="meas"><span>Mano de obra</span><b>{cordobas(detalle.manoObra.final)}</b></div>
          <div className="meas"><span>Visita tecnica</span><b>{cordobas(detalle.visita.final)}</b></div>
          <div className="meas"><span>Repuestos</span><b>{cordobas(detalle.repuestos.final)}</b></div>
          <div className="meas"><span><b>Total</b></span><b>{cordobas(detalle.totalFinal)}</b></div>
          <div className="meas"><span>Paga el cliente</span><b>{cordobas(detalle.pagaCliente)}</b></div>
        </div>
      )}

      {fallo === null ? null : <Aviso tono="warn">{fallo}</Aviso>}
      {guardada ? (
        <Aviso tono="ok">
          <b>Cotizacion guardada en este dispositivo.</b> Se envia sola cuando haya señal.{' '}
          {orden.tipoGarantia === TIPO_GARANTIA.PARTICULAR
            ? <>Ahora pida al cliente que firme la autorizacion en <Link to={`/campo/ordenes/${orden.id}/evidencia`}>Evidencia</Link>.</>
            : null}
        </Aviso>
      ) : null}

      <div className="stickybar">
        <button
          type="button" className="btn teal"
          disabled={guardando || guardada || detalle === null || detalle.preciosPendientes.length > 0
            || orden.tipoGarantia === TIPO_GARANTIA.POR_VALIDAR}
          onClick={() => { void guardar(); }}
        >
          {guardando ? 'Guardando…' : guardada ? 'Guardada' : 'Guardar la cotizacion'}
        </button>
      </div>
    </>
  );
}
