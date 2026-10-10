/**
 * «Registrar bitacora»: comentario general sobre la orden.
 *
 * Se guarda en el servidor, que pone el autor (la sesion) y la fecha (su
 * reloj): la pantalla no manda ninguno de los dos. Al guardar se muestra lo
 * que el servidor devolvio, no lo que se escribio.
 *
 * Los dos tipos de pago solo se ofrecen en una visita particular a
 * domicilio con cargo de visita, que es el unico caso en que la
 * autorizacion exige constancia de pago. Fuera de eso, todo es comentario.
 */
import { useState } from 'react';
import {
  MODALIDAD_SERVICIO, TIPO_ENTRADA_BITACORA, TIPO_GARANTIA,
  type EntradaBitacora, type FichaOrden, type TipoEntradaBitacora,
} from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { Aviso, fechaHora } from '../componentes/piezas.js';
import { ErrorDeApi } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';

const MAXIMO = 2000;

export function ModalBitacora(
  { orden, alCerrar, alGuardar }: {
    orden: FichaOrden; alCerrar: () => void; alGuardar: (entrada: EntradaBitacora) => void;
  },
): JSX.Element {
  const { api, usuario } = useSesion();
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<TipoEntradaBitacora>(TIPO_ENTRADA_BITACORA.COMENTARIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conPagoDeVisita = orden.modalidad === MODALIDAD_SERVICIO.RUTA
    && orden.tipoGarantia === TIPO_GARANTIA.PARTICULAR && orden.cargoVisita > 0;
  const puedeConfirmarPago = tienePermiso(usuario, 'taller.cotizacion.autorizar');

  async function guardar(): Promise<void> {
    if (texto.trim() === '') { setError('Escriba el comentario: no se guardan comentarios vacios.'); return; }
    setGuardando(true);
    setError(null);
    try {
      const entrada = await api.pedir<EntradaBitacora>(`/ordenes/${orden.id}/bitacora`, {
        metodo: 'POST', cuerpo: { texto: texto.trim(), tipo },
      });
      alGuardar(entrada);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo guardar el comentario.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="velo" role="dialog" aria-modal="true" aria-labelledby="titulo-bitacora">
      <div className="modal">
        <h3 id="titulo-bitacora">Registrar bitacora · {orden.codigo}</h3>
        {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
        <textarea
          autoFocus value={texto} maxLength={MAXIMO}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Visitas, cliente, cotizacion, repuestos, pagos, incidencias, seguimiento…"
        />
        <small className="tenue">{texto.length}/{MAXIMO}. El autor y la fecha los registra el sistema.</small>
        {conPagoDeVisita ? (
          <div style={{ marginTop: 8 }}>
            <label htmlFor="tipo-bitacora">Esta entrada es</label>
            <select id="tipo-bitacora" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEntradaBitacora)}>
              <option value={TIPO_ENTRADA_BITACORA.COMENTARIO}>Comentario general</option>
              <option value={TIPO_ENTRADA_BITACORA.PAGO_REGISTRADO}>Registro del pago de la visita</option>
              {puedeConfirmarPago ? (
                <option value={TIPO_ENTRADA_BITACORA.PAGO_CONFIRMADO}>Confirmo el pago registrado por otra persona</option>
              ) : null}
            </select>
            <small className="tenue">
              Solo estas dos marcas cuentan como constancia de pago para autorizar la visita; un comentario
              comun nunca cambia el estado de la orden.
            </small>
          </div>
        ) : null}
        <div className="tools" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={alCerrar} disabled={guardando}>Cancelar</button>
          <button type="button" className="btn pri" onClick={() => { void guardar(); }} disabled={guardando || texto.trim() === ''}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function avisoDeEntrada(entrada: EntradaBitacora): string {
  return `Comentario guardado por ${entrada.autor} el ${fechaHora(entrada.momento)}.`;
}
