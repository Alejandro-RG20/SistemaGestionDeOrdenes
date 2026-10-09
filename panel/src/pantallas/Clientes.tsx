/**
 * Clientes, con busqueda incremental (RF-07).
 *
 * La busqueda espera a que la persona deje de teclear. Sin eso, escribir
 * "Maria Gonzalez" dispara catorce consultas y las respuestas llegan
 * desordenadas, de modo que la lista termina mostrando los resultados de
 * "Maria Gonzal". El retardo no es por ahorrar servidor: es para que lo que
 * se ve corresponda a lo que esta escrito.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CatalogosDeApoyo, FichaCliente, ResumenCliente } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio } from '../componentes/piezas.js';
import { ErrorDeApi, type PaginaDeDatos } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';

/** Lo que se espera desde la ultima tecla. */
const RETARDO_MS = 300;

export function Clientes(): JSX.Element {
  const { api, usuario } = useSesion();
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [conDesactivados, setConDesactivados] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [registrando, setRegistrando] = useState(false);
  const puedeCrear = tienePermiso(usuario, 'clientes.crear');

  useEffect(() => {
    const temporizador = setTimeout(() => setConsulta(texto.trim()), RETARDO_MS);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const { datos, cargando, error, recargar } = useRecurso<PaginaDeDatos<ResumenCliente>>(
    () => api.pedirPagina<ResumenCliente>('/clientes', {
      texto: consulta === '' ? undefined : consulta,
      // Un numero de ocho digitos se busca tambien como telefono exacto: el
      // nombre no lo contiene, y es lo primero que dicta quien llama.
      ...(/^\d{8}$/.test(consulta.replace(/[\s-]/g, ''))
        ? { texto: undefined, telefono: consulta.replace(/[\s-]/g, '') } : {}),
      soloActivos: conDesactivados ? 'false' : undefined,
      pagina,
    }),
    [consulta, conDesactivados, pagina],
  );

  // Cambiar la busqueda devuelve a la primera pagina.
  useEffect(() => { setPagina(1); }, [consulta, conDesactivados]);

  return (
    <>
      <h2 className="scr">Clientes</h2>
      <p className="sub">
        Busque por nombre, identificacion o telefono. La busqueda ignora acentos y mayusculas.
      </p>

      <div className="filtros">
        <div style={{ minWidth: 320 }}>
          <label htmlFor="texto">Buscar</label>
          <input
            id="texto"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Maria Gonzalez, 001-120380, 8888-7777"
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="desactivados">Incluir</label>
          <select
            id="desactivados"
            value={conDesactivados ? '1' : ''}
            onChange={(evento) => setConDesactivados(evento.target.value === '1')}
          >
            <option value="">Solo activos</option>
            <option value="1">Activos y desactivados</option>
          </select>
        </div>
      </div>

      {puedeCrear ? (
        <div className="tools" style={{ marginBottom: 12 }}>
          <button type="button" className="btn pri" onClick={() => setRegistrando(!registrando)}>
            {registrando ? 'Cancelar registro' : 'Registrar cliente'}
          </button>
        </div>
      ) : null}
      {registrando ? <RegistroDeCliente alCancelar={() => setRegistrando(false)} /> : null}

      {cargando ? <Cargando que="los clientes" /> : null}
      {error !== null ? <Fallo error={error} alReintentar={recargar} /> : null}

      {datos !== null && error === null ? (
        datos.datos.length === 0 ? (
          <Vacio>
            {consulta === ''
              ? 'Escriba algo para buscar.'
              : `Ningun cliente coincide con "${consulta}".`}
          </Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Identificacion</th>
                <th>Telefono</th>
                <th>Direccion</th>
                <th>Estado</th>
                <th>Ordenes</th>
              </tr>
            </thead>
            <tbody>
              {datos.datos.map((cliente) => (
                <tr key={cliente.id}>
                  <td>
                    <Link to={`/clientes/${cliente.id}`}>
                      {cliente.nombres} {cliente.apellidos ?? ''}
                    </Link>
                    {cliente.idClientePrincipal === null ? null : (
                      <span className="tag t-a" style={{ marginLeft: 8 }}>
                        fusionado
                      </span>
                    )}
                  </td>
                  <td className="tenue">{cliente.identificacion ?? '—'}</td>
                  <td>{cliente.telefonoVigente ?? '—'}</td>
                  <td className="tenue">{cliente.direccionPrincipal ?? '—'}</td>
                  <td>
                    {cliente.activo
                      ? <span className="tag t-t">Activo</span>
                      : <span className="tag t-g">Desactivado</span>}
                  </td>
                  <td>
                    <Link to={`/ordenes?idCliente=${cliente.id}`}>Ver ordenes</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      {datos !== null && datos.paginacion.totalPaginas > 1 ? (
        <div className="paginacion">
          <button
            type="button" className="btn chico" disabled={pagina <= 1}
            onClick={() => setPagina(pagina - 1)}
          >
            Anterior
          </button>
          <span>Pagina {datos.paginacion.pagina} de {datos.paginacion.totalPaginas}</span>
          <button
            type="button" className="btn chico" disabled={pagina >= datos.paginacion.totalPaginas}
            onClick={() => setPagina(pagina + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Alta de cliente. El servidor revisa los duplicados: la misma
 * identificacion se rechaza; el mismo telefono vigente se rechaza salvo que
 * quien registra confirme que es otra persona. En ambos casos se ofrece
 * abrir la ficha que ya existe.
 */
function RegistroDeCliente({ alCancelar }: { alCancelar: () => void }): JSX.Element {
  const { api } = useSesion();
  const navegar = useNavigate();
  const catalogos = useRecurso<CatalogosDeApoyo | null>(
    () => api.pedir<CatalogosDeApoyo>('/catalogos').catch(() => null), [],
  );
  const [datos, setDatos] = useState({
    nombres: '', apellidos: '', identificacion: '', correo: '', telefono: '',
    detalle: '', referencia: '', idZona: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [existente, setExistente] = useState<{ id: string; porTelefono: boolean } | null>(null);

  const poner = (clave: keyof typeof datos) =>
    (evento: { target: { value: string } }) => setDatos({ ...datos, [clave]: evento.target.value });

  const vacioANulo = (valor: string): string | null => (valor.trim() === '' ? null : valor.trim());

  async function guardar(confirmarDuplicado: boolean): Promise<void> {
    setGuardando(true);
    setError(null);
    setCampos({});
    try {
      const creado = await api.pedir<FichaCliente>('/clientes', {
        metodo: 'POST',
        cuerpo: {
          nombres: datos.nombres.trim(),
          apellidos: vacioANulo(datos.apellidos),
          identificacion: vacioANulo(datos.identificacion),
          correo: vacioANulo(datos.correo),
          telefono: datos.telefono,
          direccion: datos.detalle.trim() === '' ? null : {
            detalle: datos.detalle.trim(),
            referencia: vacioANulo(datos.referencia),
            idZona: datos.idZona === '' ? null : datos.idZona,
          },
          confirmarDuplicado,
        },
      });
      navegar(`/clientes/${creado.id}`);
    } catch (fallo) {
      if (fallo instanceof ErrorDeApi) {
        setError(fallo.message);
        if (fallo.codigo === 'CLIENTE_DUPLICADO' && fallo.campos?.['identificacion'] !== undefined) {
          setExistente({ id: fallo.campos['identificacion'], porTelefono: false });
        } else if (fallo.codigo === 'CLIENTE_POSIBLE_DUPLICADO' && fallo.campos?.['telefono'] !== undefined) {
          setExistente({ id: fallo.campos['telefono'], porTelefono: true });
        } else {
          setExistente(null);
          setCampos(fallo.campos ?? {});
        }
      } else {
        setError('No se pudo registrar el cliente.');
      }
    } finally {
      setGuardando(false);
    }
  }

  const listo = datos.nombres.trim().length >= 2 && datos.telefono.replace(/[\s-]/g, '').length === 8;
  const pista = (clave: string): JSX.Element | null =>
    (campos[clave] === undefined ? null : <small style={{ color: 'var(--red)' }}>{campos[clave]}</small>);

  return (
    <Tarjeta titulo="Registrar cliente">
      {error === null ? null : (
        <Aviso tono="warn">
          {error}
          {existente === null ? null : (
            <>
              {' '}<Link to={`/clientes/${existente.id}`}>Abrir la ficha existente</Link>
              {existente.porTelefono ? (
                <>
                  {' · '}
                  <a style={{ cursor: 'pointer' }} onClick={() => { void guardar(true); }}>
                    Es otra persona: registrar de todos modos
                  </a>
                </>
              ) : null}
            </>
          )}
        </Aviso>
      )}
      <div className="g g3">
        <div><label>Nombres *</label><input value={datos.nombres} onChange={poner('nombres')} />{pista('nombres')}</div>
        <div><label>Apellidos</label><input value={datos.apellidos} onChange={poner('apellidos')} />{pista('apellidos')}</div>
        <div>
          <label>Identificacion</label>
          <input value={datos.identificacion} onChange={poner('identificacion')} placeholder="001-120380-0001A" />
          {pista('identificacion')}
        </div>
        <div>
          <label>Telefono *</label>
          <input value={datos.telefono} onChange={poner('telefono')} placeholder="8888 7777" inputMode="tel" />
          {pista('telefono')}
        </div>
        <div><label>Correo</label><input value={datos.correo} onChange={poner('correo')} type="email" />{pista('correo')}</div>
        {catalogos.datos === null ? null : (
          <div>
            <label>Zona</label>
            <select value={datos.idZona} onChange={poner('idZona')}>
              <option value="">Sin zona</option>
              {catalogos.datos.zonas.map((zona) => (
                <option key={zona.id} value={zona.id}>{zona.nombre}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="g g3" style={{ marginTop: 8 }}>
        <div><label>Direccion</label><input value={datos.detalle} onChange={poner('detalle')} />{pista('detalle')}</div>
        <div><label>Referencia</label><input value={datos.referencia} onChange={poner('referencia')} /></div>
      </div>
      <div className="tools" style={{ marginTop: 10 }}>
        <button
          type="button" className="btn pri" disabled={!listo || guardando}
          onClick={() => { void guardar(false); }}
        >
          {guardando ? 'Guardando…' : 'Guardar cliente'}
        </button>
        <button type="button" className="btn" onClick={alCancelar}>Cancelar</button>
      </div>
    </Tarjeta>
  );
}
