/**
 * M-03 · Diagnostico.
 *
 * Dos campos y nada mas: componente afectado y falla real. No es una
 * pantalla pobre, es una pantalla honesta — el servidor solo persiste esos
 * dos datos, y un formulario con cinco casillas que se pierden al
 * sincronizar es peor que ninguno.
 *
 * La falla real se escribe SIEMPRE, aunque coincida con lo que reporto el
 * cliente. Es lo que despues sostiene el expediente de cobro al proveedor:
 * «no enfria» no le sirve de nada a LG; «compresor con baja presion de
 * succion» si.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCampo } from '../../campo/contexto.js';
import { Aviso, Garantia } from '../../componentes/piezas.js';
import { BarraDeSincronizacion, Pasos } from '../../componentes/ArmazonCampo.js';
import { admiteDiagnostico } from '../../campo/flujo-campo.js';
import { useDelCampo } from './datos.js';

/**
 * Los componentes que se repiten en el taller, para no escribirlos a mano
 * en la calle. La lista deja escribir otro: un catalogo cerrado obliga a
 * mentir cuando la falla no encaja, y una falla mal tipificada envenena el
 * indicador de reincidencia.
 */
const COMPONENTES = [
  'Compresor', 'Termostato', 'Tarjeta electronica', 'Motor del ventilador',
  'Fuga en el sistema', 'Capacitor', 'Resistencia', 'Bomba de agua',
  'Cableado', 'Sensor de temperatura',
];

export function Diagnostico(): JSX.Element {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { campo, refrescar } = useCampo();
  const { datos: orden, cargando } = useDelCampo(
    (coordinador) => coordinador.orden(id), [id],
  );

  const [componente, setComponente] = useState('');
  const [otro, setOtro] = useState('');
  const [fallaReal, setFallaReal] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  if (cargando) return <p className="sub">Leyendo la orden guardada…</p>;
  if (orden === null) return <Aviso tono="warn">Esta orden no esta en la ruta que bajo.</Aviso>;

  const componenteFinal = componente === 'otro' ? otro.trim() : componente;
  const puedeGuardar = fallaReal.trim().length >= 10 && !guardando;

  const guardar = async (): Promise<void> => {
    if (campo === null) return;
    setGuardando(true);
    setFallo(null);
    try {
      await campo.coordinador.registrarDiagnostico(
        orden.id,
        fallaReal.trim(),
        componenteFinal === '' ? undefined : componenteFinal,
      );
      await refrescar();
      setGuardado(true);
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se pudo guardar el diagnostico.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <BarraDeSincronizacion />
      <Pasos de={2} />

      <h2 className="scr">Diagnostico</h2>
      <p className="sub">
        N.º {orden.numero} · {orden.articulo} · <Garantia tipo={orden.tipoGarantia} />
      </p>

      {!admiteDiagnostico(orden.estado)
        ? (
          <Aviso tono="warn">
            Esta orden ya paso del diagnostico. Si encontro algo nuevo, registrelo como
            observacion al mover la orden, no como un segundo diagnostico.
          </Aviso>
        )
        : null}

      <div className="card">
        <h3>Lo que reporto el cliente</h3>
        <p style={{ fontSize: 13, margin: 0, color: 'var(--soft)' }}>{orden.fallaReportada}</p>
      </div>

      <div className="card">
        <h3>Falla real</h3>
        <div style={{ marginBottom: 9 }}>
          <label htmlFor="componente">Componente afectado</label>
          <select
            id="componente"
            value={componente}
            onChange={(evento) => setComponente(evento.target.value)}
          >
            <option value="">Sin especificar</option>
            {COMPONENTES.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
            <option value="otro">Otro (escribirlo)</option>
          </select>
        </div>
        {componente === 'otro'
          ? (
            <div style={{ marginBottom: 9 }}>
              <label htmlFor="otro">Cual</label>
              <input id="otro" value={otro} onChange={(evento) => setOtro(evento.target.value)} />
            </div>
          )
          : null}
        <div>
          <label htmlFor="falla">Que encontro</label>
          <textarea
            id="falla"
            rows={4}
            value={fallaReal}
            onChange={(evento) => setFallaReal(evento.target.value)}
            placeholder="Lo tecnico, no lo que dijo el cliente. Esto sustenta el cobro al proveedor."
          />
        </div>
        {fallaReal.trim().length > 0 && fallaReal.trim().length < 10
          ? (
            <p style={{ fontSize: 11, color: 'var(--amber)', margin: '5px 0 0' }}>
              Escriba un poco mas: con dos palabras el expediente de cobro no se sostiene.
            </p>
          )
          : null}
      </div>

      {fallo === null ? null : <Aviso tono="warn">{fallo}</Aviso>}

      {guardado
        ? (
          <Aviso tono="ok">
            <b>Diagnostico guardado en este dispositivo.</b> Se envia solo cuando vuelva la
            señal; no hace falta repetirlo en el taller.
          </Aviso>
        )
        : null}

      <div className="stickybar">
        {guardado
          ? (
            <button
              type="button"
              className="btn teal"
              onClick={() => navegar(`/campo/ordenes/${orden.id}/evidencia`)}
            >
              Continuar a la evidencia
            </button>
          )
          : (
            <button
              type="button"
              className="btn teal"
              disabled={!puedeGuardar}
              onClick={() => { void guardar(); }}
            >
              {guardando ? 'Guardando…' : 'Guardar el diagnostico'}
            </button>
          )}
      </div>
    </>
  );
}
