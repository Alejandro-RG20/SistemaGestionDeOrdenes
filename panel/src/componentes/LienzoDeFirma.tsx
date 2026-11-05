/**
 * Firma del cliente sobre la pantalla (RF-28).
 *
 * El cliente firma con el dedo (o el mouse en el mostrador) y la firma se
 * convierte en una imagen PNG que entra por el MISMO circuito que cualquier
 * evidencia: compresion, huella digital, autor, fecha y, en campo, la cola
 * sin conexion. No hay un camino aparte para la firma, asi que no hay una
 * firma con menos garantias que una fotografia.
 *
 * Eventos de puntero: un solo codigo para dedo, lapiz y mouse. `touch-action:
 * none` evita que el trazo desplace la pagina en el telefono.
 */
import { useEffect, useRef, useState } from 'react';

/** Trazos minimos para considerar que hay una firma y no un toque accidental. */
const PUNTOS_MINIMOS = 12;

export function LienzoDeFirma({ titulo, alConfirmar, alCancelar, ocupado = false }: {
  titulo: string;
  alConfirmar: (firma: File) => void;
  alCancelar: () => void;
  ocupado?: boolean;
}): JSX.Element {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [puntos, setPuntos] = useState(0);

  // Resolucion real del dispositivo: sin esto la firma sale borrosa.
  useEffect(() => {
    const canvas = lienzo.current;
    if (canvas === null) return;
    const escala = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(width * escala));
    canvas.height = Math.max(1, Math.round(height * escala));
    const contexto = canvas.getContext('2d');
    if (contexto === null) return;
    contexto.scale(escala, escala);
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, width, height);
    contexto.lineWidth = 2.2;
    contexto.lineCap = 'round';
    contexto.lineJoin = 'round';
    contexto.strokeStyle = '#111111';
  }, []);

  const posicion = (evento: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const caja = evento.currentTarget.getBoundingClientRect();
    return { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
  };

  const empezar = (evento: React.PointerEvent<HTMLCanvasElement>): void => {
    const contexto = evento.currentTarget.getContext('2d');
    if (contexto === null) return;
    evento.currentTarget.setPointerCapture(evento.pointerId);
    dibujando.current = true;
    const { x, y } = posicion(evento);
    contexto.beginPath();
    contexto.moveTo(x, y);
  };

  const trazar = (evento: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!dibujando.current) return;
    const contexto = evento.currentTarget.getContext('2d');
    if (contexto === null) return;
    const { x, y } = posicion(evento);
    contexto.lineTo(x, y);
    contexto.stroke();
    setPuntos((n) => n + 1);
  };

  const terminar = (): void => { dibujando.current = false; };

  const borrar = (): void => {
    const canvas = lienzo.current;
    const contexto = canvas?.getContext('2d');
    if (canvas === null || canvas === undefined || contexto === null || contexto === undefined) return;
    const { width, height } = canvas.getBoundingClientRect();
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, width, height);
    setPuntos(0);
  };

  const confirmar = (): void => {
    lienzo.current?.toBlob((blob) => {
      if (blob === null) return;
      alConfirmar(new File([blob], `firma-${Date.now()}.png`, { type: 'image/png' }));
    }, 'image/png');
  };

  return (
    <div className="card">
      <h3>{titulo}</h3>
      <p style={{ fontSize: 12, color: 'var(--soft)', margin: '0 0 6px' }}>
        Pida al cliente que firme dentro del recuadro.
      </p>
      <canvas
        ref={lienzo}
        aria-label="Recuadro de firma"
        style={{
          width: '100%', height: 180, border: '1px dashed var(--line)', borderRadius: 4,
          background: '#fff', touchAction: 'none', cursor: 'crosshair',
        }}
        onPointerDown={empezar}
        onPointerMove={trazar}
        onPointerUp={terminar}
        onPointerLeave={terminar}
        onPointerCancel={terminar}
      />
      <div className="tools" style={{ marginTop: 8 }}>
        <button type="button" className="btn" style={{ minHeight: 44 }} onClick={borrar} disabled={ocupado}>Borrar</button>
        <button type="button" className="btn" style={{ minHeight: 44 }} onClick={alCancelar} disabled={ocupado}>Cancelar</button>
        <button
          type="button" className="btn teal" style={{ minHeight: 44 }}
          disabled={ocupado || puntos < PUNTOS_MINIMOS}
          onClick={confirmar}
        >
          {ocupado ? 'Guardando…' : 'Usar esta firma'}
        </button>
      </div>
    </div>
  );
}
