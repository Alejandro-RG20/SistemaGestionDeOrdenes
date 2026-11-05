/**
 * Lectura del codigo del repuesto (RF-25).
 *
 * Dos formas, porque en la calle no siempre hay la misma herramienta:
 *  · con la camara del telefono, usando el lector de codigos del navegador
 *    (`BarcodeDetector`, disponible en Chrome para Android). Funciona sin
 *    conexion: la deteccion ocurre en el dispositivo.
 *  · con un lector de mano (Bluetooth o USB), que escribe el codigo y pulsa
 *    Enter como un teclado: el campo de busqueda lo recibe tal cual.
 * Donde el navegador no trae el lector, el boton de camara no aparece y se
 * dice por que, en vez de fallar en silencio.
 */
import { useEffect, useRef, useState } from 'react';

interface CodigoDetectado { readonly rawValue: string }
interface DetectorDeCodigos { detect(fuente: CanvasImageSource): Promise<CodigoDetectado[]> }
type ConstructorDetector = new (opciones?: { formats?: string[] }) => DetectorDeCodigos;

function constructorDelDetector(): ConstructorDetector | null {
  const global = globalThis as unknown as { BarcodeDetector?: ConstructorDetector };
  return typeof global.BarcodeDetector === 'function' ? global.BarcodeDetector : null;
}

/** Si este navegador puede leer codigos con la camara. */
export function hayLectorDeCamara(): boolean {
  return constructorDelDetector() !== null
    && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined;
}

const FORMATOS = ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'data_matrix'];

export function LectorDeCodigo({ alLeer }: { alLeer: (codigo: string) => void }): JSX.Element {
  const [abierto, setAbierto] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const Detector = constructorDelDetector();
    if (Detector === null) return undefined;
    let flujo: MediaStream | null = null;
    let activo = true;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    const detector = new Detector({ formats: FORMATOS });

    const buscar = async (): Promise<void> => {
      if (!activo || video.current === null) return;
      try {
        const codigos = await detector.detect(video.current);
        const leido = codigos[0]?.rawValue.trim();
        if (leido) {
          activo = false;
          setAbierto(false);
          alLeer(leido);
          return;
        }
      } catch {
        // Un cuadro sin imagen todavia: se reintenta en el siguiente.
      }
      temporizador = setTimeout(() => { void buscar(); }, 250);
    };

    void (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (video.current === null) return;
        video.current.srcObject = flujo;
        await video.current.play();
        void buscar();
      } catch {
        setFallo('No se pudo abrir la camara. Revise el permiso de camara o escriba el codigo.');
        setAbierto(false);
      }
    })();

    return () => {
      activo = false;
      if (temporizador !== null) clearTimeout(temporizador);
      flujo?.getTracks().forEach((pista) => pista.stop());
    };
  }, [abierto, alLeer]);

  if (!hayLectorDeCamara()) {
    return (
      <p style={{ fontSize: 11, color: 'var(--soft)', margin: '4px 0 0' }}>
        Este navegador no lee codigos con la camara: use un lector de mano o escriba el codigo y pulse Enter.
      </p>
    );
  }
  return (
    <div style={{ margin: '6px 0' }}>
      {abierto ? (
        <>
          <video ref={video} muted playsInline style={{ width: '100%', maxHeight: 220, background: '#000', borderRadius: 4 }} />
          <button type="button" className="btn" style={{ minHeight: 44, marginTop: 6 }} onClick={() => setAbierto(false)}>
            Cancelar lectura
          </button>
        </>
      ) : (
        <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => { setFallo(null); setAbierto(true); }}>
          Leer codigo con la camara
        </button>
      )}
      {fallo === null ? null : <p style={{ fontSize: 11, color: 'var(--amber)', margin: '4px 0 0' }}>{fallo}</p>}
    </div>
  );
}
