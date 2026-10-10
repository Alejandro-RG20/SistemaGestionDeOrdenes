/**
 * W-15 · Reglas de garantia (de referencia).
 *
 * Estas reglas YA NO deciden quien paga una reparacion: la garantia de cada
 * orden la elige quien la registra y, despues, la reclasifica con motivo
 * quien tiene permiso. Lo que siguen aportando es la DURACION de referencia
 * de la garantia del proveedor por marca y categoria: con ella se calcula
 * el vencimiento cuando la ficha del articulo no tiene una registrada, y
 * se muestran advertencias informativas.
 *
 * Son versionadas: una version nueva cierra la anterior, que no se borra
 * (hay ordenes que guardaron la version vigente cuando se registraron).
 */
import type { ResumenReglaCobertura } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio, fechaCorta } from '../componentes/piezas.js';

export function Coberturas(): JSX.Element {
  const { api } = useSesion();
  const { datos, cargando, error, recargar } = useRecurso<readonly ResumenReglaCobertura[]>(
    // Todas, vigentes y cerradas: la lista completa cabe en una pagina.
    () => api.pedir<readonly ResumenReglaCobertura[]>('/coberturas/reglas?soloVigentes=false&tamano=100'), [],
  );

  if (cargando) return <Cargando que="las reglas" />;
  if (error !== null) return <Fallo error={error} alReintentar={recargar} />;

  const reglas = datos ?? [];
  const vigentes = reglas.filter((regla) => regla.activa);
  const cerradas = reglas.filter((regla) => !regla.activa);

  return (
    <>
      <h2 className="scr">Reglas de garantia (referencia)</h2>
      <p className="sub">Duracion habitual de la garantia del proveedor por marca y categoria · versionadas</p>

      <Aviso tono="info">
        <b>Estas reglas no deciden la garantia de ninguna orden.</b> La elige quien registra la orden
        y la reclasifica, con motivo, quien tiene permiso. Aqui solo se toma la duracion de referencia
        para calcular el vencimiento de la garantia del proveedor cuando el articulo no tiene una
        registrada; las exclusiones se muestran como referencia y no se aplican automaticamente.
      </Aviso>

      <Tarjeta titulo={`Reglas vigentes · ${vigentes.length}`}>
        {vigentes.length === 0 ? (
          <Vacio>No hay reglas de cobertura vigentes.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr>
                <th>Marca</th><th>Categoria</th><th>Meses</th>
                <th>Exige tienda del grupo</th><th>Exclusiones (referencia)</th><th>Version</th>
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
            Estas versiones no se borran: hay ordenes que guardaron la version vigente cuando se
            registraron.
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
