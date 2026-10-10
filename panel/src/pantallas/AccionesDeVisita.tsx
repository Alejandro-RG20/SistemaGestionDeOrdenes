/**
 * Llegada y salida reales de una visita.
 *
 * Las horas las pone el servidor al registrar: no se escriben a mano ni
 * salen del reloj del navegador. La franja programada sigue aparte; esto es
 * lo que de verdad paso. Una visita con resultado no se modifica: si hubo
 * otra visita, se programa otra.
 */
import { useState } from 'react';
import type { ResumenVisita } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { Aviso } from '../componentes/piezas.js';
import { ErrorDeApi } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';

const RESULTADOS = [
  { valor: 'resuelta_en_sitio', nombre: 'Resuelta en sitio' },
  { valor: 'requiere_traslado_taller', nombre: 'Requiere traslado al taller' },
  { valor: 'cliente_ausente', nombre: 'Cliente ausente' },
  { valor: 'no_autorizada', nombre: 'El cliente no autorizo' },
] as const;

export const hora = (iso: string | null): string => (iso === null ? '—'
  : new Date(iso).toLocaleString('es-NI', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));

export function AccionesDeVisita(
  { visita, alCambiar }: { visita: ResumenVisita; alCambiar: () => void },
): JSX.Element | null {
  const { api, usuario } = useSesion();
  const [cerrando, setCerrando] = useState(false);
  const [resultado, setResultado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El servidor comprueba ademas que sea el tecnico de la visita.
  const puede = tienePermiso(usuario, 'agenda.programar') || tienePermiso(usuario, 'campo.sincronizar');
  if (!puede || !visita.vigente || visita.resultado !== 'programada') return null;

  async function enviar(ruta: string, cuerpo?: unknown): Promise<void> {
    setGuardando(true); setError(null);
    try {
      await api.pedir(ruta, { metodo: 'POST', ...(cuerpo === undefined ? {} : { cuerpo }) });
      setCerrando(false);
      alCambiar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No se pudo registrar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}
      {visita.horaLlegada === null ? (
        <button
          type="button" className="btn chico pri" disabled={guardando}
          onClick={() => {
            if (!window.confirm('¿Registrar la llegada al domicilio ahora? Se guarda la hora del servidor.')) return;
            void enviar(`/visitas/${visita.id}/llegada`);
          }}
        >
          Registrar llegada
        </button>
      ) : !cerrando ? (
        <button type="button" className="btn chico pri" onClick={() => setCerrando(true)}>Registrar salida</button>
      ) : (
        <div style={{ minWidth: 260 }}>
          <select value={resultado} onChange={(e) => setResultado(e.target.value)}>
            <option value="">Resultado de la visita…</option>
            {RESULTADOS.map((r) => <option key={r.valor} value={r.valor}>{r.nombre}</option>)}
          </select>
          <textarea
            rows={2} placeholder="Observaciones del tecnico" value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)} style={{ marginTop: 4 }}
          />
          <div className="tools" style={{ marginTop: 4 }}>
            <button
              type="button" className="btn chico pri" disabled={guardando || resultado === ''}
              onClick={() => {
                void enviar(`/visitas/${visita.id}/salida`, {
                  resultado, observaciones: observaciones.trim() === '' ? null : observaciones.trim(),
                });
              }}
            >
              Guardar salida
            </button>
            <button type="button" className="btn chico" onClick={() => setCerrando(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
