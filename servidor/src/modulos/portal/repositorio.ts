/**
 * Consulta del portal publico.
 *
 * Una sola consulta y muy acotada: numero de orden mas telefono. El
 * telefono NO se devuelve nunca; solo sirve para comprobar que quien
 * pregunta es de la casa.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

/** Deja solo digitos: la gente escribe 8888-7777, +505 8888 7777, etc. */
export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

export interface FilaOrdenPublica {
  readonly id: string;
  readonly numero: string;
  readonly estado: string;
  readonly cliente_nombres: string;
  readonly cliente_apellidos: string | null;
  readonly articulo: string;
  readonly fecha_recepcion: Date;
  readonly plazo_vence_en: Date | null;
  readonly fecha_entrega: Date | null;
  readonly fecha_estado_desde: Date;
  readonly repuesto_esperado_para: Date | null;
}

/**
 * RF-66: vale el telefono vigente del cliente o el que quedo congelado en
 * la orden. La gente cambia de numero y no tiene por que acordarse de cual
 * dio hace tres semanas.
 *
 * La comparacion se hace sobre los digitos de ambos lados, para que el
 * formato con que se escriba no decida si alguien puede ver su orden.
 */
export async function buscarPorNumeroYTelefono(
  numero: number, telefono: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaOrdenPublica | null> {
  const digitos = soloDigitos(telefono);
  if (digitos.length < 7) return null;

  const { rows } = await ejecutor.query<FilaOrdenPublica>(
    `SELECT o.id, o.numero, o.estado::text AS estado,
            c.nombres AS cliente_nombres, c.apellidos AS cliente_apellidos,
            trim(m.nombre || ' ' || coalesce(a.modelo, '')) AS articulo,
            o.fecha_recepcion, o.plazo_vence_en, o.fecha_entrega, o.fecha_estado_desde,
            (SELECT min(s.fecha_estimada) FROM solicitud_repuesto s
              WHERE s.id_orden = o.id AND s.fecha_ingreso IS NULL) AS repuesto_esperado_para
       FROM orden_servicio o
       JOIN cliente c  ON c.id = o.id_cliente
       JOIN articulo a ON a.id = o.id_articulo
       JOIN marca m    ON m.id = a.id_marca
      WHERE o.numero = $1
        AND (
          regexp_replace(o.telefono_contacto, '\\D', '', 'g') = $2
          OR EXISTS (
            SELECT 1 FROM cliente_telefono t
             WHERE t.id_cliente = o.id_cliente
               AND regexp_replace(t.numero, '\\D', '', 'g') = $2
          )
        )`,
    [numero, digitos],
  );
  return rows[0] ?? null;
}

export interface FilaEventoPublico {
  readonly estado_nuevo: string;
  readonly momento: Date;
}

/** El recorrido, para dibujar por donde paso. Sin responsables ni notas. */
export async function recorridoDe(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaEventoPublico[]> {
  const { rows } = await ejecutor.query<FilaEventoPublico>(
    `SELECT estado_nuevo::text AS estado_nuevo, momento
       FROM evento_orden WHERE id_orden = $1 ORDER BY momento`,
    [idOrden],
  );
  return rows;
}
