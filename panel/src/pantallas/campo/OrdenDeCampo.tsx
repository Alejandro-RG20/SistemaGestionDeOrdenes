/**
 * M-02 · La orden, desde la calle.
 *
 * Es el centro de la visita: los datos que el tecnico necesita tener a la
 * vista mientras habla con el cliente, el registro del resultado de la
 * visita, y las puertas a los cuatro pasos (diagnostico, evidencia,
 * repuestos, cierre).
 *
 * Los botones de avance NO son los del servidor: son los que
 * `flujo-campo.ts` se atreve a ofrecer. Un boton que el servidor va a
 * rechazar no produce un mensaje de error —el tecnico esta sin señal— sino
 * una excepcion de sincronizacion que alguien reconcilia a mano al dia
 * siguiente, con el tecnico ya en otra casa.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RESULTADO_VISITA, type ResultadoVisita } from '@servitotal/compartido';
import { useCampo } from '../../campo/contexto.js';
import { Aviso, Garantia, EtiquetaEstado } from '../../componentes/piezas.js';
import { BarraDeSincronizacion, Pasos } from '../../componentes/ArmazonCampo.js';
import {
  admiteVisita, avancesDisponibles, porQueNoSePuedeMover,
} from '../../campo/flujo-campo.js';
import { useDelCampo } from './datos.js';

/** Los resultados que un tecnico registra de verdad, dichos en su idioma. */
const RESULTADOS: readonly { valor: ResultadoVisita; etiqueta: string; pideMotivo: boolean }[] = [
  { valor: RESULTADO_VISITA.RESUELTA_EN_SITIO, etiqueta: 'Resuelta en la casa', pideMotivo: false },
  {
    valor: RESULTADO_VISITA.REQUIERE_TRASLADO_TALLER,
    etiqueta: 'Hay que llevarla al taller',
    pideMotivo: true,
  },
  { valor: RESULTADO_VISITA.CLIENTE_AUSENTE, etiqueta: 'No habia nadie', pideMotivo: true },
  { valor: RESULTADO_VISITA.NO_AUTORIZADA, etiqueta: 'El cliente no autorizo', pideMotivo: true },
];

export function OrdenDeCampo(): JSX.Element {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { campo, refrescar } = useCampo();
  const { datos: orden, cargando, recargar } = useDelCampo(
    (coordinador) => coordinador.orden(id), [id],
  );

  const [resultado, setResultado] = useState<ResultadoVisita>(RESULTADO_VISITA.RESUELTA_EN_SITIO);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  // La hora de llegada se sella al abrir la orden, no al guardar: es cuando
  // el tecnico efectivamente llego, no cuando se acordo de anotarlo.
  const [horaLlegada] = useState(() => new Date().toISOString());

  if (cargando) return <p className="sub">Leyendo la orden guardada…</p>;
  if (orden === null) {
    return (
      <Aviso tono="warn">
        Esta orden no esta en la ruta que bajo. Si se la acaban de asignar, vuelva a bajar
        la ruta cuando tenga señal.
      </Aviso>
    );
  }

  const avances = avancesDisponibles(orden.estado);
  const bloqueo = porQueNoSePuedeMover(orden.estado);
  const elegido = RESULTADOS.find((opcion) => opcion.valor === resultado);
  const faltaMotivo = elegido?.pideMotivo === true && motivo.trim() === '';

  const conGuardado = async (accion: () => Promise<void>): Promise<void> => {
    setGuardando(true);
    setFallo(null);
    try {
      await accion();
      await refrescar();
      recargar();
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const registrarVisita = async (): Promise<void> => {
    if (campo === null) return;
    const texto = motivo.trim();
    if (resultado === RESULTADO_VISITA.REQUIERE_TRASLADO_TALLER) {
      await campo.coordinador.trasladarAlTaller(orden.id, horaLlegada, texto);
      return;
    }
    await campo.coordinador.registrarVisita(orden.id, resultado, horaLlegada, texto);
  };

  return (
    <>
      <BarraDeSincronizacion />
      <Pasos de={1} />

      <h2 className="scr">N.º {orden.numero}</h2>
      <p className="sub">
        {orden.articulo} · <Garantia tipo={orden.tipoGarantia} /> <EtiquetaEstado estado={orden.estado} />
      </p>

      <div className="card">
        <h3>El cliente</h3>
        <div className="meas"><span>Nombre</span><b>{orden.cliente}</b></div>
        <div className="meas">
          <span>Telefono</span>
          <b><a href={`tel:${orden.telefonoContacto}`}>{orden.telefonoContacto}</a></b>
        </div>
        <div className="meas">
          <span>Direccion</span><b>{orden.direccionServicio ?? 'En el taller'}</b>
        </div>
        {orden.referenciaUbicacion === null
          ? null
          : <div className="meas"><span>Referencia</span><b>{orden.referenciaUbicacion}</b></div>}
      </div>

      <div className="card">
        <h3>Lo que reporto</h3>
        <p style={{ fontSize: 13, margin: 0 }}>{orden.fallaReportada}</p>
      </div>

      {fallo === null ? null : <Aviso tono="warn">{fallo}</Aviso>}

      {admiteVisita(orden.estado)
        ? (
          <div className="card">
            <h3>Resultado de la visita</h3>
            {/*
              «No habia nadie» y «no autorizo» pesan tanto como una
              reparacion: son las que explican por que la orden sigue
              abierta. Sin ellas el plazo corre contra el taller por algo
              que el taller no hizo.
            */}
            <div style={{ marginBottom: 9 }}>
              <label htmlFor="resultado">Como termino</label>
              <select
                id="resultado"
                value={resultado}
                onChange={(evento) => setResultado(evento.target.value as ResultadoVisita)}
              >
                {RESULTADOS.map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
                ))}
              </select>
            </div>
            {elegido?.pideMotivo === true
              ? (
                <div>
                  <label htmlFor="motivo">Explique en una linea</label>
                  <textarea
                    id="motivo"
                    rows={2}
                    value={motivo}
                    onChange={(evento) => setMotivo(evento.target.value)}
                    placeholder="Lo que le diria a la jefatura si le preguntara mañana."
                  />
                </div>
              )
              : null}
            <button
              type="button"
              className="btn teal"
              style={{ marginTop: 10 }}
              disabled={guardando || faltaMotivo}
              onClick={() => { void conGuardado(registrarVisita); }}
            >
              {faltaMotivo ? 'Escriba el motivo' : 'Guardar el resultado'}
            </button>
          </div>
        )
        : null}

      <div className="card">
        <h3>Registrar el trabajo</h3>
        <div className="tools">
          <Link className="btn" to={`/campo/ordenes/${orden.id}/diagnostico`}>
            Diagnostico
          </Link>
          <Link className="btn" to={`/campo/ordenes/${orden.id}/evidencia`}>
            Evidencia
          </Link>
          <Link className="btn" to={`/campo/ordenes/${orden.id}/repuestos`}>
            Repuestos
          </Link>
          <Link className="btn" to={`/campo/ordenes/${orden.id}/cierre`}>
            Cierre
          </Link>
        </div>
      </div>

      {bloqueo === null
        ? (
          <div className="card">
            <h3>Mover la orden</h3>
            {avances.map((avance) => (
              <div key={avance.hacia} style={{ marginBottom: 9 }}>
                <button
                  type="button"
                  className="btn teal"
                  disabled={guardando}
                  onClick={() => {
                    void conGuardado(async () => {
                      if (campo === null) return;
                      await campo.coordinador.moverOrden(orden.id, avance.hacia);
                      navegar('/campo');
                    });
                  }}
                >
                  {avance.etiqueta}
                </button>
                {avance.advertencia === undefined
                  ? null
                  : (
                    <p style={{ fontSize: 11, color: 'var(--soft)', margin: '4px 0 0' }}>
                      {avance.advertencia}
                    </p>
                  )}
              </div>
            ))}
          </div>
        )
        : <Aviso>{bloqueo}</Aviso>}
    </>
  );
}
