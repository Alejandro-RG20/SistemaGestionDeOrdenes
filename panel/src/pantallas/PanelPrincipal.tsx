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
import type { BandejaDeAvisos, IndicadoresDeOperacion } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Cifra, Fallo, Tarjeta } from '../componentes/piezas.js';

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

  if (bandeja.cargando) return <Cargando que="su panel" />;
  if (bandeja.error !== null) return <Fallo error={bandeja.error} alReintentar={bandeja.recargar} />;
  if (bandeja.datos === null) return <Fallo error={null} alReintentar={bandeja.recargar} />;

  const avisos = bandeja.datos;
  const cifras = operacion.datos;
  const hoy = new Date().toLocaleDateString('es-NI', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const porEstado = (estado: string): number =>
    cifras?.porEstado.find((fila) => fila.estado === estado)?.ordenes ?? 0;

  return (
    <>
      <h2 className="scr">Panel principal</h2>
      <p className="sub">
        {hoy.charAt(0).toUpperCase() + hoy.slice(1)} · {usuario?.nombres ?? ''}
      </p>

      {cifras === null ? null : (
        <div className="g g5" style={{ marginBottom: 12 }}>
          <Cifra valor={cifras.ordenesVivas} etiqueta="Ordenes activas" />
          <Cifra
            valor={cifras.cumplimiento.vencidasAbiertas}
            etiqueta="Plazo vencido"
            color="var(--red)"
          />
          <Cifra
            valor={porEstado('esperando_repuesto')}
            etiqueta="Esperando repuesto"
            color="var(--amber)"
          />
          <Cifra
            valor={porEstado('en_diagnostico')}
            etiqueta="En diagnostico"
            color="var(--teal)"
          />
          <Cifra
            valor={`${cifras.cumplimiento.porcentaje}%`}
            etiqueta="Cumplimiento de plazo"
            color="var(--blue)"
          />
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
