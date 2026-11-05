/**
 * Respuestas validas (dentro de rango) para la lista de verificacion de una
 * orden, para las pruebas que diagnostican y no estan probando la lista.
 */
import type { Express } from 'express';
import peticion from 'supertest';
import type { PlantillaChecklist, RespuestaChecklist } from '@servitotal/compartido';

export function respuestasValidas(plantilla: PlantillaChecklist | null): RespuestaChecklist[] {
  if (plantilla === null) return [];
  return plantilla.items.flatMap((item): RespuestaChecklist[] => {
    switch (item.tipoCampo) {
      case 'numerico': {
        const min = item.rangoMin ?? 0;
        const max = item.rangoMax ?? min + 10;
        return [{ idItem: item.id, valor: (min + max) / 2 }];
      }
      case 'booleano': return [{ idItem: item.id, valor: true }];
      case 'seleccion': return [{ idItem: item.id, valor: item.opciones?.[0] ?? 'si' }];
      case 'texto': return [{ idItem: item.id, valor: 'Sin novedad' }];
      default: return [];
    }
  });
}

/** `{ mediciones }` para agregar al cuerpo del diagnostico de la orden. */
export async function medicionesValidas(
  aplicacion: Express, cabecera: { Authorization: string }, idOrden: string,
): Promise<{ mediciones: RespuestaChecklist[] }> {
  const taller = await peticion(aplicacion).get(`/api/v1/ordenes/${idOrden}/taller`).set(cabecera).expect(200);
  return { mediciones: respuestasValidas(taller.body.data.checklist) };
}
