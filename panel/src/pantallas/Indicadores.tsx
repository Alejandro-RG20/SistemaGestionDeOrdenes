/**
 * Indicadores de operacion y de cobro.
 *
 * Sin graficos, a proposito. Estos numeros se leen para decidir y para
 * discutirlos con una marca; una tabla se compara, se ordena y se copia a un
 * correo, y una barra de colores no. Si algun dia hace falta un grafico,
 * sera para una presentacion, no para esta pantalla.
 */
import type { IndicadoresDeCobro, IndicadoresDeOperacion } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Cargando, Fallo } from '../componentes/piezas.js';
import { tienePermiso } from '../sesion/navegacion.js';

function claseDePorcentaje(valor: number): string {
  if (valor >= 85) return 'cifra cifra-buena';
  if (valor >= 60) return 'cifra cifra-alerta';
  return 'cifra cifra-critica';
}

export function Indicadores(): JSX.Element {
  const { api, usuario } = useSesion();
  const puedeVerCobros = tienePermiso(usuario, 'cobros.indicadores.consultar');

  const operacion = useRecurso<IndicadoresDeOperacion>(
    () => api.pedir<IndicadoresDeOperacion>('/indicadores/operacion'), [],
  );
  const cobros = useRecurso<IndicadoresDeCobro | null>(
    () => (puedeVerCobros
      ? api.pedir<IndicadoresDeCobro>('/cobros/indicadores')
      : Promise.resolve(null)),
    [puedeVerCobros],
  );

  if (operacion.cargando) return <Cargando que="los indicadores" />;
  if (operacion.error !== null) {
    return <Fallo error={operacion.error} alReintentar={operacion.recargar} />;
  }
  if (operacion.datos === null) return <Fallo error={null} alReintentar={operacion.recargar} />;

  const datos = operacion.datos;

  return (
    <>
      <h2 className="scr">Indicadores</h2>
      <p className="sub">
        Calculados el {new Date(datos.calculadoEn).toLocaleString()}.
      </p>

      <div className="g g4">
        <div className="card">
          <p className="etiqueta-cifra">Ordenes abiertas</p>
          <p className="cifra">{datos.ordenesVivas}</p>
        </div>
        <div className="card">
          <p className="etiqueta-cifra">Cumplimiento de plazo</p>
          <p className={claseDePorcentaje(datos.cumplimiento.porcentaje)}>
            {datos.cumplimiento.porcentaje}%
          </p>
          <p className="tenue" style={{ margin: 0, fontSize: 13 }}>
            {datos.cumplimiento.aTiempo} de {datos.cumplimiento.cerradas} entregadas a tiempo
          </p>
        </div>
        <div className="card">
          <p className="etiqueta-cifra">Vencidas abiertas</p>
          <p className={datos.cumplimiento.vencidasAbiertas > 0 ? 'cifra cifra-critica' : 'cifra'}>
            {datos.cumplimiento.vencidasAbiertas}
          </p>
        </div>
      </div>

      <h2>Ordenes abiertas por estado</h2>
      <table>
        <thead>
          <tr><th>Estado</th><th className="numero">Ordenes</th><th className="numero">Vencidas</th></tr>
        </thead>
        <tbody>
          {datos.porEstado.map((fila) => (
            <tr key={fila.estado}>
              <td>{fila.estado.replace(/_/g, ' ')}</td>
              <td className="numero">{fila.ordenes}</td>
              <td className="numero">
                {fila.vencidas > 0
                  ? <span className="tag t-r">{fila.vencidas}</span>
                  : <span className="tenue">0</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Donde se atasca el trabajo</h2>
      <p className="tenue" style={{ marginTop: -6, fontSize: 13 }}>
        Horas corridas promedio que una orden pasa en cada estado. Sirve para comparar
        estados entre si, no como medida de cumplimiento.
      </p>
      <table>
        <thead>
          <tr><th>Estado</th><th className="numero">Tramos</th><th className="numero">Horas promedio</th></tr>
        </thead>
        <tbody>
          {datos.permanencia.map((fila) => (
            <tr key={fila.estado}>
              <td>{fila.estado.replace(/_/g, ' ')}</td>
              <td className="numero tenue">{fila.ordenes}</td>
              <td className="numero">{fila.horasPromedio}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Tecnicos</h2>
      <table>
        <thead>
          <tr>
            <th>Tecnico</th><th>Tipo</th>
            <th className="numero">Cerradas</th>
            <th className="numero">En curso</th>
            <th className="numero">Vencidas</th>
            <th className="numero">Horas promedio</th>
          </tr>
        </thead>
        <tbody>
          {datos.tecnicos.map((fila) => (
            <tr key={fila.idTecnico}>
              <td>{fila.tecnico}</td>
              <td className="tenue">{fila.tipo}</td>
              <td className="numero">{fila.ordenesCerradas}</td>
              <td className="numero">{fila.enCurso}</td>
              <td className="numero">
                {fila.vencidas > 0
                  ? <span className="tag t-r">{fila.vencidas}</span>
                  : <span className="tenue">0</span>}
              </td>
              <td className="numero tenue">{fila.horasPromedioCierre ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Articulos que vuelven</h2>
      <p className="tenue" style={{ marginTop: -6, fontSize: 13 }}>
        Se cuenta por articulo, no por cliente: es el aparato el que falla otra vez.
      </p>
      <table>
        <thead>
          <tr>
            <th>Articulo</th><th>Cliente</th>
            <th className="numero">Ordenes</th>
            <th className="numero">Ultima</th>
            <th className="numero">Dias entre las dos ultimas</th>
          </tr>
        </thead>
        <tbody>
          {datos.reincidencias.map((fila) => (
            <tr key={fila.idArticulo}>
              <td>{fila.articulo}</td>
              <td className="tenue">{fila.cliente}</td>
              <td className="numero">{fila.ordenes}</td>
              <td className="numero tenue">{fila.ultimaOrden}</td>
              <td className="numero">{fila.diasEntreUltimasDos ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {puedeVerCobros && cobros.datos !== null && cobros.datos !== undefined ? (
        <>
          <h2>Recuperacion de garantias</h2>
          <div className="g g4">
            <div className="card">
              <p className="etiqueta-cifra">Reclamado</p>
              <p className="cifra">C$ {cobros.datos.totalReclamado.toFixed(2)}</p>
            </div>
            <div className="card">
              <p className="etiqueta-cifra">Cobrado</p>
              <p className="cifra cifra-buena">C$ {cobros.datos.totalCobrado.toFixed(2)}</p>
            </div>
            <div className="card">
              <p className="etiqueta-cifra">Tasa de recuperacion</p>
              <p className={claseDePorcentaje(cobros.datos.tasaRecuperacion)}>
                {cobros.datos.tasaRecuperacion}%
              </p>
            </div>
            <div className="card">
              <p className="etiqueta-cifra">Expuesto</p>
              <p className="cifra cifra-alerta">C$ {cobros.datos.expuesto.toFixed(2)}</p>
              <p className="tenue" style={{ margin: 0, fontSize: 13 }}>
                Reclamado que no ha entrado ni fue rechazado
              </p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Marca</th>
                <th className="numero">Expedientes</th>
                <th className="numero">Reclamado</th>
                <th className="numero">Cobrado</th>
                <th className="numero">Recupera</th>
                <th className="numero">Rechazos</th>
                <th className="numero">Dias en responder</th>
              </tr>
            </thead>
            <tbody>
              {cobros.datos.porMarca.map((fila) => (
                <tr key={fila.idMarca ?? 'poliza'}>
                  <td>{fila.marca}</td>
                  <td className="numero">{fila.expedientes}</td>
                  <td className="numero">C$ {fila.reclamado.toFixed(2)}</td>
                  <td className="numero">C$ {fila.cobrado.toFixed(2)}</td>
                  <td className="numero">
                    {/* El numero con el que se negocia con la marca. */}
                    <span className={fila.tasaRecuperacion < 60 ? 'estado estado-critico' : 'estado'}>
                      {fila.tasaRecuperacion}%
                    </span>
                  </td>
                  <td className="numero tenue">{fila.rechazados}</td>
                  <td className="numero tenue">{fila.diasPromedioRespuesta ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </>
  );
}
