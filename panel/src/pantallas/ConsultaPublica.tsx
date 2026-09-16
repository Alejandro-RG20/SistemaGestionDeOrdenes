/**
 * Portal publico: el cliente consulta como va su articulo.
 *
 * SIN CUENTA. Pedirle una a quien solo quiere saber si su refrigeradora esta
 * lista es la forma mas segura de que llame por telefono, que es justo el
 * trabajo que el portal viene a quitarle al centro.
 *
 * Todo lo que se muestra viene del servidor ya filtrado: iniciales en vez de
 * nombre, etapas en vez de estados internos, y ni una palabra del
 * diagnostico ni del monto. Esta pantalla no decide que ocultar —eso seria
 * confiar el secreto al navegador—, solo lo presenta.
 */
import { useState } from 'react';
import type { EstadoPublicoOrden } from '@servitotal/compartido';
import { ErrorDeApi, RAIZ_API } from '../api/cliente.js';

function fecha(iso: string | null): string {
  return iso === null ? '—' : new Date(iso).toLocaleDateString();
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
        `${RAIZ_API}/portal/ordenes/${encodeURIComponent(numero.trim())}` +
        `?telefono=${encodeURIComponent(telefono.trim())}`,
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
      <h1>ServiTotal</h1>
      <p className="subtitulo">Consulte como va su orden de servicio.</p>

      <div className="tarjeta">
        <form onSubmit={consultar}>
          <label htmlFor="numero">Numero de orden</label>
          <input
            id="numero"
            inputMode="numeric"
            value={numero}
            onChange={(evento) => setNumero(evento.target.value)}
            placeholder="10234"
            autoFocus
          />

          <label htmlFor="telefono">Telefono</label>
          <input
            id="telefono"
            inputMode="tel"
            value={telefono}
            onChange={(evento) => setTelefono(evento.target.value)}
            placeholder="8888-7777"
          />
          <p className="tenue" style={{ fontSize: 13, margin: '6px 0 0' }}>
            Puede usar su telefono actual o el que dio cuando solicito el servicio.
          </p>

          <div className="acciones">
            <button
              type="submit"
              className="boton"
              disabled={consultando || numero.trim() === '' || telefono.trim() === ''}
            >
              {consultando ? 'Consultando…' : 'Consultar'}
            </button>
          </div>
        </form>

        {error === null ? null : (
          <div className="aviso aviso-error" style={{ marginTop: 18 }}><p>{error}</p></div>
        )}
      </div>

      {estado === null ? null : (
        <div className="tarjeta">
          <p className="etiqueta-cifra">Orden {estado.numeroOrden}</p>
          <h2 style={{ margin: '4px 0 2px' }}>{estado.situacion}</h2>
          <p style={{ margin: '0 0 14px' }}>{estado.explicacion}</p>

          <table>
            <tbody>
              <tr><td>Articulo</td><td>{estado.articulo}</td></tr>
              <tr><td>A nombre de</td><td>{estado.cliente}</td></tr>
              <tr><td>Recibido</td><td>{fecha(estado.recibidoEn)}</td></tr>
              {estado.entregadoEn !== null ? (
                <tr><td>Entregado</td><td>{fecha(estado.entregadoEn)}</td></tr>
              ) : estado.entregaEstimada !== null ? (
                <tr><td>Entrega estimada</td><td>{fecha(estado.entregaEstimada)}</td></tr>
              ) : null}
              {estado.repuestoEsperadoPara === null ? null : (
                <tr>
                  <td>Repuesto esperado</td>
                  <td>{fecha(estado.repuestoEsperadoPara)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <ol className="recorrido">
            {estado.recorrido.map((paso) => (
              <li
                key={paso.etapa}
                className={`${paso.alcanzado ? 'alcanzado' : ''} ${paso.actual ? 'actual' : ''}`}
              >
                {paso.descripcion}
              </li>
            ))}
          </ol>

          <p className="tenue" style={{ fontSize: 13, marginTop: 18 }}>
            Actualizado el {new Date(estado.actualizadoEn).toLocaleString()}.
            ¿Tiene dudas sobre el diagnostico o el costo? Llame al centro: esa informacion
            se conversa con usted identificado, no por esta pagina.
          </p>
        </div>
      )}
    </div>
  );
}
