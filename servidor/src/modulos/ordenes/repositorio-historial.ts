/**
 * El historial completo de una orden, en una consulta.
 *
 * Cada rama del UNION lee una fuente que ya existe; no hay una tabla de
 * «historial» aparte que pueda desincronizarse de lo que paso. Todas esas
 * fuentes son de solo agregar (migracion 0023), asi que lo que aqui se lee
 * no puede haber sido reescrito.
 *
 * Las solicitudes de repuesto anteriores a la 0023 no tienen sus pasos en la
 * bitacora; para ellas se reconstruyen desde las columnas de la solicitud,
 * que guardan el ultimo paso de cada tipo. Las nuevas se leen de la
 * bitacora, que guarda todos.
 */
import type { Ejecutor } from '../../comun/transacciones.js';
import { ejecutorPorDefecto } from '../../comun/transacciones.js';

export interface FilaHistorial {
  readonly id: string;
  readonly momento: Date;
  readonly tipo: string;
  readonly titulo: string;
  readonly detalle: string | null;
  readonly responsable: string | null;
  readonly sin_conexion: boolean;
}

const LEGIBLE = (expresion: string): string => `replace(${expresion}::text, '_', ' ')`;

export async function deOrden(
  idOrden: string, ejecutor: Ejecutor = ejecutorPorDefecto(),
): Promise<FilaHistorial[]> {
  const { rows } = await ejecutor.query<FilaHistorial>(
    `WITH sol AS (
       SELECT s.*, r.codigo || ' · ' || r.descripcion AS repuesto,
              EXISTS (SELECT 1 FROM bitacora b
                       WHERE b.tabla = 'solicitud_repuesto' AND b.id_registro = s.id) AS auditada
         FROM solicitud_repuesto s JOIN repuesto r ON r.id = s.id_repuesto
        WHERE s.id_orden = $1
     )
     SELECT * FROM (
       -- Cambios de estado
       SELECT e.id::text, e.momento, 'estado' AS tipo,
              CASE WHEN e.estado_anterior IS NULL THEN 'Orden registrada'
                   ELSE ${LEGIBLE('e.estado_anterior')} || ' → ' || ${LEGIBLE('e.estado_nuevo')} END AS titulo,
              e.observacion AS detalle, u.nombres AS responsable, e.registrado_sin_conexion AS sin_conexion
         FROM evento_orden e LEFT JOIN usuario u ON u.id = e.id_responsable
        WHERE e.id_orden = $1

       UNION ALL -- Comentarios de la bitacora de la orden
       SELECT b.id::text, b.momento, 'bitacora',
              b.valor_nuevo,
              CASE b.campo
                WHEN 'bitacora.pago_registrado' THEN 'Registro de pago'
                WHEN 'bitacora.pago_confirmado' THEN 'Confirmacion de pago'
                WHEN 'bitacora.correccion' THEN 'Corrige una entrada anterior'
              END,
              u.nombres, false
         FROM bitacora b JOIN usuario u ON u.id = b.id_usuario
        WHERE b.tabla = 'orden_servicio' AND b.id_registro = $1 AND b.campo LIKE 'bitacora%'

       UNION ALL -- Asignaciones y otros cambios de la orden (bitacora)
       SELECT b.id::text, b.momento,
              CASE WHEN b.campo = 'tecnico' THEN 'asignacion' ELSE 'cambio' END,
              CASE WHEN b.campo = 'tecnico' AND b.valor_anterior IS NULL
                     THEN 'Tecnico asignado: ' || coalesce(b.valor_nuevo, '')
                   WHEN b.campo = 'tecnico'
                     THEN 'Reasignada: ' || b.valor_anterior || ' → ' || coalesce(b.valor_nuevo, '')
                   WHEN b.campo = 'tipo_garantia' AND b.valor_anterior IS NULL
                     THEN 'Garantia elegida: ' || replace(coalesce(b.valor_nuevo, ''), '_', ' ')
                   WHEN b.campo = 'tipo_garantia'
                     THEN 'Garantia reclasificada: ' || replace(b.valor_anterior, '_', ' ')
                          || ' → ' || replace(coalesce(b.valor_nuevo, ''), '_', ' ')
                   ELSE initcap(b.accion) || coalesce(' · ' || b.campo, '')
                        || coalesce(': ' || b.valor_anterior, '') || coalesce(' → ' || b.valor_nuevo, '')
              END,
              b.motivo, u.nombres, false
         FROM bitacora b JOIN usuario u ON u.id = b.id_usuario
        WHERE b.tabla = 'orden_servicio' AND b.id_registro = $1
          AND (b.campo IS NULL OR b.campo NOT LIKE 'bitacora%')

       UNION ALL -- Diagnosticos
       SELECT d.id::text, d.momento_dispositivo, 'diagnostico',
              'Diagnostico registrado' || coalesce(' · ' || d.componente, ''),
              d.falla_real, u.nombres, d.registrado_sin_conexion
         FROM diagnostico d JOIN tecnico t ON t.id = d.id_tecnico JOIN usuario u ON u.id = t.id_usuario
        WHERE d.id_orden = $1

       UNION ALL -- Evidencias
       SELECT ev.id::text, ev.momento_dispositivo, 'evidencia',
              'Evidencia: ' || ${LEGIBLE('ev.clave')},
              ${LEGIBLE('ev.tipo')} || CASE WHEN ev.sincronizada THEN ' · archivo almacenado'
                                         ELSE ' · archivo pendiente de subir' END,
              u.nombres, false
         FROM evidencia ev LEFT JOIN usuario u ON u.id = ev.id_autor
        WHERE ev.id_orden = $1

       UNION ALL -- Solicitudes de repuesto: cada paso auditado
       SELECT b.id::text, b.momento, 'solicitud',
              CASE WHEN b.valor_anterior IS NULL THEN 'Repuesto solicitado: ' || sol.repuesto
                   ELSE 'Solicitud ' || sol.repuesto || ': ' || ${LEGIBLE('b.valor_anterior')}
                        || ' → ' || ${LEGIBLE('b.valor_nuevo')} END,
              b.motivo, u.nombres, false
         FROM bitacora b JOIN sol ON sol.id = b.id_registro JOIN usuario u ON u.id = b.id_usuario
        WHERE b.tabla = 'solicitud_repuesto'

       UNION ALL -- Solicitudes anteriores a la auditoria por paso
       SELECT sol.id::text || '-pedida', sol.fecha_solicitud::timestamptz, 'solicitud',
              'Repuesto solicitado: ' || sol.repuesto, sol.cantidad || ' unidad(es)', u.nombres, false
         FROM sol LEFT JOIN usuario u ON u.id = sol.creado_por WHERE NOT sol.auditada
       UNION ALL
       SELECT sol.id::text || '-revisada', sol.revisada_en, 'solicitud',
              'Solicitud revisada: ' || sol.repuesto, sol.motivo, u.nombres, false
         FROM sol JOIN usuario u ON u.id = sol.revisada_por WHERE NOT sol.auditada AND sol.revisada_en IS NOT NULL
       UNION ALL
       SELECT sol.id::text || '-preparada', sol.preparada_en, 'solicitud',
              'Solicitud preparada: ' || sol.repuesto, NULL, u.nombres, false
         FROM sol JOIN usuario u ON u.id = sol.preparada_por WHERE NOT sol.auditada AND sol.preparada_en IS NOT NULL
       UNION ALL
       SELECT sol.id::text || '-entregada', sol.entregada_en, 'solicitud',
              'Solicitud entregada: ' || sol.repuesto, NULL, u.nombres, false
         FROM sol JOIN usuario u ON u.id = sol.entregada_por WHERE NOT sol.auditada AND sol.entregada_en IS NOT NULL
       UNION ALL
       SELECT sol.id::text || '-recibida', sol.recibida_en, 'solicitud',
              'Solicitud recibida por el tecnico: ' || sol.repuesto, NULL, NULL, false
         FROM sol WHERE NOT sol.auditada AND sol.recibida_en IS NOT NULL

       UNION ALL -- Movimientos de inventario atados a la orden
       SELECT m.id::text, m.creado_en, 'movimiento',
              initcap(${LEGIBLE('m.tipo')}) || ': ' || m.cantidad || ' x ' || r.codigo || ' · ' || r.descripcion,
              concat_ws(' · ',
                CASE WHEN bo.nombre IS NOT NULL THEN 'de ' || bo.nombre END,
                CASE WHEN bd.nombre IS NOT NULL THEN 'a ' || bd.nombre END,
                m.justificacion),
              u.nombres, m.registrado_sin_conexion
         FROM movimiento_repuesto m
         JOIN repuesto r ON r.id = m.id_repuesto
         JOIN usuario u ON u.id = m.id_responsable
         LEFT JOIN bodega bo ON bo.id = m.id_bodega_origen
         LEFT JOIN bodega bd ON bd.id = m.id_bodega_destino
        WHERE m.id_orden = $1

       UNION ALL -- Visitas: la programacion
       SELECT v.id::text || '-prog', v.creado_en, 'visita',
              'Visita programada para el ' || to_char(v.fecha_programada, 'DD/MM/YYYY') || ' · ' || v.franja_horaria,
              'Tecnico: ' || ut.nombres || CASE WHEN v.vigente THEN '' ELSE ' · luego reprogramada' END
                || coalesce(' · ' || v.motivo, ''),
              u.nombres, false
         FROM visita v
         JOIN tecnico t ON t.id = v.id_tecnico JOIN usuario ut ON ut.id = t.id_usuario
         LEFT JOIN usuario u ON u.id = v.creado_por
        WHERE v.id_orden = $1
       UNION ALL -- Visitas: llegada real al domicilio
       SELECT v.id::text || '-lleg', v.hora_llegada, 'visita',
              'Llegada al domicilio (programada ' || to_char(v.fecha_programada, 'DD/MM') || ' ' || v.franja_horaria || ')',
              NULL, ut.nombres, false
         FROM visita v JOIN tecnico t ON t.id = v.id_tecnico JOIN usuario ut ON ut.id = t.id_usuario
        WHERE v.id_orden = $1 AND v.hora_llegada IS NOT NULL
       UNION ALL -- Visitas: salida y resultado
       SELECT v.id::text || '-res', coalesce(v.hora_salida, v.hora_llegada), 'visita',
              'Resultado de la visita: ' || ${LEGIBLE('v.resultado')}, v.motivo, ut.nombres, false
         FROM visita v JOIN tecnico t ON t.id = v.id_tecnico JOIN usuario ut ON ut.id = t.id_usuario
        WHERE v.id_orden = $1 AND v.resultado <> 'programada'

       UNION ALL -- Autorizacion del cliente
       SELECT c.id::text || '-cot', c.creado_en, 'autorizacion',
              'Cotizacion registrada para autorizacion del cliente', NULL, u.nombres, false
         FROM cotizacion c LEFT JOIN usuario u ON u.id = c.registrado_por
        WHERE c.id_orden = $1
       UNION ALL
       SELECT c.id::text || '-acept', c.momento_aceptacion, 'autorizacion',
              CASE WHEN c.aceptada THEN 'El cliente autorizo la reparacion'
                   ELSE 'El cliente no autorizo la reparacion' END,
              ${LEGIBLE('c.forma_aceptacion')}, NULL, false
         FROM cotizacion c WHERE c.id_orden = $1 AND c.momento_aceptacion IS NOT NULL

       UNION ALL -- Revision tecnica
       SELECT vt.id::text, vt.momento, 'validacion',
              'Revision tecnica: ' || ${LEGIBLE('vt.resultado')}, vt.observacion, u.nombres, false
         FROM validacion_tecnica vt JOIN usuario u ON u.id = vt.id_validador
        WHERE vt.id_orden = $1

       UNION ALL -- Entrega
       SELECT en.id::text, en.momento, 'entrega',
              'Articulo entregado a ' || en.recibido_por
                || CASE WHEN en.es_el_cliente THEN '' ELSE ' (no es el titular)' END,
              concat_ws(' · ', 'Documento: ' || en.documento_receptor, en.observacion),
              u.nombres, false
         FROM entrega en JOIN usuario u ON u.id = en.id_responsable
        WHERE en.id_orden = $1

       UNION ALL -- Notas de correccion
       SELECT n.id::text, n.creado_en, 'correccion', 'Nota de correccion: ' || n.motivo, n.detalle,
              u.nombres, false
         FROM nota_correccion n JOIN usuario u ON u.id = n.creado_por
        WHERE n.id_orden = $1
     ) h
     WHERE h.momento IS NOT NULL
     ORDER BY h.momento, h.tipo, h.id`,
    [idOrden],
  );
  return rows;
}
