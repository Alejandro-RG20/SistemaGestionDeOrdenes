/**
 * W-14 · Ficha del articulo.
 *
 * El prototipo marca esta pantalla con un aviso en rojo, y con razon: **tres
 * campos deciden quien paga la reparacion**. Un articulo registrado como
 * comprado en el grupo lo cubre el proveedor; el mismo articulo como
 * externo lo paga el cliente. Sin restriccion de rol, motivo y bitacora,
 * ese campo seria un interruptor que traslada el costo con dos clics y sin
 * dejar rastro.
 *
 * Por eso aqui se muestran de solo lectura y el cambio va por una puerta
 * aparte, que el servidor cierra con permiso de jefatura.
 */
import { Link, useParams } from 'react-router-dom';
import type { FichaArticulo } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { tienePermiso } from '../sesion/navegacion.js';
import {
  Aviso, Cargando, Fallo, Garantia, Tarjeta, Vacio, fechaCorta,
} from '../componentes/piezas.js';

export function Articulo(): JSX.Element {
  const { id = '' } = useParams();
  const { api, usuario } = useSesion();
  const puedeCorregir = tienePermiso(usuario, 'articulos.editar_datos_sensibles');

  const { datos, cargando, error, recargar } = useRecurso<FichaArticulo>(
    () => api.pedir<FichaArticulo>(`/articulos/${id}`), [id],
  );

  if (cargando) return <Cargando que="el articulo" />;
  if (error !== null) return <Fallo error={error} alReintentar={recargar} />;
  if (datos === null) return <Fallo error={null} alReintentar={recargar} />;

  const articulo = datos;
  const reincide = articulo.historial.length > 1;

  return (
    <>
      <h2 className="scr">{articulo.marca} {articulo.modelo ?? ''}</h2>
      <p className="sub">
        Serie {articulo.numeroSerie ?? 'no legible'} ·{' '}
        <Link to={`/clientes/${articulo.idCliente}`}>{articulo.cliente}</Link> ·{' '}
        {articulo.historial.length} servicios registrados
      </p>

      <Tarjeta
        titulo="Datos de compra"
        extra="determinan quien paga · solo jefatura"
        acento="var(--blue)"
      >
        <div className="g g4">
          <div>
            <label>Tienda de origen</label>
            <input
              value={articulo.tiendaOrigen + (articulo.tiendaPerteneceAlGrupo ? '' : ' (externa)')}
              readOnly
            />
          </div>
          <div>
            <label>Fecha de compra</label>
            <input value={fechaCorta(articulo.fechaCompra)} readOnly />
          </div>
          <div><label>Marca</label><input value={articulo.marca} readOnly /></div>
          <div>
            <label>Factura</label>
            <input value={articulo.facturaReferencia ?? 'sin adjuntar'} readOnly />
          </div>
        </div>

        <Aviso>
          <b>Estos tres campos cambian quien paga la reparacion.</b> Un articulo comprado en el
          grupo lo cubre el proveedor; el mismo articulo como externo lo paga el cliente.
          Modificarlos exige rol de jefatura y motivo escrito, queda en bitacora inmutable y{' '}
          <b>reevalua las ordenes abiertas del articulo</b> (RF-78, RN-24).
        </Aviso>

        {puedeCorregir ? (
          <div className="tools">
            <button type="button" className="btn amber" disabled>
              Corregir con motivo
            </button>
            <span style={{ fontSize: 11.5, color: 'var(--soft)', alignSelf: 'center' }}>
              La correccion se registra desde la pantalla de administracion.
            </span>
          </div>
        ) : (
          <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '10px 0 0' }}>
            Su perfil no puede corregir estos campos. Solicitelo a la jefatura.
          </p>
        )}
      </Tarjeta>

      <Tarjeta titulo="Coberturas">
        {articulo.coberturas.length === 0 ? (
          <Vacio>Este articulo no tiene coberturas registradas.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr><th>Tipo</th><th>Vigencia</th><th>Documento</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {articulo.coberturas.map((cobertura) => (
                <tr key={cobertura.id}>
                  <td><Garantia tipo={cobertura.tipo} /></td>
                  <td>
                    {fechaCorta(cobertura.vigenteDesde)} – {fechaCorta(cobertura.vigenteHasta)}
                  </td>
                  <td className="tenue">{cobertura.documentoRespaldo ?? '—'}</td>
                  <td>
                    {cobertura.activa
                      ? <span className="tag t-t">Vigente</span>
                      : <span className="tag t-g">No vigente</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '10px 0 0' }}>
          La garantia de proveedor acompana al <b>articulo</b>; la poliza extendida acompana al{' '}
          <b>contratante</b> (RN-28). Ninguna de las dos se traslada si el articulo se revende.
        </p>
      </Tarjeta>

      <Tarjeta titulo="Historial de servicios" extra="acompana al articulo, no al dueno">
        {articulo.historial.length === 0 ? (
          <Vacio>Sin servicios anteriores.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr><th>Orden</th><th>Fecha</th><th>Falla</th><th>Garantia</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {articulo.historial.map((orden) => (
                <tr key={orden.id}>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                    <Link to={`/ordenes/${orden.id}`}>{orden.numero}</Link>
                  </td>
                  <td className="tenue">{fechaCorta(orden.fechaRecepcion)}</td>
                  <td>{orden.fallaReportada}</td>
                  <td><Garantia tipo={orden.tipoGarantia} /></td>
                  <td><span className="tag t-g">{orden.estado.replace(/_/g, ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {reincide ? (
          <Aviso tono="warn">
            <b>Este articulo ha vuelto al taller {articulo.historial.length} veces.</b> La
            reincidencia es un dato que el proveedor examina al evaluar el reclamo, y aparece
            entre los indicadores de gestion.
          </Aviso>
        ) : null}
      </Tarjeta>

      <div className="tools">
        <Link className="btn pri" to={`/ordenes/nueva?idCliente=${articulo.idCliente}`}>
          Abrir orden para este cliente
        </Link>
        <Link className="btn" to={`/clientes/${articulo.idCliente}`}>Volver a la ficha</Link>
      </div>
    </>
  );
}
