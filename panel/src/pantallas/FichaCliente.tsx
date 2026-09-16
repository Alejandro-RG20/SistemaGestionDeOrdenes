/**
 * W-13 · Ficha del cliente.
 *
 * Lo que el prototipo demuestra aqui es **datos vivos frente a datos
 * congelados**, y por eso la pantalla lo dice con todas las letras en vez
 * de dejarlo a la intuicion:
 *
 *  - El nombre y el telefono son VIVOS: se actualizan en todas partes.
 *  - La direccion, la zona y el cargo por visita quedaron COPIADOS en cada
 *    orden al programarse. Cambiarlos aqui no altera una sola orden ya
 *    abierta, y eso no es un defecto: es lo que impide que un expediente
 *    presentado al proveedor deje de coincidir con lo que se presento.
 */
import { Link, useParams } from 'react-router-dom';
import type { FichaCliente as Ficha, ResumenArticulo, ResumenOrden } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import {
  Aviso, Cargando, EtiquetaEstado, Fallo, Garantia, Tarjeta, Vacio, fechaCorta,
} from '../componentes/piezas.js';
import type { PaginaDeDatos } from '../api/cliente.js';

export function FichaCliente(): JSX.Element {
  const { id = '' } = useParams();
  const { api } = useSesion();

  const ficha = useRecurso<Ficha>(() => api.pedir<Ficha>(`/clientes/${id}`), [id]);
  const articulos = useRecurso<PaginaDeDatos<ResumenArticulo>>(
    () => api.pedirPagina<ResumenArticulo>('/articulos', { idCliente: id, tamano: 50 }), [id],
  );
  const ordenes = useRecurso<PaginaDeDatos<ResumenOrden>>(
    () => api.pedirPagina<ResumenOrden>('/ordenes', { idCliente: id, tamano: 25 }), [id],
  );

  if (ficha.cargando) return <Cargando que="la ficha" />;
  if (ficha.error !== null) return <Fallo error={ficha.error} alReintentar={ficha.recargar} />;
  if (ficha.datos === null) return <Fallo error={null} alReintentar={ficha.recargar} />;

  const cliente = ficha.datos;

  return (
    <>
      <h2 className="scr">{cliente.nombres} {cliente.apellidos ?? ''}</h2>
      <p className="sub">
        {cliente.cantidadOrdenes} ordenes · {cliente.cantidadArticulos} articulos registrados
        {cliente.activo ? '' : ' · cliente desactivado'}
      </p>

      {cliente.idClientePrincipal === null ? null : (
        <Aviso tono="warn">
          Este registro fue <b>fusionado</b> en otro cliente. Se conserva porque sustenta
          ordenes ya cerradas, pero no debe usarse para abrir ninguna nueva.
        </Aviso>
      )}

      <Tarjeta titulo="Datos personales" extra="datos vivos · se actualizan en todas partes">
        <div className="g g3">
          <div>
            <label>Nombres y apellidos</label>
            <input value={`${cliente.nombres} ${cliente.apellidos ?? ''}`.trim()} readOnly />
          </div>
          <div>
            <label>Identificacion</label>
            <input value={cliente.identificacion ?? '—'} readOnly />
          </div>
          <div>
            <label>Correo</label>
            <input value={cliente.correo ?? '—'} readOnly />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Telefonos">
        <table className="d">
          <thead>
            <tr><th>Numero</th><th>Tipo</th><th>Estado</th><th>Desde</th></tr>
          </thead>
          <tbody>
            {cliente.telefonos.map((telefono) => (
              <tr key={telefono.id}>
                <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{telefono.numero}</td>
                <td>{telefono.tipo ?? '—'}</td>
                <td>
                  {telefono.vigente
                    ? <span className="tag t-t">Vigente</span>
                    : <span className="tag t-g">Anterior</span>}
                </td>
                <td className="tenue">{fechaCorta(telefono.desde)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Aviso tono="info">
          El numero anterior <b>se conserva</b>: la consulta del portal publico acepta tanto el
          telefono vigente como el que estaba registrado al abrirse cada orden (RF-66).
        </Aviso>
      </Tarjeta>

      <Tarjeta titulo="Direcciones">
        <table className="d">
          <thead>
            <tr><th>Direccion</th><th>Zona</th><th>Referencia</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {cliente.direcciones.map((direccion) => (
              <tr key={direccion.id}>
                <td>{direccion.detalle}</td>
                <td className="tenue">{direccion.zona ?? '—'}</td>
                <td className="tenue">{direccion.referencia ?? '—'}</td>
                <td>
                  {direccion.principal
                    ? <span className="tag t-t">Principal</span>
                    : <span className="tag t-g">Anterior</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Aviso tono="warn">
          <b>Cambiar la direccion no altera las ordenes ya programadas.</b> Cada orden copio la
          direccion, la zona y el cargo por visita vigentes al momento de crearse (RF-73,
          RN-22). La direccion nueva se usara en ordenes futuras.
        </Aviso>
      </Tarjeta>

      <Tarjeta titulo="Articulos del cliente">
        {articulos.cargando ? <Cargando que="los articulos" /> : null}
        {articulos.datos === null || articulos.datos.datos.length === 0 ? (
          <Vacio>Este cliente no tiene articulos registrados.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr>
                <th>Articulo</th><th>N.º de serie</th><th>Tienda</th>
                <th>Compra</th><th>Categoria</th>
              </tr>
            </thead>
            <tbody>
              {articulos.datos.datos.map((articulo) => (
                <tr key={articulo.id}>
                  <td>
                    <Link to={`/articulos/${articulo.id}`}>
                      {articulo.marca} {articulo.modelo ?? ''}
                    </Link>
                  </td>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                    {articulo.numeroSerie ?? (articulo.sinSerieLegible ? 'serie ilegible' : '—')}
                  </td>
                  <td>
                    {articulo.tiendaOrigen}
                    {articulo.tiendaPerteneceAlGrupo
                      ? null
                      : <span className="tag t-a" style={{ marginLeft: 6 }}>externa</span>}
                  </td>
                  <td className="tenue">{fechaCorta(articulo.fechaCompra)}</td>
                  <td className="tenue">{articulo.categoria.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>

      <Tarjeta titulo="Ordenes de este cliente">
        {ordenes.cargando ? <Cargando que="las ordenes" /> : null}
        {ordenes.datos === null || ordenes.datos.datos.length === 0 ? (
          <Vacio>Sin ordenes registradas.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr><th>N.º</th><th>Articulo</th><th>Garantia</th><th>Estado</th><th>Recepcion</th></tr>
            </thead>
            <tbody>
              {ordenes.datos.datos.map((orden) => (
                <tr key={orden.id}>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                    <Link to={`/ordenes/${orden.id}`}>{orden.numero}</Link>
                  </td>
                  <td>{orden.articulo}</td>
                  <td><Garantia tipo={orden.tipoGarantia} /></td>
                  <td><EtiquetaEstado estado={orden.estado} /></td>
                  <td className="tenue">{fechaCorta(orden.fechaRecepcion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>

      <div className="tools">
        <Link className="btn pri" to={`/ordenes/nueva?idCliente=${cliente.id}`}>
          Nueva orden para este cliente
        </Link>
        <Link className="btn" to="/clientes">Volver</Link>
      </div>

      <Aviso>
        <b>Desactivar no es eliminar.</b> Un cliente desactivado deja de aparecer en busquedas y
        no puede usarse en ordenes nuevas, pero sus ordenes, sus articulos y sus coberturas
        permanecen intactos porque sustentan expedientes de cobro ya presentados (RN-21).
      </Aviso>
    </>
  );
}
