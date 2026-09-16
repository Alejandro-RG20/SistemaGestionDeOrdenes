/**
 * La bandeja: lo primero que ve cualquiera al entrar.
 *
 * Es EL canal de aviso del sistema. El negocio decidio que no se empuja
 * nada —ni correo ni mensaje— y que el responsable entra a ver como va la
 * cosa. Asi que esta pantalla carga toda la responsabilidad de que nadie se
 * entere tarde, y de ahi vienen sus dos rarezas:
 *
 *  - Cada grupo dice POR QUE le aparece a esa persona. Sin eso, la primera
 *    reaccion ante un aviso ajeno es dejar de mirar la bandeja.
 *  - Cuando no hay nada, lo dice claramente en vez de mostrar una pantalla
 *    en blanco: "no hay avisos" y "todavia no cargo" tienen que verse
 *    distinto, porque el unico canal no se puede confundir con un fallo.
 */
import { Link } from 'react-router-dom';
import type { BandejaDeAvisos, GrupoDeAvisos } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo } from '../componentes/carga.js';

function claseDe(grupo: GrupoDeAvisos): string {
  return `tarjeta grupo-aviso ${grupo.gravedad}`;
}

export function Bandeja(): JSX.Element {
  const { api, usuario } = useSesion();
  const { datos, cargando, error, recargar } = useRecurso<BandejaDeAvisos>(
    () => api.pedir<BandejaDeAvisos>('/avisos'), [],
  );

  if (cargando) return <Cargando que="su bandeja" />;
  if (error !== null) return <Fallo error={error} alReintentar={recargar} />;
  if (datos === null) return <Fallo error={null} alReintentar={recargar} />;

  return (
    <>
      <h1>Mi bandeja</h1>
      <p className="subtitulo">
        {usuario?.nombres ?? ''} · {datos.total} pendientes
        {datos.criticos > 0 ? `, ${datos.criticos} criticos` : ''}
      </p>

      {datos.grupos.length === 0 ? (
        <div className="aviso aviso-exito">
          <p>No tiene nada pendiente en este momento.</p>
          <p>
            Esta bandeja se calcula cada vez que entra: si algo aparece aqui,
            es porque sigue sin resolverse.
          </p>
        </div>
      ) : null}

      {datos.grupos.map((grupo) => (
        <section key={grupo.tipo} className={claseDe(grupo)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0 }}>{grupo.titulo}</h2>
            <span className={grupo.gravedad === 'critico' ? 'estado estado-critico' : 'estado'}>
              {grupo.total}
            </span>
          </div>
          <p className="por-que">{grupo.porQue}</p>

          {grupo.muestra.map((renglon) => (
            <Link key={renglon.id} to={renglon.enlace} className="renglon-aviso">
              <span>
                {renglon.titulo}
                <small>{renglon.detalle}</small>
              </span>
            </Link>
          ))}

          {grupo.total > grupo.muestra.length ? (
            <p style={{ marginTop: 12, marginBottom: 0 }}>
              <Link to={grupo.enlaceVerTodo}>
                Ver los {grupo.total} →
              </Link>
            </p>
          ) : null}
        </section>
      ))}

      <p className="tenue" style={{ fontSize: 13 }}>
        Calculada el {new Date(datos.calculadaEn).toLocaleString()}.
      </p>
    </>
  );
}
