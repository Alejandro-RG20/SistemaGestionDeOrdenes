/**
 * Registrar movimientos de inventario: entradas, salidas, transferencias,
 * devoluciones y ajustes (pliego §25).
 *
 * UN SOLO FORMULARIO, NO CINCO PANTALLAS
 *
 * El tipo de movimiento decide que campos pide, y esa tabla es la misma que
 * el servidor usa para validar. Cinco pantallas con cinco formularios
 * parecidos es cinco sitios donde la regla puede quedar desalineada.
 *
 * LOS TIPOS QUE SE OFRECEN SON LOS QUE EL USUARIO PUEDE REGISTRAR
 *
 * Se filtran con `movimientosPermitidos`, la misma tabla
 * PERMISO_DEL_MOVIMIENTO que el servidor consulta para responder 403. No es
 * control de acceso —eso lo hace el servidor— sino no ofrecerle a alguien un
 * formulario que va a rechazarsele al enviarlo.
 */
import { useState } from 'react';
import type {
  ExistenciaEnBodega, ResumenBodega, ResumenMovimiento, TipoMovimiento,
} from '@servitotal/compartido';
import { TIPO_MOVIMIENTO, movimientosPermitidos } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Vacio, fechaHora } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';

interface FormaDelTipo {
  readonly etiqueta: string;
  readonly explicacion: string;
  readonly pideOrigen: boolean;
  readonly pideDestino: boolean;
  /** El ajuste lleva UNA bodega: destino si sobra, origen si falta. */
  readonly unaSolaBodega?: boolean;
  readonly pideJustificacion: boolean;
}

const FORMA: Record<TipoMovimiento, FormaDelTipo> = {
  [TIPO_MOVIMIENTO.INGRESO]: {
    etiqueta: 'Entrada',
    explicacion: 'Repuesto que entra al centro. Libera las ordenes que lo esperaban, por orden de llegada.',
    pideOrigen: false, pideDestino: true, pideJustificacion: false,
  },
  [TIPO_MOVIMIENTO.DESPACHO_A_MOVIL]: {
    etiqueta: 'Transferencia a bodega movil',
    explicacion: 'La pieza sale de la bodega que surte y entra a la del tecnico. No cambia el total del centro.',
    pideOrigen: true, pideDestino: true, pideJustificacion: false,
  },
  [TIPO_MOVIMIENTO.DEVOLUCION_A_CENTRAL]: {
    etiqueta: 'Devolucion a central',
    explicacion: 'Lo que el tecnico no uso y regresa a bodega.',
    pideOrigen: true, pideDestino: true, pideJustificacion: false,
  },
  [TIPO_MOVIMIENTO.CONSUMO]: {
    etiqueta: 'Consumo en una orden',
    explicacion: 'La pieza se instalo. Se registra contra la orden y sale del inventario.',
    pideOrigen: true, pideDestino: false, pideJustificacion: false,
  },
  [TIPO_MOVIMIENTO.DEVOLUCION_PIEZA_SUSTITUIDA]: {
    etiqueta: 'Pieza sustituida',
    explicacion: 'La pieza que se retiro del articulo. Se resguarda para el fabricante; no vuelve a venderse.',
    pideOrigen: false, pideDestino: true, pideJustificacion: false,
  },
  [TIPO_MOVIMIENTO.AJUSTE]: {
    etiqueta: 'Ajuste',
    explicacion: 'Correccion del conteo. Exige motivo escrito: un ajuste sin motivo no se puede auditar.',
    pideOrigen: false, pideDestino: false, unaSolaBodega: true, pideJustificacion: true,
  },
};

export function Movimientos(): JSX.Element {
  const { api, usuario } = useSesion();

  const disponibles = movimientosPermitidos(usuario?.permisos ?? []);
  const [tipo, setTipo] = useState<TipoMovimiento | ''>(disponibles[0] ?? '');
  const [idRepuesto, setIdRepuesto] = useState('');
  const [texto, setTexto] = useState('');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [sentido, setSentido] = useState<'sobra' | 'falta'>('sobra');
  const [cantidad, setCantidad] = useState('1');
  const [justificacion, setJustificacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const bodegas = useRecurso<PaginaDeDatos<ResumenBodega>>(
    () => api.pedirPagina<ResumenBodega>('/bodegas'), [],
  );
  const repuestos = useRecurso<PaginaDeDatos<{ id: string; codigo: string; descripcion: string }>>(
    () => api.pedirPagina('/repuestos', { texto: texto === '' ? undefined : texto, tamano: 25 }),
    [texto],
  );
  const movimientos = useRecurso<PaginaDeDatos<ResumenMovimiento>>(
    () => api.pedirPagina<ResumenMovimiento>('/movimientos', { tamano: 25 }),
    [hecho],
  );
  const existencias = useRecurso<PaginaDeDatos<ExistenciaEnBodega>>(
    () => (idRepuesto === ''
      ? Promise.resolve({ datos: [], paginacion: { pagina: 1, tamano: 0, total: 0, totalPaginas: 0 } })
      : api.pedirPagina<ExistenciaEnBodega>('/existencias', { idRepuesto })),
    [idRepuesto, hecho],
  );

  if (disponibles.length === 0) {
    return (
      <>
        <h2 className="scr">Movimientos de inventario</h2>
        <Vacio>
          Su perfil consulta el inventario pero no registra movimientos. No se le muestra un
          formulario que el servidor va a rechazar.
        </Vacio>
      </>
    );
  }

  const forma = tipo === '' ? null : FORMA[tipo];

  async function registrar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    setFallo(null);
    setHecho(null);

    if (tipo === '' || forma === null) return;
    if (idRepuesto === '') { setFallo('Elija el repuesto.'); return; }

    const cuerpo: Record<string, unknown> = {
      tipo,
      idRepuesto,
      cantidad: Number(cantidad),
    };

    if (forma.unaSolaBodega === true) {
      if (origen === '') { setFallo('Elija la bodega del ajuste.'); return; }
      // Sobra: entra a la bodega. Falta: sale de ella. Una sola de las dos,
      // que es lo que el servidor exige.
      if (sentido === 'sobra') cuerpo['idBodegaDestino'] = origen;
      else cuerpo['idBodegaOrigen'] = origen;
    } else {
      if (forma.pideOrigen) {
        if (origen === '') { setFallo('Elija la bodega de origen.'); return; }
        cuerpo['idBodegaOrigen'] = origen;
      }
      if (forma.pideDestino) {
        if (destino === '') { setFallo('Elija la bodega de destino.'); return; }
        cuerpo['idBodegaDestino'] = destino;
      }
    }

    if (justificacion.trim() !== '') cuerpo['justificacion'] = justificacion.trim();
    if (forma.pideJustificacion && justificacion.trim() === '') {
      setFallo('Escriba el motivo del ajuste.');
      return;
    }

    setGuardando(true);
    try {
      const resultado = await api.pedir<{ movimiento: ResumenMovimiento; existencias: { bodega: string; cantidad: number }[] }>(
        '/movimientos', { metodo: 'POST', cuerpo },
      );
      const saldos = resultado.existencias
        .map((e) => `${e.bodega}: ${e.cantidad}`).join(' · ');
      setHecho(`Movimiento registrado. Quedan ${saldos}.`);
      setCantidad('1');
      setJustificacion('');
    } catch (error) {
      setFallo(error instanceof ErrorDeApi ? error.message : 'No se pudo registrar el movimiento.');
    } finally {
      setGuardando(false);
    }
  }

  const listaBodegas = bodegas.datos?.datos ?? [];

  return (
    <>
      <h2 className="scr">Movimientos de inventario</h2>
      <p className="sub">
        Un movimiento no se edita ni se borra: se corrige con un ajuste, que es otro movimiento.
        Por eso el historial siempre cuadra con la existencia.
      </p>

      {fallo !== null ? <Aviso tono="warn">{fallo}</Aviso> : null}
      {hecho !== null ? <Aviso tono="ok">{hecho}</Aviso> : null}

      <form onSubmit={(e) => { void registrar(e); }}>
        <div className="filtros">
          <div style={{ minWidth: 280 }}>
            <label htmlFor="tipo-mov">Tipo de movimiento</label>
            <select
              id="tipo-mov"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoMovimiento)}
            >
              {disponibles.map((valor) => (
                <option key={valor} value={valor}>{FORMA[valor].etiqueta}</option>
              ))}
            </select>
          </div>
        </div>

        {forma === null ? null : <p className="sub">{forma.explicacion}</p>}

        <div className="filtros">
          <div style={{ minWidth: 300 }}>
            <label htmlFor="buscar-rep">Repuesto</label>
            <input
              id="buscar-rep"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Codigo o descripcion"
            />
            <select
              aria-label="Repuesto elegido"
              value={idRepuesto}
              onChange={(e) => setIdRepuesto(e.target.value)}
            >
              <option value="">Elija el repuesto</option>
              {(repuestos.datos?.datos ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.codigo} · {r.descripcion}</option>
              ))}
            </select>
          </div>

          {forma?.unaSolaBodega === true ? (
            <>
              <div>
                <label htmlFor="sentido">El conteo dice que</label>
                <select
                  id="sentido"
                  value={sentido}
                  onChange={(e) => setSentido(e.target.value as 'sobra' | 'falta')}
                >
                  <option value="sobra">sobra (hay mas de lo anotado)</option>
                  <option value="falta">falta (hay menos de lo anotado)</option>
                </select>
              </div>
              <div style={{ minWidth: 240 }}>
                <label htmlFor="bodega-ajuste">Bodega</label>
                <select id="bodega-ajuste" value={origen} onChange={(e) => setOrigen(e.target.value)}>
                  <option value="">Elija la bodega</option>
                  {listaBodegas.map((b) => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              {forma?.pideOrigen === true ? (
                <div style={{ minWidth: 240 }}>
                  <label htmlFor="bod-origen">Sale de</label>
                  <select id="bod-origen" value={origen} onChange={(e) => setOrigen(e.target.value)}>
                    <option value="">Elija la bodega</option>
                    {listaBodegas.map((b) => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              {forma?.pideDestino === true ? (
                <div style={{ minWidth: 240 }}>
                  <label htmlFor="bod-destino">Entra a</label>
                  <select id="bod-destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
                    <option value="">Elija la bodega</option>
                    {listaBodegas.map((b) => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          )}

          <div style={{ maxWidth: 120 }}>
            <label htmlFor="cant">Cantidad</label>
            <input
              id="cant" type="number" min="1" value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </div>
        </div>

        <div className="filtros">
          <div style={{ minWidth: 420 }}>
            <label htmlFor="justif">
              Motivo {forma?.pideJustificacion === true ? '(obligatorio)' : '(opcional)'}
            </label>
            <input
              id="justif" value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              placeholder="Que paso y por que se registra asi"
            />
          </div>
        </div>

        <button type="submit" disabled={guardando}>
          {guardando ? 'Registrando…' : 'Registrar movimiento'}
        </button>
      </form>

      {idRepuesto !== '' && (existencias.datos?.datos ?? []).length > 0 ? (
        <>
          <h3>Existencia actual de ese repuesto</h3>
          <table>
            <thead><tr><th>Bodega</th><th className="numero">Cantidad</th></tr></thead>
            <tbody>
              {(existencias.datos?.datos ?? []).map((e) => (
                <tr key={e.idBodega}>
                  <td>{e.bodega}</td>
                  <td className="numero">{e.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <h3>Ultimos movimientos del centro</h3>
      {movimientos.cargando ? <Cargando que="los movimientos" /> : null}
      {movimientos.error !== null
        ? <Fallo error={movimientos.error} alReintentar={movimientos.recargar} />
        : null}
      {(movimientos.datos?.datos ?? []).length === 0 && !movimientos.cargando ? (
        <Vacio>Todavia no hay movimientos registrados.</Vacio>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Tipo</th><th>Repuesto</th>
              <th className="numero">Cant.</th>
              <th>Origen</th><th>Destino</th><th>Responsable</th>
            </tr>
          </thead>
          <tbody>
            {(movimientos.datos?.datos ?? []).map((m) => (
              <tr key={m.id}>
                <td className="tenue">{fechaHora(m.creadoEn)}</td>
                <td>{FORMA[m.tipo as TipoMovimiento]?.etiqueta ?? m.tipo}</td>
                <td>{m.codigo}</td>
                <td className="numero">{m.cantidad}</td>
                <td className="tenue">{m.bodegaOrigen ?? '—'}</td>
                <td className="tenue">{m.bodegaDestino ?? '—'}</td>
                <td className="tenue">{m.responsable ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
