/**
 * P-01 · Portal publico de consulta.
 *
 * SIN CUENTA. Pedirle una a quien solo quiere saber si su refrigeradora
 * esta lista es la forma mas segura de que llame por telefono, que es justo
 * el trabajo que el portal viene a quitarle al centro.
 *
 * Todo lo que se muestra viene del servidor YA FILTRADO: iniciales en vez
 * de nombre, etapas en vez de estados internos, y ni una palabra del
 * diagnostico ni del monto. Esta pantalla no decide que ocultar —eso seria
 * confiar el secreto al navegador—, solo lo presenta.
 */
import { useState } from 'react';
import type { EstadoPublicoOrden } from '@servitotal/compartido';
import { ErrorDeApi, RAIZ_API } from '../api/cliente.js';

function fecha(iso: string | null): string {
  return iso === null ? '—' : new Date(iso).toLocaleDateString('es-NI', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function ConsultaPublica(): JSX.Element {
  const [numero, setNumero] = useState('');
  const [telefono, setTelefono] = useState('');
  const [estado, setEstado] = useState<EstadoPublicoOrden | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(false);

  async function consultar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    setConsultando(true);
    setError(null);
    setEstado(null);
    try {
      const respuesta = await fetch(
        `${RAIZ_API}/portal/ordenes/${encodeURIComponent(numero.trim())}`
        + `?telefono=${encodeURIComponent(telefono.trim())}`,
      );
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        throw new ErrorDeApi(
          cuerpo.error?.codigo ?? 'ERROR',
          cuerpo.error?.mensaje ?? 'No se pudo consultar la orden.',
          respuesta.status,
        );
      }
      setEstado(cuerpo.datos as EstadoPublicoOrden);
    } catch (problema) {
      setError(problema instanceof ErrorDeApi
        ? problema.message
        : 'No se pudo contactar al servidor. Intente de nuevo en unos minutos.');
    } finally {
      setConsultando(false);
    }
  }

  return (
    <div className="portal">
      <div className="portalbox">
        <div style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 800, fontSize: 23, marginBottom: 4 }}>
          Servi<span style={{ color: 'var(--amber)' }}>Total</span>
        </div>
        <p style={{ color: '#9DB0C0', fontSize: 12.5, marginBottom: 20 }}>
          Consulte el estado de su orden con el numero que aparece en su comprobante de
          recepcion.
        </p>

        <form
          onSubmit={consultar}
          style={{ background: '#1D2C3A', border: '1px solid #2E4152', borderRadius: 5, padding: 18 }}
        >
          <div className="g g2">
            <div>
              <label htmlFor="numero">Numero de orden</label>
              <input
                id="numero"
                inputMode="numeric"
                value={numero}
                onChange={(evento) => setNumero(evento.target.value)}
                placeholder="10482"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="telefono">Telefono registrado</label>
              <input
                id="telefono"
                inputMode="tel"
                value={telefono}
                onChange={(evento) => setTelefono(evento.target.value)}
                placeholder="8845-2210"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn amber"
            style={{ width: '100%', justifyContent: 'center', marginTop: 13 }}
            disabled={consultando || numero.trim() === '' || telefono.trim() === ''}
          >
            {consultando ? 'Consultando…' : 'Consultar'}
          </button>

          <p style={{ fontSize: 10.5, color: '#7D8FA0', margin: '10px 0 0' }}>
            Pedimos los dos datos para que nadie mas pueda ver el estado de su equipo. Puede
            usar su telefono actual o el que dio cuando solicito el servicio.
          </p>
        </form>

        {error === null ? null : (
          <div
            className="pres"
            style={{ borderLeft: '3px solid var(--red)' }}
          >
            {error}
          </div>
        )}

        {estado === null ? null : (
          <div className="pres">
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', gap: 9, flexWrap: 'wrap',
            }}
            >
              <div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11.5, color: 'var(--soft)' }}>
                  Orden {estado.numeroOrden} · {estado.cliente}
                </div>
                <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 17, fontWeight: 700 }}>
                  {estado.articulo}
                </div>
              </div>
              <span className={estado.cerrada ? 'tag t-g' : 'tag t-a'}>{estado.situacion}</span>
            </div>

            <p style={{ fontSize: 12.5, margin: '10px 0 0' }}>{estado.explicacion}</p>

            {/* La línea de tiempo del prototipo: cinco etapas en lenguaje de
                cliente, no los trece estados internos del taller. */}
            <ul className="tl">
              {estado.recorrido.map((paso) => (
                <li
                  key={paso.etapa}
                  className={`${paso.alcanzado ? 'done' : ''} ${paso.actual ? 'now' : ''}`.trim()}
                >
                  {paso.descripcion}
                  <small>
                    {paso.alcanzado ? fecha(paso.momento) : 'Pendiente'}
                    {paso.actual && estado.repuestoEsperadoPara !== null
                      ? ` · repuesto estimado para el ${fecha(estado.repuestoEsperadoPara)}`
                      : ''}
                  </small>
                </li>
              ))}
            </ul>

            <div style={{
              borderTop: '1px solid var(--line)', marginTop: 13,
              paddingTop: 11, fontSize: 12, color: 'var(--soft)',
            }}
            >
              Recibido el {fecha(estado.recibidoEn)}.{' '}
              {estado.entregadoEn !== null
                ? <>Entregado el <b style={{ color: 'var(--ink)' }}>{fecha(estado.entregadoEn)}</b>.</>
                : estado.entregaEstimada !== null
                  ? <>Entrega estimada: <b style={{ color: 'var(--ink)' }}>{fecha(estado.entregaEstimada)}</b>.</>
                  : null}
              <br />
              ¿Tiene dudas sobre el diagnostico o el costo? Llame al centro: esa informacion se
              conversa con usted identificado, no por esta pagina.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
