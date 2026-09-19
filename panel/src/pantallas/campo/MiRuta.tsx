/**
 * M-01 · Mi ruta.
 *
 * La primera pantalla del dia y la unica que el tecnico mira con prisa.
 * Por eso cada tarjeta contesta, sin abrirla, las cuatro preguntas que
 * decide antes de arrancar la moto: a que hora, donde, de quien es el
 * equipo y QUIEN PAGA. Lo ultimo es lo que mas cuesta corregir despues:
 * cobrarle a un cliente cuya garantia de proveedor estaba vigente es una
 * devolucion y un reclamo.
 *
 * LA LISTA VA PARTIDA EN DOS, y esto no es decoracion. La descarga trae
 * TODAS las ordenes vivas del tecnico —que en el taller real son decenas,
 * no las cuatro visitas del dia—, y una lista de sesenta tarjetas en un
 * telefono no se lee: se ignora. Arriba va lo que esta en sus manos ahora,
 * que es donde la aplicacion le sirve de algo; debajo, plegado, lo que
 * espera a otro —bodega, la jefatura, el cliente— y que solo necesita poder
 * consultar.
 *
 * El criterio del corte no se inventa aqui: es `avancesDisponibles`, el
 * mismo que decide que botones se le ofrecen. Si una orden no tiene ningun
 * avance que el tecnico pueda hacer, no esta en sus manos, y punto.
 *
 * Todo sale del espejo local. Si no hay jornada descargada no se muestra
 * una lista vacia, que parece un dia sin trabajo: se dice que falta bajarla
 * y se ofrece el boton.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCampo } from '../../campo/contexto.js';
import { Aviso, Garantia, EtiquetaEstado } from '../../componentes/piezas.js';
import { BarraDeSincronizacion } from '../../componentes/ArmazonCampo.js';
import { avancesDisponibles } from '../../campo/flujo-campo.js';
import { useDelCampo } from './datos.js';

function hora(iso: string | null): string {
  if (iso === null) return 'sin hora';
  return new Date(iso).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
}

export function MiRuta(): JSX.Element {
  const navegar = useNavigate();
  const { enLinea, descargadaEn, descargarJornada } = useCampo();
  const [verEsperando, setVerEsperando] = useState(false);
  const { datos, cargando, error } = useDelCampo(
    (coordinador) => coordinador.misOrdenes(), [descargadaEn],
  );

  const ordenes = datos ?? [];
  const enSusManos = ordenes.filter((orden) => avancesDisponibles(orden.estado).length > 0);
  const esperando = ordenes.filter((orden) => avancesDisponibles(orden.estado).length === 0);

  const tarjeta = (orden: (typeof ordenes)[number]): JSX.Element => (
    <div
      key={orden.id}
      className="rowcard"
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer', borderLeftColor: 'var(--teal)' }}
      onClick={() => navegar(`/campo/ordenes/${orden.id}`)}
      onKeyDown={(evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') navegar(`/campo/ordenes/${orden.id}`);
      }}
    >
      <div className="r1">
        <span className="cod">{hora(orden.plazoVenceEn)} · N.º {orden.numero}</span>
        <EtiquetaEstado estado={orden.estado} />
      </div>
      <div className="r2">{orden.articulo}</div>
      <div className="r3">{orden.cliente} · <Garantia tipo={orden.tipoGarantia} /></div>
      <div className="r3">
        {orden.direccionServicio ?? orden.zona ?? 'Servicio en el taller'}
      </div>
    </div>
  );

  return (
    <>
      <BarraDeSincronizacion />

      <h2 className="scr">Mi ruta</h2>
      <p className="sub">
        {enSusManos.length === 1
          ? '1 orden en sus manos'
          : `${enSusManos.length} ordenes en sus manos`}
        {esperando.length > 0 ? ` · ${esperando.length} esperando a otros` : ''}
      </p>

      {error === null ? null : <Aviso tono="warn">{error}</Aviso>}

      {cargando ? <p className="sub">Leyendo el trabajo guardado…</p> : null}

      {!cargando && descargadaEn === null
        ? (
          <>
            <Aviso tono="warn">
              Todavia no ha bajado la ruta del dia. Hagalo <b>antes de salir del taller</b>,
              con señal: despues no va a poder, y sin la ruta descargada el sistema no sabe
              que ordenes son suyas.
            </Aviso>
            <button
              type="button"
              className="btn pri"
              disabled={!enLinea}
              onClick={() => { void descargarJornada(); }}
            >
              {enLinea ? 'Bajar la ruta del dia' : 'Sin señal: no se puede bajar la ruta'}
            </button>
          </>
        )
        : null}

      {enSusManos.map(tarjeta)}

      {!cargando && descargadaEn !== null && ordenes.length === 0
        ? (
          <Aviso>
            No tiene ordenes abiertas en la ruta que bajo. Si le acaban de asignar una,
            vuelva a bajar la ruta cuando tenga señal.
          </Aviso>
        )
        : null}

      {!cargando && ordenes.length > 0 && enSusManos.length === 0
        ? (
          <Aviso>
            Ninguna de sus ordenes esta ahora en sus manos: todas esperan a bodega, a la
            jefatura o al cliente. Puede consultarlas abajo.
          </Aviso>
        )
        : null}

      {esperando.length > 0
        ? (
          <>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 4 }}
              aria-expanded={verEsperando}
              onClick={() => setVerEsperando(!verEsperando)}
            >
              {verEsperando
                ? 'Ocultar las que esperan a otros'
                : `Ver ${esperando.length} que esperan a otros`}
            </button>
            {verEsperando ? esperando.map(tarjeta) : null}
          </>
        )
        : null}

      {descargadaEn === null
        ? null
        : (
          <Aviso tono="ok">
            La ruta se bajo completa. <b>Puede trabajar sin señal toda la jornada:</b> lo que
            registre queda guardado en este dispositivo y se envia solo cuando vuelva la
            cobertura.
          </Aviso>
        )}

      {enLinea && descargadaEn !== null
        ? (
          <div className="stickybar">
            <button
              type="button"
              className="btn"
              onClick={() => { void descargarJornada(); }}
            >
              Volver a bajar la ruta
            </button>
          </div>
        )
        : null}
    </>
  );
}
