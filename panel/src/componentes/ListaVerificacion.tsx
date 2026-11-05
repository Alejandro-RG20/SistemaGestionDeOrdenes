/**
 * Lista de verificacion del diagnostico (RF-22) con advertencia en vivo de
 * mediciones fuera de rango (RF-23).
 *
 * Un solo componente para el tecnico de ruta (sin conexion) y para el de
 * planta (panel): la misma lista, los mismos campos y la misma funcion de
 * validacion que aplica el servidor (`evaluarChecklist`, paquete compartido).
 */
import {
  TIPO_CAMPO_CHECKLIST, describirMedicion, estaFueraDeRango, evaluarChecklist,
  type MedicionRegistrada, type PlantillaChecklist, type RespuestaChecklist,
} from '@servitotal/compartido';

/** Lo que va escribiendo el tecnico, por campo. */
export type ValoresChecklist = Readonly<Record<string, string | boolean>>;

/** Respuestas para enviar: los numeros como numero, lo vacio fuera. */
export function respuestasDe(plantilla: PlantillaChecklist, valores: ValoresChecklist): RespuestaChecklist[] {
  return plantilla.items.flatMap((item): RespuestaChecklist[] => {
    const valor = valores[item.id];
    if (valor === undefined || valor === '') return [];
    if (item.tipoCampo === TIPO_CAMPO_CHECKLIST.NUMERICO && typeof valor === 'string') {
      return [{ idItem: item.id, valor: Number(valor.replace(',', '.')) }];
    }
    return [{ idItem: item.id, valor }];
  });
}

/** Lo que falta o esta mal; vacio si se puede enviar. */
export function problemasDe(plantilla: PlantillaChecklist, valores: ValoresChecklist): string[] {
  const resultado = evaluarChecklist(plantilla, respuestasDe(plantilla, valores));
  return [
    ...resultado.errores,
    ...(resultado.faltantes.length === 0 ? [] : [`Falta: ${resultado.faltantes.join(', ')}.`]),
  ];
}

export function ListaVerificacion({ plantilla, valores, alCambiar }: {
  plantilla: PlantillaChecklist;
  valores: ValoresChecklist;
  alCambiar: (valores: ValoresChecklist) => void;
}): JSX.Element {
  const poner = (id: string, valor: string | boolean): void => alCambiar({ ...valores, [id]: valor });
  return (
    <div className="lista-verificacion">
      {[...plantilla.items].sort((a, b) => a.orden - b.orden).map((item) => {
        const valor = valores[item.id];
        const numero = typeof valor === 'string' && valor.trim() !== '' ? Number(valor.replace(',', '.')) : null;
        const fuera = item.tipoCampo === TIPO_CAMPO_CHECKLIST.NUMERICO && numero !== null && Number.isFinite(numero)
          && estaFueraDeRango(numero, item.rangoMin, item.rangoMax);
        const rango = item.rangoMin !== null || item.rangoMax !== null
          ? ` (esperado ${item.rangoMin ?? '…'} a ${item.rangoMax ?? '…'}${item.unidad ? ` ${item.unidad}` : ''})`
          : '';
        const etiqueta = `${item.etiqueta}${item.obligatorio && item.tipoCampo !== TIPO_CAMPO_CHECKLIST.FOTO ? ' *' : ''}`;
        return (
          <div key={item.id} style={{ marginBottom: 9 }}>
            {item.tipoCampo === TIPO_CAMPO_CHECKLIST.BOOLEANO ? (
              <>
                <label>{etiqueta}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[true, false].map((opcion) => (
                    <button
                      key={String(opcion)} type="button"
                      className={valor === opcion ? 'btn pri' : 'btn'}
                      style={{ minHeight: 44, minWidth: 64 }}
                      onClick={() => poner(item.id, opcion)}
                    >
                      {opcion ? 'Si' : 'No'}
                    </button>
                  ))}
                </div>
              </>
            ) : item.tipoCampo === TIPO_CAMPO_CHECKLIST.SELECCION ? (
              <>
                <label htmlFor={`item-${item.id}`}>{etiqueta}</label>
                <select id={`item-${item.id}`} value={typeof valor === 'string' ? valor : ''}
                  onChange={(e) => poner(item.id, e.target.value)}>
                  <option value="">Elija…</option>
                  {(item.opciones ?? []).map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
                </select>
              </>
            ) : item.tipoCampo === TIPO_CAMPO_CHECKLIST.NUMERICO ? (
              <>
                <label htmlFor={`item-${item.id}`}>{etiqueta}{item.unidad ? ` · ${item.unidad}` : ''}<small className="tenue">{rango}</small></label>
                <input id={`item-${item.id}`} inputMode="decimal" value={typeof valor === 'string' ? valor : ''}
                  onChange={(e) => poner(item.id, e.target.value)}
                  style={fuera ? { borderColor: 'var(--red)' } : undefined} />
                {fuera ? (
                  <p role="alert" style={{ fontSize: 11.5, color: 'var(--red)', margin: '4px 0 0' }}>
                    Fuera del rango esperado. Se guardara con la advertencia.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <label htmlFor={`item-${item.id}`}>
                  {etiqueta}
                  {item.tipoCampo === TIPO_CAMPO_CHECKLIST.FOTO ? <small className="tenue"> (la foto se toma en Evidencia)</small> : null}
                </label>
                <input id={`item-${item.id}`} value={typeof valor === 'string' ? valor : ''}
                  onChange={(e) => poner(item.id, e.target.value)} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Las mediciones guardadas de un diagnostico, con las fuera de rango marcadas. */
export function MedicionesGuardadas({ mediciones }: { mediciones: readonly MedicionRegistrada[] }): JSX.Element | null {
  if (mediciones.length === 0) return null;
  const valor = (m: MedicionRegistrada): string => (m.valorNumerico !== null
    ? `${m.valorNumerico}${m.unidad ? ` ${m.unidad}` : ''}`
    : m.valorBooleano !== null ? (m.valorBooleano ? 'Si' : 'No') : m.valorTexto ?? '—');
  return (
    <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
      {mediciones.map((m) => (
        <li key={`${m.idItem ?? m.etiqueta}`} style={m.fueraDeRango ? { color: 'var(--red)' } : undefined}>
          {m.fueraDeRango ? <b>Fuera de rango · </b> : null}
          {m.fueraDeRango ? describirMedicion(m) : `${m.etiqueta}: ${valor(m)}`}
        </li>
      ))}
    </ul>
  );
}
