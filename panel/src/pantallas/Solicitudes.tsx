/**
 * El recorrido de una solicitud de repuesto (pliego §26).
 *
 * El tecnico solicita, bodega revisa, aprueba o rechaza, prepara, entrega, y
 * el tecnico confirma que la tiene en la mano. Seis pasos.
 *
 * NINGUN BOTON DE ESTA PANTALLA ES DECORATIVO (§63). Los botones que se
 * muestran son los que el servidor declaro posibles para esa fila
 * —`pasosPosibles`, que sale de la misma maquina de estados que luego valida
 * el paso—, asi que no hay forma de ofrecer aqui algo que la API vaya a
 * rechazar por invalido. Si falta el permiso, el servidor responde 403 y el
 * mensaje se muestra tal como el servidor lo escribio.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  PeticionPasoSolicitud, ResumenBodega, SolicitudConRecorrido,
} from '@servitotal/compartido';
import { ESTADO_SOLICITUD, ETIQUETA_ESTADO_SOLICITUD } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Vacio, fechaHora } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

/** Que dice el boton de cada paso. «Aprobada» no es una accion; «Aprobar» si. */
const ACCION: Record<string, string> = {
  [ESTADO_SOLICITUD.EN_REVISION]: 'Tomar para revisar',
  [ESTADO_SOLICITUD.APROBADA]: 'Aprobar',
  [ESTADO_SOLICITUD.RECHAZADA]: 'Rechazar',
  [ESTADO_SOLICITUD.PREPARADA]: 'Marcar preparada',
  [ESTADO_SOLICITUD.ENTREGADA]: 'Entregar al tecnico',
  [ESTADO_SOLICITUD.RECIBIDA]: 'Confirmar que la recibi',
  [ESTADO_SOLICITUD.ANULADA]: 'Anular',
};

/** Los pasos que no se dan sin escribir por que. */
const EXIGE_MOTIVO = [ESTADO_SOLICITUD.RECHAZADA, ESTADO_SOLICITUD.ANULADA] as readonly string[];

export function Solicitudes(): JSX.Element {
  const { api } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const estado = parametros.get('estado') ?? '';
  const soloAbiertas = parametros.get('todas') !== '1';

  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const bodegas = useRecurso<PaginaDeDatos<ResumenBodega>>(
    () => api.pedirPagina<ResumenBodega>('/bodegas'), [],
  );

  const solicitudes = useRecurso<PaginaDeDatos<SolicitudConRecorrido>>(
    () => api.pedirPagina<SolicitudConRecorrido>('/solicitudes-repuesto/recorrido', {
      estado: estado === '' ? undefined : estado,
      soloAbiertas: soloAbiertas ? 'true' : undefined,
      tamano: 50,
    }),
    [estado, soloAbiertas],
  );

  function cambiar(clave: string, valor: string): void {
    const siguientes = new URLSearchParams(parametros);
    if (valor === '') siguientes.delete(clave); else siguientes.set(clave, valor);
    setParametros(siguientes);
  }

  async function darPaso(solicitud: SolicitudConRecorrido, hacia: string): Promise<void> {
    setFallo(null);

    const cuerpo: Record<string, unknown> = { hacia };

    if (EXIGE_MOTIVO.includes(hacia)) {
      const motivo = window.prompt(
        'Escriba el motivo. Sin motivo el tecnico no sabe si fue por existencia, por precio o '
        + 'porque pidio la pieza equivocada.',
      );
      if (motivo === null || motivo.trim() === '') return;
      cuerpo['motivo'] = motivo.trim();
    }

    if (hacia === ESTADO_SOLICITUD.ENTREGADA) {
      const surten = (bodegas.datos?.datos ?? []).filter((b) => b.tipo === 'central');
      const lista = surten.map((b, i) => `${i + 1}. ${b.nombre}`).join('\n');
      const elegida = window.prompt(`De que bodega sale la pieza?\n${lista}`);
      const indice = Number(elegida) - 1;
      const bodega = surten[indice];
      if (bodega === undefined) return;
      cuerpo['idBodegaOrigen'] = bodega.id;
    }

    setEnCurso(solicitud.id);
    try {
      await api.pedir<SolicitudConRecorrido>(`/solicitudes-repuesto/${solicitud.id}/pasos`, {
        metodo: 'POST',
        cuerpo: cuerpo as unknown as PeticionPasoSolicitud,
      });
      solicitudes.recargar();
    } catch (error) {
      // El servidor ya escribio un mensaje para una persona; se usa ese.
      setFallo(error instanceof ErrorDeApi ? error.message : 'No se pudo dar el paso.');
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <>
      <h2 className="scr">Solicitudes de repuesto</h2>
      <p className="sub">
        El tecnico solicita, bodega revisa y prepara, y el tecnico confirma que la recibio.
        Quien aprueba no es quien confirma: por eso cada paso pide su propio permiso.
      </p>

      {fallo !== null ? <Aviso tono="warn">{fallo}</Aviso> : null}

      <div className="filtros">
        <div style={{ minWidth: 260 }}>
          <label htmlFor="estado-solicitud">Estado</label>
          <select
            id="estado-solicitud"
            value={estado}
            onChange={(e) => cambiar('estado', e.target.value)}
          >
            <option value="">Todos</option>
            {Object.values(ESTADO_SOLICITUD).map((valor) => (
              <option key={valor} value={valor}>{ETIQUETA_ESTADO_SOLICITUD[valor]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="abiertas">Mostrar</label>
          <select
            id="abiertas"
            value={soloAbiertas ? '' : '1'}
            onChange={(e) => cambiar('todas', e.target.value)}
          >
            <option value="">Solo las que siguen abiertas</option>
            <option value="1">Todas, incluidas las cerradas</option>
          </select>
        </div>
      </div>

      {solicitudes.cargando ? <Cargando que="las solicitudes" /> : null}
      {solicitudes.error !== null
        ? <Fallo error={solicitudes.error} alReintentar={solicitudes.recargar} />
        : null}

      {solicitudes.datos !== null && solicitudes.error === null ? (
        solicitudes.datos.datos.length === 0 ? (
          <Vacio>No hay solicitudes con estos filtros.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Orden</th><th>Repuesto</th>
                <th className="numero">Cant.</th>
                <th>Estado</th><th>Existencia</th><th>Tecnico</th>
                <th>Recorrido</th><th>Pasos</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.datos.datos.map((s) => (
                <tr key={s.id}>
                  <td>{s.codigoOrden ?? s.numeroOrden}</td>
                  <td>
                    {s.codigo}
                    <br /><span className="tenue">{s.descripcion}</span>
                  </td>
                  <td className="numero">{s.cantidad}</td>
                  <td>
                    <span className="estado">{s.etiquetaEstado}</span>
                    {s.motivo === null ? null : (
                      <><br /><span className="tenue">{s.motivo}</span></>
                    )}
                  </td>
                  <td>
                    {/* Nunca solo por color: siempre lleva texto. */}
                    <span className={s.liberada ? 'estado estado-exito' : 'estado estado-alerta'}>
                      {s.liberada ? 'hay' : 'no ha entrado'}
                    </span>
                  </td>
                  <td className="tenue">{s.tecnico ?? 'sin asignar'}</td>
                  <td className="tenue" style={{ fontSize: '0.85em' }}>
                    {s.revisadaPor === null ? null : <>Revisó {s.revisadaPor} · {fechaHora(s.revisadaEn)}<br /></>}
                    {s.preparadaPor === null ? null : <>Preparó {s.preparadaPor} · {fechaHora(s.preparadaEn)}<br /></>}
                    {s.entregadaPor === null ? null : <>Entregó {s.entregadaPor} · {fechaHora(s.entregadaEn)}<br /></>}
                    {s.recibidaEn === null ? null : <>Recibida {fechaHora(s.recibidaEn)}</>}
                    {s.revisadaPor === null && s.recibidaEn === null ? 'Pedida, sin revisar' : null}
                  </td>
                  <td>
                    {s.pasosPosibles.length === 0 ? (
                      <span className="tenue">cerrada</span>
                    ) : s.pasosPosibles.map((paso) => (
                      <button
                        key={paso}
                        type="button"
                        className="secundario"
                        disabled={enCurso === s.id}
                        onClick={() => { void darPaso(s, paso); }}
                      >
                        {ACCION[paso] ?? paso}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </>
  );
}
