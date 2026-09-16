/**
 * W-15 · Reglas de cobertura.
 *
 * Lo que esta pantalla demuestra es que **el motor de garantias es dirigido
 * por datos**: los meses de cobertura, las exclusiones y la exigencia de
 * tienda del grupo salen de esta tabla, no del codigo. Ajustar una regla no
 * necesita desplegar nada.
 *
 * Y son versionadas: modificar una no edita la anterior, la cierra y abre
 * una version nueva. Cada orden conserva la version que congelo al abrirse
 * (RF-86, RN-22) — si no, cambiar una regla hoy alteraria retroactivamente
 * quien pagaba una reparacion de hace seis meses, y el expediente ya
 * presentado al proveedor dejaria de coincidir.
 */
import type { ResumenReglaCobertura } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio, fechaCorta } from '../componentes/piezas.js';

export function Coberturas(): JSX.Element {
  const { api } = useSesion();
  const { datos, cargando, error, recargar } = useRecurso<readonly ResumenReglaCobertura[]>(
    () => api.pedir<readonly ResumenReglaCobertura[]>('/coberturas/reglas'), [],
  );

  if (cargando) return <Cargando que="las reglas" />;
  if (error !== null) return <Fallo error={error} alReintentar={recargar} />;

  const reglas = datos ?? [];
  const vigentes = reglas.filter((regla) => regla.activa);
  const cerradas = reglas.filter((regla) => !regla.activa);

  return (
    <>
      <h2 className="scr">Reglas de cobertura</h2>
      <p className="sub">Parametrizables sin intervencion de desarrollo · versionadas</p>

      <Aviso tono="info">
        El motor de garantias evalua cada orden contra estas reglas. Al modificarlas se crea una
        version nueva, y <b>cada orden conserva la version vigente al momento de abrirse</b>{' '}
        (RF-86, RN-22).
      </Aviso>

      <Tarjeta titulo={`Reglas vigentes · ${vigentes.length}`}>
        {vigentes.length === 0 ? (
          <Vacio>No hay reglas de cobertura vigentes.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr>
                <th>Marca</th><th>Categoria</th><th>Meses</th>
                <th>Exige tienda del grupo</th><th>Exclusiones</th><th>Version</th>
              </tr>
            </thead>
            <tbody>
              {vigentes.map((regla) => (
                <tr key={regla.id}>
                  <td>{regla.marca ?? <span className="tenue">toda marca</span>}</td>
                  <td>
                    {regla.categoria === null
                      ? <span className="tenue">toda categoria</span>
                      : regla.categoria.replace(/_/g, ' ')}
                  </td>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{regla.mesesCobertura}</td>
                  <td>
                    {regla.exigeTiendaGrupo
                      ? <span className="tag t-b">si</span>
                      : <span className="tag t-g">no</span>}
                  </td>
                  <td className="tenue">
                    {regla.fallasExcluidas.length === 0
                      ? 'ninguna'
                      : regla.fallasExcluidas.join(', ')}
                  </td>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                    v{regla.version} · {fechaCorta(regla.vigenteDesde)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>

      {cerradas.length === 0 ? null : (
        <Tarjeta titulo={`Versiones anteriores · ${cerradas.length}`}>
          <table className="d">
            <thead>
              <tr><th>Marca</th><th>Categoria</th><th>Meses</th><th>Vigencia</th><th>Version</th></tr>
            </thead>
            <tbody>
              {cerradas.map((regla) => (
                <tr key={regla.id}>
                  <td className="tenue">{regla.marca ?? 'toda marca'}</td>
                  <td className="tenue">{regla.categoria ?? 'toda categoria'}</td>
                  <td>{regla.mesesCobertura}</td>
                  <td className="tenue">
                    {fechaCorta(regla.vigenteDesde)} – {fechaCorta(regla.vigenteHasta)}
                  </td>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>v{regla.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '10px 0 0' }}>
            Estas versiones no se borran: hay ordenes que las congelaron y expedientes de cobro
            que se presentaron con ellas.
          </p>
        </Tarjeta>
      )}

      <Aviso tono="warn">
        <b>Ni la garantia del fabricante ni la poliza extendida se trasladan al revenderse el
        articulo.</b> Las tiendas del grupo venden a cliente final; si el aparato cambio de
        manos, la cobertura no acompana al comprador nuevo.
      </Aviso>
    </>
  );
}
