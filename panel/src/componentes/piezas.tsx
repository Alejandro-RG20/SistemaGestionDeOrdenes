/**
 * Las piezas visuales del prototipo, como componentes.
 *
 * Existen para que ninguna pantalla vuelva a decidir de qué color va un
 * estado. En el prototipo eso estaba repetido en catorce sitios; aquí se
 * decide una vez, y de paso se cumple la regla que importa: **el estado
 * nunca se comunica sólo por color**, siempre lleva texto.
 */
import type { ReactNode } from 'react';
import { ESTADO_ORDEN, TIPO_GARANTIA, type EstadoOrden, type TipoGarantia } from '@servitotal/compartido';
import { ErrorDeApi } from '../api/cliente.js';

// ── etiquetas de estado ────────────────────────────────────────────────

/** Clase de color de la etiqueta según lo urgente que sea el estado. */
function tonoDeEstado(estado: EstadoOrden): string {
  switch (estado) {
    case ESTADO_ORDEN.ESPERANDO_REPUESTO:
    case ESTADO_ORDEN.ESPERANDO_AUTORIZACION:
      return 't-r';
    case ESTADO_ORDEN.EN_DIAGNOSTICO:
    case ESTADO_ORDEN.EN_REPARACION:
    case ESTADO_ORDEN.COTIZADA:
      return 't-a';
    case ESTADO_ORDEN.FINALIZADA:
      return 't-t';
    case ESTADO_ORDEN.ENTREGADA:
    case ESTADO_ORDEN.CERRADA_SIN_REPARAR:
    case ESTADO_ORDEN.ANULADA:
      return 't-g';
    default:
      return 't-b';
  }
}

export function EtiquetaEstado({ estado }: { estado: EstadoOrden }): JSX.Element {
  return <span className={`tag ${tonoDeEstado(estado)}`}>{estado.replace(/_/g, ' ')}</span>;
}

export function Etiqueta(
  { tono = 't-g', children }: { tono?: string; children: ReactNode },
): JSX.Element {
  return <span className={`tag ${tono}`}>{children}</span>;
}

// ── garantía: quién paga ───────────────────────────────────────────────

const TONO_GARANTIA: Record<string, string> = {
  [TIPO_GARANTIA.PROVEEDOR]: 'w-prov',
  [TIPO_GARANTIA.ADICIONAL]: 'w-adic',
  [TIPO_GARANTIA.PARTICULAR]: 'w-part',
  [TIPO_GARANTIA.POR_VALIDAR]: 'w-part',
};

const NOMBRE_GARANTIA: Record<string, string> = {
  [TIPO_GARANTIA.PROVEEDOR]: 'Proveedor',
  [TIPO_GARANTIA.ADICIONAL]: 'Adicional',
  [TIPO_GARANTIA.PARTICULAR]: 'Particular',
  [TIPO_GARANTIA.POR_VALIDAR]: 'Por validar',
};

export function Garantia({ tipo }: { tipo: TipoGarantia }): JSX.Element {
  return <span className={`war ${TONO_GARANTIA[tipo] ?? 'w-part'}`}>{NOMBRE_GARANTIA[tipo] ?? tipo}</span>;
}

// ── avisos ─────────────────────────────────────────────────────────────

export function Aviso(
  { tono = '', children }: { tono?: 'warn' | 'ok' | 'info' | ''; children: ReactNode },
): JSX.Element {
  return <div className={`alert ${tono}`}><span>{children}</span></div>;
}

// ── cifras del panel ───────────────────────────────────────────────────

export function Cifra(
  { valor, etiqueta, color, pequena = false }:
  { valor: ReactNode; etiqueta: string; color?: string; pequena?: boolean },
): JSX.Element {
  return (
    <div className="kpi">
      <b style={{ ...(color === undefined ? {} : { color }), ...(pequena ? { fontSize: 13 } : {}) }}>
        {valor}
      </b>
      <span>{etiqueta}</span>
    </div>
  );
}

// ── estados de carga ───────────────────────────────────────────────────

export function Cargando({ que }: { que: string }): JSX.Element {
  return <p className="cargando">Cargando {que}…</p>;
}

export function Fallo(
  { error, alReintentar }: { error: unknown; alReintentar?: () => void },
): JSX.Element {
  // El servidor ya escribió el mensaje para que lo lea una persona; se usa
  // ese, en vez de convertirlo en "Error 422".
  const mensaje = error instanceof ErrorDeApi
    ? error.message
    : 'Ocurrio un problema inesperado al cargar esta pantalla.';

  return (
    <div className="alert">
      <span>
        {mensaje}
        {alReintentar === undefined ? null : (
          <>
            {' '}
            <a onClick={alReintentar} style={{ cursor: 'pointer' }}>Reintentar</a>
          </>
        )}
      </span>
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }): JSX.Element {
  return <p className="vacio">{children}</p>;
}

// ── tarjeta con título, como en el prototipo ───────────────────────────

export function Tarjeta(
  { titulo, extra, acento, children }:
  { titulo?: string; extra?: ReactNode; acento?: string; children: ReactNode },
): JSX.Element {
  return (
    <div className="card" style={acento === undefined ? {} : { borderLeft: `3px solid ${acento}` }}>
      {titulo === undefined ? null : (
        <h3>
          {titulo}
          {extra === undefined ? null : (
            <span style={{ float: 'right', fontWeight: 400, fontSize: 10.5, color: 'var(--soft)' }}>
              {extra}
            </span>
          )}
        </h3>
      )}
      {children}
    </div>
  );
}

// ── formato ────────────────────────────────────────────────────────────

export function cordobas(monto: number): string {
  return `C$ ${monto.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fechaCorta(iso: string | null): string {
  return iso === null ? '—' : new Date(iso).toLocaleDateString('es-NI');
}

export function fechaHora(iso: string | null): string {
  return iso === null ? '—' : new Date(iso).toLocaleString('es-NI');
}

/**
 * El plazo dicho en palabras, no sólo en color. Devuelve además el color,
 * para quien quiera usarlo COMO REFUERZO del texto.
 */
export function plazoEnPalabras(
  horasParaVencer: number | null, vencida: boolean,
): { texto: string; color?: string } {
  if (horasParaVencer === null) return { texto: '—' };
  if (vencida) {
    const horas = Math.abs(Math.round(horasParaVencer));
    return horas >= 24
      ? { texto: `vencido ${Math.round(horas / 24)} d`, color: 'var(--red)' }
      : { texto: `vencido ${horas} h`, color: 'var(--red)' };
  }
  const horas = Math.round(horasParaVencer);
  if (horas <= 8) return { texto: `vence en ${horas} h`, color: 'var(--amber)' };
  return { texto: `vence en ${Math.round(horas / 24)} d` };
}
