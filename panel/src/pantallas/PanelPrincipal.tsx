/**
 * W-02 · Panel principal.
 *
 * Es lo primero que ve cualquiera al entrar, y hace dos trabajos a la vez:
 * las cifras del dia arriba, y debajo **la bandeja** — que es como el
 * negocio decidio resolver «se notifica al responsable». El sistema no
 * empuja nada: ni correo ni mensaje. El responsable entra y lo suyo esta
 * aqui.
 *
 * Por eso cada aviso dice POR QUE le aparece a esa persona. Siendo el unico
 * canal, una bandeja con problemas ajenos se deja de mirar, y dejar de
 * mirarla es quedarse sin aviso.
 */
import { Link } from 'react-router-dom';
import type { BandejaDeAvisos, IndicadoresDeOperacion, Tablero } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Cifra, Fallo, Tarjeta, Vacio, fechaHora } from '../componentes/piezas.js';

/** Los encabezados del tablero, en el orden en que se leen. */
const GRUPOS_DEL_TABLERO: readonly (readonly [string, string])[] = [
  ['ordenes', 'Ordenes de reparacion'],
  ['inventario', 'Inventario de repuestos'],
  ['campo', 'Trabajo de campo'],
];

/** El color de cada tono. Nunca es el unico indicador: la etiqueta va al lado. */
const COLOR_DEL_TONO: Record<string, string | undefined> = {
  normal: undefined,
  atencion: 'var(--amber)',
  critico: 'var(--red)',
};

const TONO_DE_GRAVEDAD: Record<string, 'warn' | 'info' | ''> = {
  critico: '',
  atencion: 'warn',
  informativo: 'info',
};

export function PanelPrincipal(): JSX.Element {
  const { api, usuario } = useSesion();

  const bandeja = useRecurso<BandejaDeAvisos>(() => api.pedir<BandejaDeAvisos>('/avisos'), []);
  const operacion = useRecurso<IndicadoresDeOperacion>(
    () => api.pedir<IndicadoresDeOperacion>('/indicadores/operacion').catch(() => null as never),
    [],
  );

  /*
   * Las doce cifras del §42.
   *
   * Van en una peticion aparte de los indicadores y a proposito: los
   * indicadores son el analisis —cumplimiento, permanencia, reincidencia— y
   * esto es el estado de HOY. Juntarlos en un endpoint obligaria a calcular
   * las dos cosas aunque la pantalla solo necesite una.
   *
   * Si falla, la bandeja se muestra igual: el tablero es util, la bandeja es
   * el canal de aviso del sistema y no puede caerse con el.
   */
  const tablero = useRecurso<Tablero | null>(
    () => api.pedir<Tablero>('/tablero').catch(() => null),
    [],
  );

  if (bandeja.cargando) return <Cargando que="su panel" />;
  if (bandeja.error !== null) return <Fallo error={bandeja.error} alReintentar={bandeja.recargar} />;
  if (bandeja.datos === null) return <Fallo error={null} alReintentar={bandeja.recargar} />;

  const avisos = bandeja.datos;
  const cifras = operacion.datos;
  const hoy = new Date().toLocaleDateString('es-NI', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <>
      <h2 className="scr">Panel principal</h2>
      <p className="sub">
        {hoy.charAt(0).toUpperCase() + hoy.slice(1)} · {usuario?.nombres ?? ''}
      </p>

      {/*
        * El tablero del §42: doce cifras, todas contadas sobre la base.
        *
        * El tono lo decide el SERVIDOR, no esta pantalla: que 40 ordenes
        * atrasadas sean criticas y 0 no lo sean es una regla de negocio y
        * tiene que ser la misma en cualquier pantalla que las muestre.
        *
        * Cada tarjeta con enlace es un boton de verdad: lleva a la lista que
        * explica el numero. Un numero que no se puede abrir no sirve para
        * actuar.
        */}
      {tablero.datos === null ? null : (
        <>
          {GRUPOS_DEL_TABLERO.map(([grupo, titulo]) => {
            const delGrupo = tablero.datos!.cifras.filter((cifra) => cifra.grupo === grupo);
            if (delGrupo.length === 0) return null;
            return (
              <div key={grupo} style={{ marginBottom: 12 }}>
                <h3 className="seccion-tablero">{titulo}</h3>
                <div className="g g5">
                  {delGrupo.map((cifra) => (
                    <Link
                      key={cifra.clave}
                      to={cifra.enlace ?? '#'}
                      style={{
                        textDecoration: 'none',
                        color: 'inherit',
                        pointerEvents: cifra.enlace === null ? 'none' : undefined,
                      }}
                      title={cifra.explicacion}
                    >
                      <Cifra
                        valor={cifra.unidad === 'dias'
                          ? `${cifra.valor.toLocaleString('es-NI')} d`
                          : cifra.valor.toLocaleString('es-NI')}
                        etiqueta={cifra.etiqueta}
                        color={COLOR_DEL_TONO[cifra.tono]}
                      />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {cifras === null ? null : (
        <div className="g g3" style={{ marginBottom: 12 }}>
          <Cifra
            valor={`${cifras.cumplimiento.porcentaje}%`}
            etiqueta="Cumplimiento de plazo"
            color="var(--blue)"
          />
          <Cifra valor={cifras.cumplimiento.cerradas} etiqueta="Cerradas con plazo medido" />
          <Cifra valor={cifras.cumplimiento.vencidasAbiertas} etiqueta="Abiertas con plazo vencido" />
        </div>
      )}

      {avisos.grupos.length === 0 ? (
        <Aviso tono="ok">
          <b>No tiene nada pendiente en este momento.</b> Esta bandeja se calcula cada vez que
          entra: si algo aparece aqui, es porque sigue sin resolverse.
        </Aviso>
      ) : null}

      {/* Los grupos, como las alertas del prototipo: una línea que dice qué
          pasa y un enlace a donde se resuelve. */}
      {avisos.grupos.map((grupo) => (
        <Aviso key={grupo.tipo} tono={TONO_DE_GRAVEDAD[grupo.gravedad] ?? 'info'}>
          <b>{grupo.total} · {grupo.titulo}.</b> {grupo.porQue}{' '}
          <Link to={grupo.enlaceVerTodo}>Ver listado</Link>
        </Aviso>
      ))}

      {/* El detalle de lo más urgente, sin salir del panel. */}
      {avisos.grupos.slice(0, 2).map((grupo) => (
        <Tarjeta key={`detalle-${grupo.tipo}`} titulo={grupo.titulo}>
          <table className="d">
            <thead>
              <tr><th>Referencia</th><th>Detalle</th><th></th></tr>
            </thead>
            <tbody>
              {grupo.muestra.map((renglon) => (
                <tr key={renglon.id}>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{renglon.titulo}</td>
                  <td className="tenue">{renglon.detalle}</td>
                  <td><Link to={renglon.enlace}>Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {grupo.total > grupo.muestra.length ? (
            <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '10px 0 0' }}>
              Se muestran {grupo.muestra.length} de {grupo.total}.{' '}
              <Link to={grupo.enlaceVerTodo}>Ver todos</Link>
            </p>
          ) : null}
        </Tarjeta>
      ))}

      {tablero.datos === null || tablero.datos.cargaPorTecnico.length === 0 ? null : (
        <Tarjeta titulo="Carga de trabajo por tecnico" extra="ordenes abiertas">
          <table className="d">
            <thead>
              <tr>
                <th>Tecnico</th><th>Tipo</th><th className="numero">Abiertas</th>
                <th className="numero">Vencidas</th><th className="numero">En reparacion</th>
                <th className="numero">Esperando repuesto</th>
              </tr>
            </thead>
            <tbody>
              {tablero.datos.cargaPorTecnico.map((fila) => (
                <tr key={fila.idTecnico}>
                  <td>
                    <Link to={`/ordenes?idTecnico=${fila.idTecnico}&soloActivas=true`}>{fila.tecnico}</Link>
                  </td>
                  <td className="tenue">{fila.tipo}</td>
                  <td className="numero">{fila.abiertas}</td>
                  <td className="numero">
                    {fila.vencidas > 0
                      ? <span className="estado estado-critico">{fila.vencidas}</span>
                      : 0}
                  </td>
                  <td className="numero">{fila.enReparacion}</td>
                  <td className="numero">{fila.esperandoRepuesto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      )}

      {tablero.datos === null ? null : (
        <div className="g g2">
          <Tarjeta titulo="Repuestos con mayor consumo" extra="ultimos 90 dias">
            {tablero.datos.masConsumidos.length === 0 ? (
              <Vacio>No se ha consumido ningun repuesto en los ultimos 90 dias.</Vacio>
            ) : (
              <table className="d">
                <thead><tr><th>Repuesto</th><th className="numero">Piezas</th></tr></thead>
                <tbody>
                  {tablero.datos.masConsumidos.map((fila) => (
                    <tr key={fila.idRepuesto}>
                      <td>
                        <Link to={`/inventario/kardex/${fila.idRepuesto}`}>{fila.codigo}</Link>
                        {' '}<span className="tenue">{fila.descripcion}</span>
                      </td>
                      <td className="numero">{fila.piezas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Tarjeta>
          {tablero.datos.movimientosRecientes.length === 0 ? null : (
            <Tarjeta titulo="Movimientos de inventario recientes">
              <table className="d">
                <thead><tr><th>Cuando</th><th>Movimiento</th><th>Orden</th><th>Quien</th></tr></thead>
                <tbody>
                  {tablero.datos.movimientosRecientes.map((fila) => (
                    <tr key={fila.id}>
                      <td className="tenue">{fechaHora(fila.momento)}</td>
                      <td>{fila.tipo.replace(/_/g, ' ')} · {fila.cantidad} x {fila.codigo}</td>
                      <td>
                        {fila.idOrden === null ? '—'
                          : <Link to={`/ordenes/${fila.idOrden}`}>{fila.codigoOrden ?? 'orden'}</Link>}
                      </td>
                      <td className="tenue">{fila.responsable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tarjeta>
          )}
        </div>
      )}

      {/*
        * Actividad reciente (§42).
        *
        * Sale de la bitacora de auditoria, que ya registra toda operacion que
        * cambia algo. Una tabla de «actividad» aparte seria un segundo lugar
        * con lo mismo, y los dos se desincronizan.
        */}
      {tablero.datos === null || tablero.datos.actividad.length === 0 ? null : (
        <Tarjeta titulo="Actividad reciente">
          <table className="d">
            <thead>
              <tr><th>Cuando</th><th>Quien</th><th>Que</th><th /></tr>
            </thead>
            <tbody>
              {tablero.datos.actividad.map((linea, indice) => (
                <tr key={`${linea.momento}-${indice}`}>
                  <td className="tenue">{new Date(linea.momento).toLocaleString('es-NI')}</td>
                  <td>{linea.quien ?? 'el sistema'}</td>
                  <td className="tenue">{linea.accion} · {linea.detalle}</td>
                  <td>{linea.enlace === null ? null : <Link to={linea.enlace}>Abrir</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      )}

      <div className="tools">
        <Link className="btn pri" to="/ordenes/nueva">Nueva orden</Link>
        <Link className="btn" to="/ordenes">Todas las ordenes</Link>
        <Link className="btn" to="/agenda">Agenda de hoy</Link>
      </div>

      <p style={{ fontSize: 11, color: 'var(--soft)', marginTop: 14 }}>
        Calculado el {new Date(avisos.calculadaEn).toLocaleString('es-NI')}.
      </p>
    </>
  );
}
