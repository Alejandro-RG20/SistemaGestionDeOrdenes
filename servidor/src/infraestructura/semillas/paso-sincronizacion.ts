/**
 * Paso 14: rastro de sincronizacion.
 *
 * `operacion_sincronizada` guarda el resultado de cada operacion con su
 * clave de idempotencia; `excepcion_sincronizacion` guarda la carga
 * original integra de lo que el servidor rechazo. Nada de lo registrado en
 * campo se descarta (RN-19).
 *
 * El protocolo completo —cola ordenada, reenvio, segunda cola de
 * evidencias— es materia de la ETAPA 6. Aqui solo se siembran los rastros
 * que esa etapa va a leer.
 */
import type { PoolClient } from 'pg';
import { CODIGO_ROL, ESTADO_EXCEPCION, ESTADO_ORDEN } from '@servitotal/compartido';
import { copiarFilas } from './insercion.js';
import { sumarHoras } from './aleatorio.js';
import { usuariosDe, type ContextoSiembra } from './contexto.js';
import type { ResumenOrden } from './paso-ordenes.js';

const TIPOS_OPERACION = [
  'orden.crear', 'orden.cambiar_estado', 'visita.registrar',
  'diagnostico.registrar', 'evidencia.cargar', 'inventario.consumo',
] as const;

/** Los tres conflictos del pliego, tal como llegan a la bandeja de excepciones. */
const MOTIVOS_EXCEPCION = [
  'La orden fue anulada mientras el tecnico trabajaba en el domicilio. Se conserva el trabajo registrado.',
  'Se consumio un repuesto que no figuraba en la bodega movil. Se acepta el consumo y queda una diferencia por conciliar.',
  'El precio del repuesto cambio entre la descarga y el consumo. Prevalece el precio que el cliente firmo.',
] as const;

export async function sembrarSincronizacion(
  cliente: PoolClient,
  contexto: ContextoSiembra,
  ordenes: readonly ResumenOrden[],
): Promise<void> {
  const { azar } = contexto;
  const gestores = usuariosDe(contexto, CODIGO_ROL.GESTOR_TECNICOS);
  const tecnicosRuta = contexto.tecnicos.filter((t) => t.tipo === 'ruta');
  const dispositivoPorUsuario = new Map(contexto.dispositivos.map((d) => [d.idUsuario, d.id]));

  // Ordenes de ruta con trabajo registrado sin conexion: son las que pudieron
  // generar operaciones sincronizadas.
  const candidatas = ordenes.filter((orden) => orden.nacioEnRuta && orden.tecnico !== null);
  const conOperacion = azar.barajar(candidatas).slice(0, 4_000);

  const filasOperacion: unknown[][] = [];
  const filasExcepcion: unknown[][] = [];

  for (const orden of conOperacion) {
    const idDispositivo = dispositivoPorUsuario.get(orden.tecnico!.idUsuario);
    if (idDispositivo === undefined) continue;

    const momento = orden.momentos.at(-1)!;
    const idOperacion = azar.uuid();
    const aceptada = azar.booleano(0.96);
    const tipoOperacion = azar.elegir(TIPOS_OPERACION);

    filasOperacion.push([
      idOperacion, idDispositivo, tipoOperacion, orden.id,
      JSON.stringify(aceptada
        ? { estado: 'aplicada', id_orden: orden.id }
        : { estado: 'rechazada', motivo: 'conflicto_de_estado' }),
      aceptada, sumarHoras(momento, -azar.decimal(0.5, 8, 1)), momento,
    ]);

    if (aceptada) continue;

    const resuelta = azar.booleano(0.6);
    filasExcepcion.push([
      azar.uuid(), idOperacion, orden.id, orden.tecnico!.id, azar.elegir(MOTIVOS_EXCEPCION),
      JSON.stringify({
        tipo_operacion: tipoOperacion,
        id_orden: orden.id,
        estado_local: orden.estadoFinal,
        registrado_sin_conexion: true,
        momento_dispositivo: sumarHoras(momento, -2).toISOString(),
      }),
      resuelta ? ESTADO_EXCEPCION.RESUELTA : ESTADO_EXCEPCION.PENDIENTE,
      resuelta ? azar.elegir(gestores).id : null,
      resuelta ? sumarHoras(momento, azar.decimal(2, 72, 1)) : null,
      resuelta ? 'Se concilio con el tecnico y se aplico el trabajo de campo' : null,
      momento,
    ]);
  }

  // Una excepcion sin operacion asociada: orden anulada mientras el tecnico
  // trabajaba, el caso de conflicto mas delicado del pliego.
  for (const orden of ordenes.filter((o) => o.estadoFinal === ESTADO_ORDEN.ANULADA && o.nacioEnRuta).slice(0, 120)) {
    filasExcepcion.push([
      azar.uuid(), null, orden.id, azar.elegir(tecnicosRuta).id, MOTIVOS_EXCEPCION[0],
      JSON.stringify({ tipo_operacion: 'diagnostico.registrar', id_orden: orden.id, conservado: true }),
      ESTADO_EXCEPCION.PENDIENTE, null, null, null, orden.momentos.at(-1)!,
    ]);
  }

  await copiarFilas(cliente, 'operacion_sincronizada',
    ['id_operacion', 'id_dispositivo', 'tipo_operacion', 'id_entidad', 'resultado', 'aceptada',
      'momento_dispositivo', 'procesada_en'],
    filasOperacion as never);
  await copiarFilas(cliente, 'excepcion_sincronizacion',
    ['id', 'id_operacion', 'id_orden', 'id_tecnico', 'motivo', 'carga_original', 'estado',
      'resuelta_por', 'resuelta_en', 'resolucion', 'creado_en'],
    filasExcepcion as never);
}
