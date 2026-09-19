/**
 * M-04 · Evidencia obligatoria.
 *
 * La camara se abre con `<input type="file" capture>`. En un celular eso
 * lanza la camara directamente; en una laptop, el selector de archivos. Es
 * la MISMA pantalla para los dos, que es justo lo que se pidio: que no
 * importe si el tecnico anda con celular o con computadora, y que no tenga
 * que instalar nada.
 *
 * La lista de comprobacion no es un recordatorio amable. Sin la fotografia
 * de la pieza dañada, el proveedor rechaza el expediente y el centro come
 * el costo del repuesto. Por eso se dice cuanto vale la falta —en cordobas
 * no, porque aqui no se sabe, pero si en consecuencias— en vez de un
 * «campo obligatorio» que no explica nada.
 *
 * Lo que se muestra como hecho sale de la union de dos fuentes: lo que el
 * servidor ya tenia al bajar la ruta y lo capturado aqui sin señal. Ninguna
 * de las dos basta sola.
 */
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCampo } from '../../campo/contexto.js';
import { Aviso, Garantia } from '../../componentes/piezas.js';
import { BarraDeSincronizacion, Pasos } from '../../componentes/ArmazonCampo.js';
import { prepararEvidencia, ubicacionSiLlegaRapido } from '../../campo/captura-evidencia.js';
import { useDelCampo } from './datos.js';

/** Un identificador local para el archivo, sin depender del servidor. */
function nuevoIdentificador(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((octeto) => octeto.toString(16).padStart(2, '0')).join('');
}

export function Evidencia(): JSX.Element {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { campo, refrescar } = useCampo();

  const { datos, cargando, recargar } = useDelCampo(async (coordinador) => {
    const orden = await coordinador.orden(id);
    if (orden === null) return null;
    return { orden, reglas: await coordinador.evidenciaRequerida(orden) };
  }, [id]);

  const entrada = useRef<HTMLInputElement>(null);
  const [claveEnCurso, setClaveEnCurso] = useState<string | null>(null);
  const [comoDocumento, setComoDocumento] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  if (cargando) return <p className="sub">Leyendo la orden guardada…</p>;
  if (datos === null) return <Aviso tono="warn">Esta orden no esta en la ruta que bajo.</Aviso>;

  const { orden, reglas } = datos;
  const capturadas = new Set(orden.evidenciasRegistradas);
  const faltantes = reglas.filter((regla) => !capturadas.has(regla.clave));
  const bloqueantes = faltantes.filter((regla) => regla.bloqueaAvance);

  /**
   * Se abre la camara o el selector segun lo que la regla pida.
   *
   * Una fotografia del compresor sale de la camara; una factura de compra,
   * casi siempre de la galeria o de un PDF que le mandaron al telefono.
   * Forzar la camara para un documento obligaria al tecnico a fotografiar
   * la pantalla de su propio celular.
   */
  const pedirArchivo = (clave: string, tipoArchivo: string): void => {
    setClaveEnCurso(clave);
    setComoDocumento(tipoArchivo === 'documento');
    setFallo(null);
    // El atributo se aplica antes de abrir el dialogo, no en el render
    // siguiente: para cuando React repinte, el selector ya se abrio.
    requestAnimationFrame(() => entrada.current?.click());
  };

  const recibirArchivo = async (archivo: File): Promise<void> => {
    if (campo === null || claveEnCurso === null) return;
    const regla = reglas.find((cada) => cada.clave === claveEnCurso);
    setTrabajando(true);
    setFallo(null);
    try {
      // La ubicacion se adjunta si llega rapido. Bajo un techo de zinc el
      // GPS tarda un minuto, y detener al tecnico por una coordenada seria
      // cambiar el registro —que si importa— por un adorno.
      const ubicacion = await ubicacionSiLlegaRapido();
      const preparada = await prepararEvidencia(campo.archivos, {
        idLocal: nuevoIdentificador(),
        idOrden: orden.id,
        clave: claveEnCurso,
        tipo: regla?.tipoArchivo ?? 'foto',
        archivo,
        latitud: ubicacion?.latitud ?? null,
        longitud: ubicacion?.longitud ?? null,
      });
      await campo.coordinador.registrarEvidencia(preparada);
      await refrescar();
      recargar();
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se pudo guardar la fotografia.');
    } finally {
      setTrabajando(false);
      setClaveEnCurso(null);
    }
  };

  return (
    <>
      <BarraDeSincronizacion />
      <Pasos de={3} />

      <h2 className="scr">Evidencia obligatoria</h2>
      <p className="sub">
        N.º {orden.numero} · lo que exige la garantia <Garantia tipo={orden.tipoGarantia} />
      </p>

      {/*
        Una sola entrada de archivo para toda la pantalla: se reusa y se
        limpia. `capture` es una sugerencia al navegador, no una orden — en
        laptop simplemente se ignora y abre el selector, que es lo que se
        quiere. Para un documento ni se pone, porque ahi la galeria y los
        archivos son la fuente normal.
      */}
      <input
        ref={entrada}
        type="file"
        accept={comoDocumento ? 'image/*,application/pdf' : 'image/*'}
        {...(comoDocumento ? {} : { capture: 'environment' as const })}
        style={{ display: 'none' }}
        onChange={(evento) => {
          const archivo = evento.target.files?.[0];
          evento.target.value = '';
          if (archivo !== undefined) void recibirArchivo(archivo);
        }}
      />

      {fallo === null ? null : <Aviso tono="warn">{fallo}</Aviso>}

      <div className="card">
        <h3>Capturas requeridas</h3>
        {reglas.length === 0
          ? (
            <p style={{ fontSize: 12, color: 'var(--soft)', margin: 0 }}>
              Esta garantia no exige evidencia obligatoria. Puede tomar fotografias igual si
              cree que van a hacer falta.
            </p>
          )
          : null}
        {reglas.map((regla) => {
          const hecha = capturadas.has(regla.clave);
          return (
            <div
              key={regla.clave}
              className={hecha ? 'ev done' : (regla.bloqueaAvance ? 'ev miss' : 'ev')}
            >
              <span aria-hidden="true">{hecha ? '✓' : '○'}</span>
              <span>{regla.etiqueta}</span>
              <em>{hecha ? 'capturada' : (regla.bloqueaAvance ? 'obligatoria' : 'opcional')}</em>
            </div>
          );
        })}

        {faltantes.length > 0
          ? (
            <div className="tools" style={{ marginTop: 10 }}>
              {faltantes.map((regla) => (
                <button
                  key={regla.clave}
                  type="button"
                  className="btn teal"
                  disabled={trabajando}
                  onClick={() => pedirArchivo(regla.clave, regla.tipoArchivo)}
                >
                  {trabajando && claveEnCurso === regla.clave
                    ? 'Guardando…'
                    : `Tomar: ${regla.etiqueta}`}
                </button>
              ))}
            </div>
          )
          : null}
      </div>

      {bloqueantes.length > 0
        ? (
          <Aviso tono="warn">
            <b>
              {bloqueantes.length === 1
                ? 'Falta 1 evidencia obligatoria.'
                : `Faltan ${bloqueantes.length} evidencias obligatorias.`}
            </b>
            {' '}
            Sin ellas el expediente de cobro se rechaza y el costo del repuesto lo come el
            centro. Tomelas <b>antes de despedirse del cliente</b>: volver cuesta otra visita.
          </Aviso>
        )
        : (
          <Aviso tono="ok">
            <b>La evidencia obligatoria esta completa.</b> Cada una quedo con su autor, su
            fecha, su hora y su huella digital, que es lo que la vuelve util ante el
            proveedor.
          </Aviso>
        )}

      <div className="stickybar">
        <button
          type="button"
          className="btn teal"
          disabled={bloqueantes.length > 0}
          onClick={() => navegar(`/campo/ordenes/${orden.id}/repuestos`)}
        >
          {bloqueantes.length > 0 ? 'Falta evidencia obligatoria' : 'Continuar a repuestos'}
        </button>
      </div>
    </>
  );
}
