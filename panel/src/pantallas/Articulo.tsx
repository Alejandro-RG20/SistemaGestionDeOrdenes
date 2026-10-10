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
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { esFechaValida, ultimoDiaCubierto, type ConsultaGarantias, type FichaArticulo } from '@servitotal/compartido';
import { ErrorDeApi } from '../api/cliente.js';
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
  // Estado informativo de las garantias (vigencia, vencimiento). No decide
  // la garantia de ninguna orden. Si el perfil no puede consultarlo, no se pide.
  const puedeEvaluar = tienePermiso(usuario, 'garantias.evaluar');
  const [version, setVersion] = useState(0);
  const evaluacion = useRecurso<ConsultaGarantias | null>(
    () => (puedeEvaluar
      ? api.pedir<ConsultaGarantias>('/coberturas/evaluar', { metodo: 'POST', cuerpo: { idArticulo: id } }).catch(() => null)
      : Promise.resolve(null)),
    [id, puedeEvaluar, version],
  );
  const [formulario, setFormulario] = useState<'compra' | 'garantia' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [compra, setCompra] = useState({ fechaCompra: '', motivo: '' });
  const [garantia, setGarantia] = useState({ tipo: 'proveedor', vigenteDesde: '', vigenteHasta: '', meses: '', documentoRespaldo: '' });
  // Con meses, el vencimiento lo calcula el servidor; esto es solo la vista previa (misma funcion).
  const mesesGarantia = Number(garantia.meses);
  const venceCalculado = garantia.meses !== '' && esFechaValida(garantia.vigenteDesde) && Number.isInteger(mesesGarantia)
    && mesesGarantia >= 1 && mesesGarantia <= 120 ? ultimoDiaCubierto(garantia.vigenteDesde, mesesGarantia) : null;

  async function enviar(ruta: string, metodo: 'POST' | 'PUT', cuerpo: unknown, mensaje: string): Promise<void> {
    setGuardando(true); setFalla(null); setAviso(null);
    try {
      await api.pedir(ruta, { metodo, cuerpo });
      setAviso(mensaje);
      setFormulario(null);
      recargar();
      setVersion((v) => v + 1);
    } catch (problema) {
      setFalla(problema instanceof ErrorDeApi ? problema.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

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
          <b>Estos tres campos determinan la vigencia de las garantias del articulo.</b> Modificarlos
          exige rol de jefatura y motivo escrito y queda en bitacora inmutable. <b>La garantia de las
          ordenes ya creadas no cambia</b>: las abiertas reciben una nota y, si corresponde, se
          reclasifican con motivo.
        </Aviso>

        {puedeCorregir ? (
          <>
            <div className="tools">
              <button type="button" className="btn amber" onClick={() => { setFormulario('compra'); setCompra({ fechaCompra: articulo.fechaCompra ?? '', motivo: '' }); }}>
                Corregir fecha de compra con motivo
              </button>
            </div>
            {formulario === 'compra' ? (
              <div className="g g3" style={{ marginTop: 8 }}>
                <div><label>Fecha de compra</label><input type="date" value={compra.fechaCompra} onChange={(e) => setCompra({ ...compra, fechaCompra: e.target.value })} /></div>
                <div><label>Motivo * (minimo 10)</label><input value={compra.motivo} onChange={(e) => setCompra({ ...compra, motivo: e.target.value })} /></div>
                <div className="tools" style={{ alignSelf: 'end' }}>
                  <button
                    type="button" className="btn pri" disabled={guardando || compra.motivo.trim().length < 10}
                    onClick={() => {
                      void enviar(`/articulos/${articulo.id}/datos-sensibles`, 'PUT', {
                        fechaCompra: compra.fechaCompra === '' ? null : compra.fechaCompra, motivo: compra.motivo.trim(),
                      }, 'Fecha de compra corregida. La garantia de las ordenes ya creadas no cambia: las abiertas recibieron una nota para revisarla.');
                    }}
                  >
                    Guardar
                  </button>
                  <button type="button" className="btn" onClick={() => setFormulario(null)}>Cancelar</button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '10px 0 0' }}>
            Su perfil no puede corregir estos campos. Solicitelo a la jefatura.
          </p>
        )}
      </Tarjeta>

      {aviso === null ? null : <Aviso tono="ok">{aviso}</Aviso>}
      {falla === null ? null : <Aviso tono="warn">{falla}</Aviso>}

      {evaluacion.datos === null || evaluacion.datos === undefined ? null : (
        <Tarjeta titulo="Garantias del articulo hoy" extra="informativo: la garantia de cada orden la elige quien la registra">
          <table className="d">
            <thead><tr><th>Garantia</th><th>Desde</th><th>Meses</th><th>Vence</th><th>Vigencia</th><th>Aplica al titular</th></tr></thead>
            <tbody>
              {(['proveedor', 'adicional'] as const).map((clave) => {
                const estado = evaluacion.datos!.garantias[clave];
                return (
                  <tr key={clave}>
                    <td>{clave === 'proveedor' ? 'Del proveedor (fabricante)' : 'Adicional'}</td>
                    <td>{estado.desde ?? '—'} <small className="tenue">{clave === 'proveedor' ? 'compra' : 'contratacion'}</small></td>
                    <td>{estado.meses ?? '—'}</td>
                    <td>{estado.venceEl ?? '—'}</td>
                    <td>{estado.vigencia.replace(/_/g, ' ')}
                      {estado.origen === 'regla' ? <small className="tenue"> (duracion de referencia)</small> : null}</td>
                    <td>{estado.aplicable ? 'si' : <span className="tenue">no · {estado.motivo}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Tarjeta>
      )}

      <Tarjeta titulo="Coberturas">
        {articulo.coberturas.length === 0 ? (
          <Vacio>Este articulo no tiene coberturas registradas.</Vacio>
        ) : (
          <table className="d">
            <thead>
              <tr><th>Tipo</th><th>Vigencia</th><th>Documento</th><th>Estado</th>{puedeCorregir ? <th></th> : null}</tr>
            </thead>
            <tbody>
              {articulo.coberturas.map((cobertura) => (
                <tr key={cobertura.id}>
                  <td><Garantia tipo={cobertura.tipo} /></td>
                  <td>
                    {fechaCorta(cobertura.vigenteDesde)} – {fechaCorta(cobertura.vigenteHasta)}
                    {cobertura.meses === null ? null : <small className="tenue"> · {cobertura.meses} meses</small>}
                  </td>
                  <td className="tenue">{cobertura.documentoRespaldo ?? '—'}</td>
                  <td>
                    {cobertura.activa
                      ? <span className="tag t-t">Vigente</span>
                      : <span className="tag t-g">No vigente</span>}
                  </td>
                  {puedeCorregir ? (
                    <td>
                      {cobertura.activa ? (
                        <button
                          type="button" className="btn chico" disabled={guardando}
                          onClick={() => {
                            const motivo = window.prompt('Motivo para desactivar esta cobertura (minimo 10 caracteres). Queda en la bitacora; despues registre la correcta.');
                            if (motivo === null) return;
                            if (motivo.trim().length < 10) { setFalla('El motivo debe tener al menos 10 caracteres.'); return; }
                            void enviar(`/articulos/${articulo.id}/coberturas/${cobertura.id}/desactivar`, 'POST',
                              { motivo: motivo.trim() }, 'Cobertura desactivada. Registre la correcta si corresponde.');
                          }}
                        >
                          Corregir
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {puedeCorregir ? (
          <div className="tools" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => setFormulario(formulario === 'garantia' ? null : 'garantia')}>
              Registrar fechas de garantia
            </button>
          </div>
        ) : null}
        {formulario === 'garantia' ? (
          <div className="g g4" style={{ marginTop: 8 }}>
            <div>
              <label>Garantia</label>
              <select value={garantia.tipo} onChange={(e) => setGarantia({ ...garantia, tipo: e.target.value })}>
                <option value="proveedor">Del proveedor</option>
                <option value="adicional">Adicional (la que compro el cliente)</option>
              </select>
            </div>
            <div><label>{garantia.tipo === 'adicional' ? 'Fecha de contratacion *' : 'Desde *'}</label><input type="date" value={garantia.vigenteDesde} onChange={(e) => setGarantia({ ...garantia, vigenteDesde: e.target.value })} /></div>
            <div>
              <label>Duracion en meses</label>
              <input type="number" min={1} max={120} value={garantia.meses} onChange={(e) => setGarantia({ ...garantia, meses: e.target.value, vigenteHasta: '' })} />
            </div>
            <div>
              <label>{garantia.meses === '' ? 'Vence *' : 'Vence (calculado)'}</label>
              {garantia.meses === ''
                ? <input type="date" value={garantia.vigenteHasta} onChange={(e) => setGarantia({ ...garantia, vigenteHasta: e.target.value })} />
                : <input readOnly value={venceCalculado ?? '—'} />}
            </div>
            <div><label>Documento de respaldo</label><input value={garantia.documentoRespaldo} onChange={(e) => setGarantia({ ...garantia, documentoRespaldo: e.target.value })} placeholder="Factura, poliza…" /></div>
            <div className="tools">
              <button
                type="button" className="btn pri"
                disabled={guardando || garantia.vigenteDesde === ''
                  || (garantia.meses === '' ? (garantia.vigenteHasta === '' || garantia.vigenteHasta <= garantia.vigenteDesde) : venceCalculado === null)}
                onClick={() => {
                  void enviar(`/articulos/${articulo.id}/coberturas`, 'POST', {
                    tipo: garantia.tipo, vigenteDesde: garantia.vigenteDesde,
                    ...(garantia.meses === '' ? { vigenteHasta: garantia.vigenteHasta } : { meses: mesesGarantia }),
                    documentoRespaldo: garantia.documentoRespaldo.trim() === '' ? null : garantia.documentoRespaldo.trim(),
                  }, 'Garantia registrada. Las ordenes cerradas conservan la cobertura con la que se atendieron.');
                }}
              >
                Guardar garantia
              </button>
              <button type="button" className="btn" onClick={() => setFormulario(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
        <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '10px 0 0' }}>
          Si se registra la garantia del proveedor con sus fechas, esas fechas mandan sobre la duracion de referencia
          de la marca y categoria. Registrar o desactivar una garantia aqui no cambia la de las ordenes ya creadas. La garantia de proveedor acompana al <b>articulo</b>; la poliza extendida acompana al{' '}
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
