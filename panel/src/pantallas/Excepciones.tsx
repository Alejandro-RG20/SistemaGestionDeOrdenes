/**
 * Bandeja de excepciones de sincronizacion.
 *
 * Cada renglon es TRABAJO QUE UN TECNICO HIZO DE VERDAD y que el servidor no
 * pudo aplicar. No son errores que se descartan: la carga original esta
 * guardada integra y alguien tiene que decidir que hacer con ella.
 *
 * Por eso la pantalla muestra la carga tal como llego, sin resumir. Quien
 * concilia necesita ver exactamente que registro el tecnico para saber si
 * lo aplica a mano o si se descarta con motivo.
 */
import { useState } from 'react';
import type { ResumenExcepcion } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo, Vacio } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

export function Excepciones(): JSX.Element {
  const { api } = useSesion();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [resolucion, setResolucion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const { datos, cargando, error: fallo, recargar } = useRecurso<PaginaDeDatos<ResumenExcepcion>>(
    () => api.pedirPagina<ResumenExcepcion>('/sincronizacion/excepciones', { estado: 'pendiente' }),
    [],
  );

  async function resolver(id: string, estado: 'resuelta' | 'descartada'): Promise<void> {
    setTrabajando(true);
    setError(null);
    try {
      await api.pedir(`/sincronizacion/excepciones/${id}/resolver`, {
        metodo: 'POST',
        cuerpo: { estado, resolucion: resolucion.trim() },
      });
      setAbierta(null);
      setResolucion('');
      recargar();
    } catch (problema) {
      setError(problema instanceof ErrorDeApi ? problema.message : 'No se pudo resolver.');
    } finally {
      setTrabajando(false);
    }
  }

  if (cargando) return <Cargando que="las excepciones" />;
  if (fallo !== null) return <Fallo error={fallo} alReintentar={recargar} />;

  return (
    <>
      <h2 className="scr">Trabajo de campo sin conciliar</h2>
      <p className="sub">
        Lo que un tecnico registro sin conexion y el servidor no pudo aplicar. Nada se
        perdio: la carga original esta completa mas abajo.
      </p>

      {error === null ? null : <div className="alert"><p>{error}</p></div>}

      {datos === null || datos.datos.length === 0 ? (
        <Vacio>No hay excepciones pendientes. Todo lo de campo esta aplicado.</Vacio>
      ) : (
        datos.datos.map((excepcion) => (
          <div key={excepcion.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>
                {excepcion.numeroOrden === null
                  ? 'Operacion sin orden asociada'
                  : `Orden ${excepcion.numeroOrden}`}
              </strong>
              <span className="tenue">{new Date(excepcion.creadoEn).toLocaleString()}</span>
            </div>
            <p style={{ margin: '6px 0' }}>{excepcion.motivo}</p>
            <p className="tenue" style={{ margin: 0, fontSize: 13 }}>
              Registrado por {excepcion.tecnico ?? 'tecnico no identificado'}
            </p>

            {abierta === excepcion.id ? (
              <>
                <h2 style={{ fontSize: 15 }}>Lo que registro el tecnico</h2>
                <pre
                  style={{
                    background: '#f1f5f9', padding: 12, borderRadius: 6,
                    overflowX: 'auto', fontSize: 12,
                  }}
                >
                  {JSON.stringify(excepcion.cargaOriginal, null, 2)}
                </pre>

                <label htmlFor={`resolucion-${excepcion.id}`}>
                  Que se hizo con esto (queda registrado)
                </label>
                <textarea
                  id={`resolucion-${excepcion.id}`}
                  value={resolucion}
                  onChange={(evento) => setResolucion(evento.target.value)}
                  placeholder="Se aplico el consumo a mano contra la bodega central."
                />
                <div className="tools">
                  <button
                    type="button"
                    className="btn pri"
                    disabled={trabajando || resolucion.trim().length < 5}
                    onClick={() => void resolver(excepcion.id, 'resuelta')}
                  >
                    Conciliada
                  </button>
                  <button
                    type="button"
                    className="btn peligro"
                    disabled={trabajando || resolucion.trim().length < 5}
                    onClick={() => void resolver(excepcion.id, 'descartada')}
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setAbierta(null)}
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <div className="tools">
                <button
                  type="button"
                  className="btn"
                  onClick={() => { setAbierta(excepcion.id); setResolucion(''); }}
                >
                  Ver lo registrado y conciliar
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
