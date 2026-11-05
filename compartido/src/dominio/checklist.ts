/**
 * Listas de verificacion del diagnostico (RF-22) y advertencia de medicion
 * fuera de rango (RF-23).
 *
 * Una medicion —presion, temperatura, amperaje— es un DATO con unidad y
 * rango esperado, no una fotografia: asi se puede validar, comparar entre
 * servicios y detectar lo que esta fuera de parametro.
 *
 * Vive en el paquete compartido por la misma razon que el calculo de la
 * cotizacion: la aplicacion del tecnico advierte en vivo con ESTA funcion y
 * el servidor guarda lo que ESTA funcion decide. Dos validaciones distintas
 * darian dos verdades sobre la misma medicion.
 */
import { TIPO_CAMPO_CHECKLIST, type TipoCampoChecklist } from './evidencia.js';

export interface ItemChecklist {
  readonly id: string;
  readonly orden: number;
  readonly etiqueta: string;
  readonly tipoCampo: TipoCampoChecklist;
  readonly unidad: string | null;
  readonly rangoMin: number | null;
  readonly rangoMax: number | null;
  /** Solo para seleccion. */
  readonly opciones: readonly string[] | null;
  readonly obligatorio: boolean;
}

/** La plantilla vigente para la categoria del articulo. */
export interface PlantillaChecklist {
  readonly id: string;
  readonly nombre: string;
  readonly items: readonly ItemChecklist[];
}

/** Lo que el tecnico contesto en un campo. */
export interface RespuestaChecklist {
  readonly idItem: string;
  readonly valor: number | string | boolean | null;
}

/** Una medicion tal como queda guardada. */
export interface MedicionRegistrada {
  readonly idItem: string | null;
  readonly etiqueta: string;
  readonly tipoCampo: TipoCampoChecklist;
  readonly valorNumerico: number | null;
  readonly valorTexto: string | null;
  readonly valorBooleano: boolean | null;
  readonly unidad: string | null;
  readonly rangoMin: number | null;
  readonly rangoMax: number | null;
  readonly fueraDeRango: boolean;
}

export interface ResultadoChecklist {
  readonly mediciones: readonly MedicionRegistrada[];
  /** Campos obligatorios sin respuesta (por etiqueta). */
  readonly faltantes: readonly string[];
  /** Respuestas con un valor que no corresponde a su campo. */
  readonly errores: readonly string[];
  /** Las mediciones fuera de rango, para advertir. */
  readonly fueraDeRango: readonly MedicionRegistrada[];
}

/** Fuera del rango esperado; un limite ausente no restringe ese lado. */
export function estaFueraDeRango(valor: number, minimo: number | null, maximo: number | null): boolean {
  return (minimo !== null && valor < minimo) || (maximo !== null && valor > maximo);
}

/** "-5 C (esperado entre -22 y -14 C)", para la advertencia. */
export function describirMedicion(medicion: MedicionRegistrada): string {
  const unidad = medicion.unidad === null ? '' : ` ${medicion.unidad}`;
  const rango = medicion.rangoMin !== null && medicion.rangoMax !== null
    ? `entre ${medicion.rangoMin} y ${medicion.rangoMax}${unidad}`
    : medicion.rangoMin !== null ? `al menos ${medicion.rangoMin}${unidad}`
    : medicion.rangoMax !== null ? `como maximo ${medicion.rangoMax}${unidad}` : 'sin rango';
  return `${medicion.etiqueta}: ${medicion.valorNumerico ?? '—'}${unidad} (esperado ${rango})`;
}

function vacio(valor: RespuestaChecklist['valor'] | undefined): boolean {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
}

/**
 * Valida las respuestas contra la plantilla y arma las mediciones.
 *
 * Un campo de fotografia se cumple con la evidencia, que viaja por su propia
 * cola: aqui solo se anota la referencia si la hay, y no se exige.
 */
export function evaluarChecklist(
  plantilla: PlantillaChecklist, respuestas: readonly RespuestaChecklist[],
): ResultadoChecklist {
  const porItem = new Map(respuestas.map((respuesta) => [respuesta.idItem, respuesta.valor]));
  const errores: string[] = [];
  for (const idItem of porItem.keys()) {
    if (!plantilla.items.some((item) => item.id === idItem)) {
      errores.push('Una respuesta no corresponde a ningun campo de la lista de verificacion.');
    }
  }

  const faltantes: string[] = [];
  const mediciones: MedicionRegistrada[] = [];
  for (const item of [...plantilla.items].sort((uno, otro) => uno.orden - otro.orden)) {
    const valor = porItem.get(item.id);
    const base = {
      idItem: item.id, etiqueta: item.etiqueta, tipoCampo: item.tipoCampo,
      unidad: item.unidad, rangoMin: item.rangoMin, rangoMax: item.rangoMax,
      valorNumerico: null, valorTexto: null, valorBooleano: null, fueraDeRango: false,
    };
    if (vacio(valor)) {
      if (item.obligatorio && item.tipoCampo !== TIPO_CAMPO_CHECKLIST.FOTO) faltantes.push(item.etiqueta);
      continue;
    }
    switch (item.tipoCampo) {
      case TIPO_CAMPO_CHECKLIST.NUMERICO: {
        const numero = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
        if (!Number.isFinite(numero)) {
          errores.push(`${item.etiqueta}: escriba un numero.`);
          continue;
        }
        mediciones.push({
          ...base, valorNumerico: numero, fueraDeRango: estaFueraDeRango(numero, item.rangoMin, item.rangoMax),
        });
        break;
      }
      case TIPO_CAMPO_CHECKLIST.BOOLEANO:
        if (typeof valor !== 'boolean') {
          errores.push(`${item.etiqueta}: responda si o no.`);
          continue;
        }
        mediciones.push({ ...base, valorBooleano: valor });
        break;
      case TIPO_CAMPO_CHECKLIST.SELECCION:
        if (typeof valor !== 'string' || (item.opciones !== null && !item.opciones.includes(valor))) {
          errores.push(`${item.etiqueta}: elija una de las opciones.`);
          continue;
        }
        mediciones.push({ ...base, valorTexto: valor });
        break;
      default:
        // Texto y referencia de fotografia.
        if (typeof valor !== 'string') {
          errores.push(`${item.etiqueta}: escriba un texto.`);
          continue;
        }
        mediciones.push({ ...base, valorTexto: valor.trim().slice(0, 1000) });
    }
  }
  return { mediciones, faltantes, errores, fueraDeRango: mediciones.filter((m) => m.fueraDeRango) };
}
