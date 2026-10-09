/**
 * Las evidencias de una orden, y la carga desde el panel.
 *
 * La aplicacion del tecnico carga evidencia sin conexion, por su cola. Esta
 * pantalla es para quien trabaja en linea en el centro: la recepcion
 * fotografia el articulo que llega y la placa con la serie, el taller sube
 * la prueba de funcionamiento, el mostrador la firma de entrega.
 *
 * NO SE SIMULA NADA. La evidencia solo se da por guardada cuando el
 * servidor confirma que el archivo llego entero y que su huella coincide;
 * hasta entonces la pantalla dice «subiendo» y, si algo falla, dice que
 * fallo. El servidor ademas comprueba que el contenido sea de verdad una
 * imagen o un PDF, no solo que se llame asi.
 */
import { useState } from 'react';
import type { EvidenciaDeOrden } from '@servitotal/compartido';
import { useSesion } from '../sesion/contexto.js';
import { useRecurso } from '../componentes/recurso.js';
import { Aviso, Cargando, Fallo, Tarjeta, Vacio, fechaHora } from '../componentes/piezas.js';
import { ErrorDeApi } from '../api/cliente.js';
import { tienePermiso } from '../sesion/navegacion.js';
import { comprimir, huellaDe } from '../campo/captura-evidencia.js';

/** Lo mas grande que se acepta desde el panel. El servidor admite hasta 50 MB. */
const MAXIMO_BYTES = 15 * 1024 * 1024;
const TAMANO_DE_PARTE = 512 * 1024;
const TIPOS_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

/** Las evidencias que se toman en cada etapa del proceso. */
const CLAVES: readonly (readonly [etapa: string, clave: string, etiqueta: string, tipo: string])[] = [
  ['Recepcion', 'foto_articulo', 'Fotografia del articulo recibido', 'foto'],
  ['Recepcion', 'foto_placa_serie', 'Placa con modelo y numero de serie', 'foto'],
  ['Recepcion', 'factura_compra', 'Factura o comprobante de compra (garantia)', 'documento'],
  ['Recepcion', 'poliza_extendida', 'Poliza de garantia extendida', 'documento'],
  ['Diagnostico', 'foto_falla', 'Evidencia de la falla', 'foto'],
  ['Diagnostico', 'informe_tecnico', 'Informe tecnico del diagnostico', 'documento'],
  ['Diagnostico', 'medicion_diagnostico', 'Medicion o prueba del diagnostico', 'medicion'],
  ['Diagnostico', 'firma_cotizacion', 'Autorizacion firmada del cliente', 'firma'],
  ['Repuestos', 'foto_repuesto_entregado', 'Repuesto entregado al tecnico', 'foto'],
  ['Reparacion', 'foto_reparacion', 'Proceso de reparacion', 'foto'],
  ['Reparacion', 'foto_pieza_sustituida', 'Pieza retirada del articulo', 'foto'],
  ['Pruebas', 'prueba_funcionamiento', 'Resultado de la prueba de funcionamiento', 'medicion'],
  ['Pruebas', 'foto_reparado', 'Producto reparado', 'foto'],
  ['Entrega', 'firma_cliente', 'Firma de conformidad del cliente', 'firma'],
  ['Entrega', 'foto_entrega', 'Fotografia del articulo entregado', 'foto'],
];

function etiquetaDe(clave: string): string {
  return CLAVES.find(([, c]) => c === clave)?.[2] ?? clave.replace(/_/g, ' ');
}

export function EvidenciasDeOrden(
  { idOrden, cerrada }: { idOrden: string; cerrada: boolean },
): JSX.Element {
  const { api, usuario } = useSesion();
  const puedeCargar = tienePermiso(usuario, 'campo.evidencia.cargar') && !cerrada;

  const evidencias = useRecurso<readonly EvidenciaDeOrden[]>(
    () => api.pedir<readonly EvidenciaDeOrden[]>(`/ordenes/${idOrden}/evidencias`), [idOrden],
  );

  const [clave, setClave] = useState(CLAVES[0]![1]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function subir(): Promise<void> {
    setFallo(null);
    setExito(null);
    if (archivo === null) { setFallo('Elija el archivo a adjuntar.'); return; }
    if (!TIPOS_ADMITIDOS.includes(archivo.type)) {
      setFallo('Solo se admiten fotografias (JPEG, PNG, WEBP, HEIC) o documentos PDF.');
      return;
    }

    try {
      setProgreso('Preparando el archivo…');
      // Las fotografias se reducen como en el celular: una foto de 12 MB no
      // demuestra mas que una de 1 MB, y sube diez veces mas lento.
      const contenido = archivo.type.startsWith('image/') && archivo.type !== 'image/heic'
        && archivo.type !== 'image/heif'
        ? await comprimir(archivo)
        : archivo;
      if (contenido.size > MAXIMO_BYTES) {
        setFallo(`El archivo pesa ${(contenido.size / 1024 / 1024).toFixed(1)} MB; el maximo es 15 MB.`);
        setProgreso(null);
        return;
      }
      const huella = await huellaDe(contenido);
      const tipo = CLAVES.find(([, c]) => c === clave)?.[3] ?? 'foto';

      const carga = await api.iniciarCarga({
        idOrden, clave, tipo, bytes: contenido.size, huellaDigital: huella,
        momentoDispositivo: new Date().toISOString(),
      });

      const bytes = new Uint8Array(await contenido.arrayBuffer());
      let enviados = carga.bytesRecibidos;
      while (enviados < bytes.length) {
        setProgreso(`Subiendo… ${Math.round((enviados / bytes.length) * 100)} %`);
        const estado = await api.enviarParte(
          carga.idCarga, enviados, bytes.subarray(enviados, enviados + TAMANO_DE_PARTE),
        );
        enviados = estado.bytesRecibidos;
      }

      setProgreso('Verificando la huella…');
      const cerrado = await api.cerrarCarga(carga.idCarga, carga.idEvidencia);
      if (!cerrado.sincronizada) {
        throw new ErrorDeApi('NO_CONFIRMADA', 'El servidor no confirmo el archivo. Vuelva a intentarlo.', 0);
      }
      setExito(`${etiquetaDe(clave)}: guardada y verificada.`);
      setArchivo(null);
      evidencias.recargar();
    } catch (error) {
      setFallo(error instanceof ErrorDeApi || error instanceof Error
        ? error.message
        : 'No se pudo subir la evidencia.');
    } finally {
      setProgreso(null);
    }
  }

  return (
    <>
      {puedeCargar ? (
        <Tarjeta titulo="Adjuntar evidencia">
          <div className="g g3">
            <div>
              <label htmlFor="clave-evidencia">Que se adjunta</label>
              <select id="clave-evidencia" value={clave} onChange={(e) => setClave(e.target.value)}>
                {CLAVES.map(([etapa, c, etiqueta]) => (
                  <option key={c} value={c}>{etapa} · {etiqueta}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="archivo-evidencia">Archivo (imagen o PDF, hasta 15 MB)</label>
              <input
                id="archivo-evidencia"
                type="file"
                accept={TIPOS_ADMITIDOS.join(',')}
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
            </div>
            <div style={{ alignSelf: 'end' }}>
              <button
                type="button" className="btn pri"
                disabled={archivo === null || progreso !== null}
                onClick={() => { void subir(); }}
              >
                {progreso ?? 'Subir evidencia'}
              </button>
            </div>
          </div>
          {fallo === null ? null : <Aviso tono="warn">{fallo}</Aviso>}
          {exito === null ? null : <Aviso tono="ok">{exito}</Aviso>}
        </Tarjeta>
      ) : null}

      <Tarjeta titulo="Evidencias de la orden">
        {evidencias.cargando ? <Cargando que="la evidencia" /> : null}
        {evidencias.error !== null
          ? <Fallo error={evidencias.error} alReintentar={evidencias.recargar} />
          : null}
        {evidencias.datos !== null && evidencias.datos.length === 0 ? (
          <Vacio>Todavia no se ha cargado evidencia de esta orden.</Vacio>
        ) : null}
        {(evidencias.datos ?? []).map((evidencia) => (
          <div key={evidencia.id} className={evidencia.sincronizada ? 'ev done' : 'ev'}>
            <span>{evidencia.sincronizada ? '✓' : '◇'}</span>
            <span>
              {etiquetaDe(evidencia.clave)} · {evidencia.tipo}
              {evidencia.sincronizada ? '' : ' · archivo pendiente de subir'}
            </span>
            <em>{evidencia.autor ?? '—'} · {fechaHora(evidencia.momentoDispositivo)}</em>
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: 'var(--soft)', margin: '9px 0 0' }}>
          Cada evidencia se guarda con autor, fecha, hora y huella digital, y no se puede borrar.
          La orden no avanza de etapa mientras falte alguna obligatoria de esa etapa.
        </p>
      </Tarjeta>
    </>
  );
}
