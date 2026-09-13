/**
 * Paso 4: reglas de cobertura versionadas (RF-86).
 *
 * Se siembran reglas vigentes y una version anterior ya cerrada de algunas:
 * asi la etapa 3 puede comprobar que la orden congela la version que estaba
 * vigente cuando se abrio, no la ultima.
 */
import type { PoolClient } from 'pg';
import { CODIGO_ROL } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { FALLAS_EXCLUIDAS } from './nombres.js';
import { comoFecha, sumarDias } from './aleatorio.js';
import { usuariosDe, type ContextoSiembra, type ReferenciaReglaCobertura } from './contexto.js';

/** Meses de cobertura de fabrica habituales por categoria. */
const MESES_POR_CATEGORIA: Readonly<Record<string, number>> = {
  refrigeracion: 24,
  lavado: 12,
  cocina: 12,
  aire_acondicionado: 12,
  audio_video: 12,
  computo: 12,
  pequenos_electrodomesticos: 6,
};

/** Marcas con condiciones propias negociadas con el fabricante. */
const MESES_POR_MARCA: Readonly<Record<string, number>> = {
  LG: 36,
  Samsung: 24,
  Whirlpool: 24,
  Mabe: 24,
  Electrolux: 18,
  Sankey: 6,
};

export async function sembrarCoberturas(cliente: PoolClient, contexto: ContextoSiembra): Promise<void> {
  const { azar } = contexto;
  const jefatura = azar.elegir(usuariosDe(contexto, CODIGO_ROL.JEFE_TECNICOS));
  const reglas: ReferenciaReglaCobertura[] = [];
  const filas: unknown[][] = [];

  const agregar = (
    regla: Omit<ReferenciaReglaCobertura, 'id'>,
    version: number,
    vigenteDesde: Date,
    vigenteHasta: Date | null,
  ): void => {
    const completa: ReferenciaReglaCobertura = { ...regla, id: azar.uuid() };
    reglas.push(completa);
    filas.push([
      completa.id, completa.idMarca, completa.idCategoria, completa.mesesCobertura,
      completa.exigeTiendaGrupo, completa.fallasExcluidas, version,
      comoFecha(vigenteDesde), vigenteHasta === null ? null : comoFecha(vigenteHasta),
      completa.vigente, jefatura.id,
    ]);
  };

  const excluidas = (cantidad: number): string[] => azar.barajar(FALLAS_EXCLUIDAS).slice(0, cantidad);
  const antesDeTodo = sumarDias(contexto.inicioVentana, -400);

  // Regla general de ultimo recurso: ninguna orden se queda sin version aplicada.
  agregar(
    { idMarca: null, idCategoria: null, mesesCobertura: 12, exigeTiendaGrupo: true,
      fallasExcluidas: excluidas(3), vigente: true },
    1, antesDeTodo, null,
  );

  for (const categoria of contexto.categorias) {
    agregar(
      { idMarca: null, idCategoria: categoria.id,
        mesesCobertura: MESES_POR_CATEGORIA[categoria.nombre] ?? 12,
        exigeTiendaGrupo: true, fallasExcluidas: excluidas(3), vigente: true },
      1, antesDeTodo, null,
    );
  }

  for (const marca of contexto.marcas) {
    const meses = MESES_POR_MARCA[marca.nombre];
    if (meses === undefined) continue;
    for (const categoria of contexto.categorias.slice(0, 4)) {
      // Version 1, ya reemplazada: queda inactiva y con fecha de cierre.
      const cierre = sumarDias(contexto.inicioVentana, 120);
      agregar(
        { idMarca: marca.id, idCategoria: categoria.id, mesesCobertura: Math.max(6, meses - 6),
          exigeTiendaGrupo: true, fallasExcluidas: excluidas(2), vigente: false },
        1, antesDeTodo, cierre,
      );
      // Version 2, la vigente hoy.
      agregar(
        { idMarca: marca.id, idCategoria: categoria.id, mesesCobertura: meses,
          exigeTiendaGrupo: true, fallasExcluidas: excluidas(3), vigente: true },
        2, sumarDias(cierre, 1), null,
      );
    }
  }

  await copiarFilas(
    cliente,
    'regla_cobertura',
    ['id', 'id_marca', 'id_categoria', 'meses_cobertura', 'exige_tienda_grupo', 'fallas_excluidas',
      'version', 'vigente_desde', 'vigente_hasta', 'activa', 'creado_por'],
    filas as never,
  );
  contexto.reglasCobertura = reglas;
}

/**
 * Busca la regla vigente mas especifica para un articulo: marca+categoria,
 * luego categoria, luego marca, y por ultimo la general.
 */
export function reglaAplicable(
  contexto: ContextoSiembra,
  idMarca: string,
  idCategoria: string,
): ReferenciaReglaCobertura {
  const vigentes = contexto.reglasCobertura.filter((regla) => regla.vigente);
  return (
    vigentes.find((r) => r.idMarca === idMarca && r.idCategoria === idCategoria) ??
    vigentes.find((r) => r.idMarca === null && r.idCategoria === idCategoria) ??
    vigentes.find((r) => r.idMarca === idMarca && r.idCategoria === null) ??
    vigentes.find((r) => r.idMarca === null && r.idCategoria === null)!
  );
}
