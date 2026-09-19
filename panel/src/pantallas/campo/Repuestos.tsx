/**
 * M-05 · Repuestos, y la bodega movil del tecnico.
 *
 * El descuento se aplica LOCALMENTE y sin pedir permiso al servidor. Es
 * seguro por una razon concreta del negocio: nadie mas consume de esa
 * bodega. La moto del tecnico no tiene dos duenos, asi que no hay carrera
 * posible y el saldo local no puede discrepar del real por concurrencia.
 * Eso no vale para la bodega del taller, y por eso este atajo vive solo
 * aqui.
 *
 * El precio que viaja es el del catalogo al momento de bajar la ruta: el
 * que el tecnico le enseño al cliente. Si el catalogo cambio mientras
 * estaba en la calle, el servidor acepta el firmado y anota la diferencia.
 * Lo que se pacto en la casa del cliente no se corrige a sus espaldas.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCampo } from '../../campo/contexto.js';
import { Aviso, cordobas } from '../../componentes/piezas.js';
import { BarraDeSincronizacion, Pasos } from '../../componentes/ArmazonCampo.js';
import { admiteConsumo } from '../../campo/flujo-campo.js';
import { useDelCampo } from './datos.js';

export function Repuestos(): JSX.Element {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { campo, refrescar } = useCampo();

  const { datos, cargando, recargar } = useDelCampo(async (coordinador) => {
    const orden = await coordinador.orden(id);
    if (orden === null) return null;
    return { orden, repuestos: await coordinador.repuestos() };
  }, [id]);

  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [consumidos, setConsumidos] = useState<readonly string[]>([]);

  const conExistencia = useMemo(
    () => (datos?.repuestos ?? []).filter((repuesto) => repuesto.cantidad > 0),
    [datos],
  );

  const resultados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (texto === '') return [];
    // Se busca en TODO el catalogo, no solo en lo que lleva encima: cuando
    // la pieza no esta en la moto, el tecnico necesita poder nombrarla para
    // que bodega sepa que pedir.
    return (datos?.repuestos ?? [])
      .filter((repuesto) => repuesto.descripcion.toLowerCase().includes(texto)
        || repuesto.codigo.toLowerCase().includes(texto))
      .slice(0, 20);
  }, [busqueda, datos]);

  if (cargando) return <p className="sub">Leyendo la bodega guardada…</p>;
  if (datos === null) return <Aviso tono="warn">Esta orden no esta en la ruta que bajo.</Aviso>;

  const { orden } = datos;
  const repuesto = datos.repuestos.find((cada) => cada.id === elegido) ?? null;
  const sinExistencia = repuesto !== null && repuesto.cantidad < cantidad;

  const consumir = async (): Promise<void> => {
    if (campo === null || repuesto === null) return;
    setGuardando(true);
    setFallo(null);
    try {
      await campo.coordinador.consumirRepuesto(
        orden.id, repuesto.id, cantidad, repuesto.precio,
      );
      setConsumidos((previos) => [...previos, `${repuesto.descripcion} · ${cantidad}`]);
      setElegido(null);
      setBusqueda('');
      setCantidad(1);
      await refrescar();
      recargar();
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se pudo registrar el consumo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <BarraDeSincronizacion />
      <Pasos de={4} />

      <h2 className="scr">Repuestos</h2>
      <p className="sub">
        N.º {orden.numero} · mi bodega movil, {conExistencia.length} referencias
      </p>

      {!admiteConsumo(orden.estado)
        ? (
          <Aviso tono="warn">
            En el estado actual de la orden no corresponde descargar repuestos. Registre
            primero el diagnostico.
          </Aviso>
        )
        : null}

      {fallo === null ? null : <Aviso tono="warn">{fallo}</Aviso>}

      {consumidos.length > 0
        ? (
          <div className="card">
            <h3>Registrado en esta visita</h3>
            {consumidos.map((linea) => (
              <div key={linea} className="ev done">
                <span aria-hidden="true">✓</span><span>{linea}</span><em>consumido</em>
              </div>
            ))}
          </div>
        )
        : null}

      <div className="card">
        <h3>Registrar consumo</h3>
        <div style={{ marginBottom: 9 }}>
          <label htmlFor="busqueda">Buscar el repuesto</label>
          <input
            id="busqueda"
            value={busqueda}
            onChange={(evento) => { setBusqueda(evento.target.value); setElegido(null); }}
            placeholder="Codigo o descripcion"
          />
        </div>

        {resultados.map((cada) => (
          <div
            key={cada.id}
            className={cada.id === elegido ? 'meas bad' : 'meas'}
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer', minHeight: 46 }}
            onClick={() => setElegido(cada.id)}
            onKeyDown={(evento) => { if (evento.key === 'Enter') setElegido(cada.id); }}
          >
            <span>
              {cada.descripcion}
              <br />
              <small style={{ color: 'var(--soft)' }}>{cada.codigo} · {cordobas(cada.precio)}</small>
            </span>
            <b>{cada.cantidad > 0 ? `${cada.cantidad} en la moto` : 'no la lleva'}</b>
          </div>
        ))}

        {repuesto === null
          ? null
          : (
            <>
              <div style={{ margin: '9px 0' }}>
                <label htmlFor="cantidad">Cuantas piezas uso</label>
                <input
                  id="cantidad"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={cantidad}
                  onChange={(evento) => setCantidad(Math.max(1, Number(evento.target.value)))}
                />
              </div>
              {sinExistencia
                ? (
                  <Aviso tono="warn">
                    <b>Su bodega movil no registra esa cantidad.</b> Puede registrarlo igual
                    si la pieza la trajo de otra orden o se la presto un compañero: bodega lo
                    concilia al sincronizar. Lo que no debe hacer es dejarlo sin registrar.
                  </Aviso>
                )
                : null}
              <button
                type="button"
                className="btn teal"
                disabled={guardando}
                onClick={() => { void consumir(); }}
              >
                {guardando
                  ? 'Guardando…'
                  : `Descargar ${cantidad} · ${cordobas(repuesto.precio * cantidad)}`}
              </button>
            </>
          )}

        <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '9px 0 0' }}>
          El descuento se aplica sobre su bodega movil aqui mismo. Es seguro sin conexion
          porque nadie mas consume de ella.
        </p>
      </div>

      <div className="card">
        <h3>Lo que lleva encima</h3>
        {conExistencia.length === 0
          ? (
            <p style={{ fontSize: 12, color: 'var(--soft)', margin: 0 }}>
              Su bodega movil esta vacia segun la ultima descarga.
            </p>
          )
          : conExistencia.map((cada) => (
            <div key={cada.id} className="meas">
              <span>{cada.descripcion}</span><b>{cada.cantidad}</b>
            </div>
          ))}
      </div>

      <div className="stickybar">
        <button
          type="button"
          className="btn teal"
          onClick={() => navegar(`/campo/ordenes/${orden.id}/cierre`)}
        >
          Continuar al cierre
        </button>
      </div>
    </>
  );
}

/** La pestaña de bodega: lo mismo, sin orden de por medio. */
export function MiBodega(): JSX.Element {
  const { datos, cargando } = useDelCampo((coordinador) => coordinador.repuestos(), []);
  const conExistencia = (datos ?? []).filter((repuesto) => repuesto.cantidad > 0);

  return (
    <>
      <BarraDeSincronizacion />
      <h2 className="scr">Mi bodega movil</h2>
      <p className="sub">
        {conExistencia.length === 1
          ? '1 referencia en la moto'
          : `${conExistencia.length} referencias en la moto`}
      </p>

      {cargando ? <p className="sub">Leyendo la bodega guardada…</p> : null}

      {!cargando && conExistencia.length === 0
        ? (
          <Aviso>
            Su bodega movil aparece vacia. Si acaba de cargar piezas, vuelva a bajar la ruta
            con señal para que se refleje aqui.
          </Aviso>
        )
        : null}

      {conExistencia.map((repuesto) => (
        <div key={repuesto.id} className="meas">
          <span>
            {repuesto.descripcion}
            <br />
            <small style={{ color: 'var(--soft)' }}>
              {repuesto.codigo} · {cordobas(repuesto.precio)}
            </small>
          </span>
          <b>{repuesto.cantidad}</b>
        </div>
      ))}

      <Aviso>
        Estas cantidades son las de la ultima descarga menos lo que usted registro hoy. El
        saldo definitivo lo fija bodega cuando su trabajo sincroniza.
      </Aviso>
    </>
  );
}
