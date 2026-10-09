/**
 * Paso 2: roles, permisos, la matriz rol_permiso, las 37 personas del
 * centro y los dispositivos de los tecnicos de ruta.
 */
import type { PoolClient } from 'pg';
import { CATALOGO_PERMISOS, CODIGO_ROL, MATRIZ_ROL_PERMISO } from '@servitotal/compartido';
import { derivarContrasena } from '../../comun/contrasenas.js';
import { copiarFilas } from './insercion.js';
import { APELLIDOS, NOMBRES_PILA } from './nombres.js';
import type { ContextoSiembra, ReferenciaUsuario } from './contexto.js';

/** Contrasena unica de los datos de prueba. Nunca sale de un entorno de desarrollo. */
export const CONTRASENA_DE_PRUEBA = 'ServiTotal.2026';

const NOMBRE_ROL: Readonly<Record<string, string>> = {
  [CODIGO_ROL.AGENTE_TELEFONIA]: 'Agente de telefonia',
  [CODIGO_ROL.JEFE_ATENCION_CLIENTE]: 'Jefatura de atencion al cliente y administracion del sistema',
  [CODIGO_ROL.TECNICO_RUTA]: 'Tecnico de ruta',
  [CODIGO_ROL.TECNICO_PLANTA]: 'Tecnico de planta',
  [CODIGO_ROL.GESTOR_TECNICOS]: 'Gestor de tecnicos',
  [CODIGO_ROL.JEFE_TECNICOS]: 'Jefatura de tecnicos',
  [CODIGO_ROL.BODEGUERO]: 'Bodeguero',
  [CODIGO_ROL.JEFE_COMPRAS]: 'Jefatura de compras',
  [CODIGO_ROL.USUARIO_TIENDA]: 'Usuario de tienda',
  [CODIGO_ROL.ADMINISTRADOR]: 'Administrador del sistema',
  [CODIGO_ROL.USUARIO_CONSULTA]: 'Usuario de consulta',
};

/**
 * La plantilla del centro de servicio, tal como la declara el pliego.
 *
 * La jefatura de atencion al cliente conserva sus permisos administrativos
 * —es quien de verdad administra el sistema dia a dia— y ademas existe la
 * cuenta de administrador que el pliego exige como rol propio.
 */
const PLANTILLA: readonly (readonly [string, number])[] = [
  [CODIGO_ROL.TECNICO_RUTA, 8],
  [CODIGO_ROL.TECNICO_PLANTA, 8],
  [CODIGO_ROL.GESTOR_TECNICOS, 4],
  [CODIGO_ROL.JEFE_TECNICOS, 2],
  [CODIGO_ROL.AGENTE_TELEFONIA, 7],
  [CODIGO_ROL.JEFE_ATENCION_CLIENTE, 1],
  [CODIGO_ROL.BODEGUERO, 2],
  [CODIGO_ROL.JEFE_COMPRAS, 1],
  [CODIGO_ROL.ADMINISTRADOR, 1],
  [CODIGO_ROL.USUARIO_CONSULTA, 1],
  // Uno por sucursal del grupo. No son del centro de servicio: son el
  // mostrador de la tienda, y por eso son los unicos que llevan
  // `id_tienda`.
  [CODIGO_ROL.USUARIO_TIENDA, 3],
];

const ESPECIALIDADES = ['refrigeracion', 'lavado', 'aire_acondicionado', 'audio_video'] as const;

export async function sembrarSeguridad(cliente: PoolClient, contexto: ContextoSiembra): Promise<void> {
  const { azar } = contexto;

  const idsRol = new Map<string, string>(Object.values(CODIGO_ROL).map((codigo) => [codigo, azar.uuid()]));
  await copiarFilas(
    cliente,
    'rol',
    ['id', 'codigo', 'nombre', 'descripcion', 'activo'],
    [...idsRol].map(([codigo, id]) => [id, codigo, NOMBRE_ROL[codigo] ?? codigo, null, true]),
  );

  const idsPermiso = new Map<string, string>(CATALOGO_PERMISOS.map((p) => [p.codigo, azar.uuid()]));
  await copiarFilas(
    cliente,
    'permiso',
    ['id', 'codigo', 'modulo', 'descripcion'],
    CATALOGO_PERMISOS.map((p) => [idsPermiso.get(p.codigo)!, p.codigo, p.modulo, p.descripcion]),
  );

  const asignaciones: string[][] = [];
  for (const [codigoRol, permisos] of Object.entries(MATRIZ_ROL_PERMISO)) {
    for (const codigoPermiso of new Set(permisos)) {
      asignaciones.push([idsRol.get(codigoRol)!, idsPermiso.get(codigoPermiso)!]);
    }
  }
  await copiarFilas(cliente, 'rol_permiso', ['id_rol', 'id_permiso'], asignaciones);

  // ── personas ──
  const contrasenaHash = derivarContrasena(CONTRASENA_DE_PRUEBA);
  const usuariosPorRol = new Map<string, ReferenciaUsuario[]>();
  const filasUsuario: unknown[][] = [];
  const nombresUsados = new Set<string>();

  // Las sucursales del grupo, para repartir entre ellas al personal de
  // mostrador. «Externa» queda fuera: nadie trabaja ahi, es donde se
  // compro lo que no es del grupo.
  const sucursales = contexto.tiendas.filter((tienda) => tienda.perteneceAlGrupo);
  let siguienteSucursal = 0;

  const registrar = (codigoRol: string): ReferenciaUsuario => {
    const nombres = `${azar.elegir(NOMBRES_PILA)} ${azar.elegir(APELLIDOS)} ${azar.elegir(APELLIDOS)}`;
    const partes = nombres.toLowerCase().split(' ');
    let nombreUsuario = `${partes[0]!.charAt(0)}${partes[1]}`;
    let sufijo = 1;
    while (nombresUsados.has(nombreUsuario)) {
      sufijo += 1;
      nombreUsuario = `${partes[0]!.charAt(0)}${partes[1]}${sufijo}`;
    }
    nombresUsados.add(nombreUsuario);

    // Solo el usuario de tienda pertenece a una sucursal. Al resto se le
    // deja en NULL a proposito: trabajan en el centro de servicio, y
    // asignarles una tienda para «rellenar» haria creer que el dato
    // significa algo cuando no significa nada.
    const idTienda = codigoRol === CODIGO_ROL.USUARIO_TIENDA && sucursales.length > 0
      ? sucursales[siguienteSucursal++ % sucursales.length]!.id
      : null;

    const usuario: ReferenciaUsuario = { id: azar.uuid(), nombreUsuario, rol: codigoRol };
    filasUsuario.push([
      usuario.id, contexto.idCentro, idsRol.get(codigoRol)!, nombreUsuario, nombres,
      contrasenaHash, `${nombreUsuario}@servitotal-ejemplo.com`, 0, false, true, idTienda,
    ]);
    const lista = usuariosPorRol.get(codigoRol) ?? [];
    lista.push(usuario);
    usuariosPorRol.set(codigoRol, lista);
    return usuario;
  };

  for (const [codigoRol, cantidad] of PLANTILLA) {
    for (let i = 0; i < cantidad; i += 1) registrar(codigoRol);
  }

  await copiarFilas(
    cliente,
    'usuario',
    ['id', 'id_centro', 'id_rol', 'nombre_usuario', 'nombres', 'contrasena_hash', 'correo',
      'intentos_fallidos', 'bloqueado', 'activo', 'id_tienda'],
    filasUsuario as never,
  );
  contexto.usuariosPorRol = usuariosPorRol;

  // ── tecnicos y dispositivos ──
  const construirTecnico = (usuario: ReferenciaUsuario, tipo: 'ruta' | 'planta', indice: number) => ({
    id: azar.uuid(),
    idUsuario: usuario.id,
    tipo,
    especialidad: ESPECIALIDADES[indice % ESPECIALIDADES.length]!,
  });

  contexto.tecnicos = [
    ...usuariosPorRol.get(CODIGO_ROL.TECNICO_RUTA)!.map((u, i) => construirTecnico(u, 'ruta', i)),
    ...usuariosPorRol.get(CODIGO_ROL.TECNICO_PLANTA)!.map((u, i) => construirTecnico(u, 'planta', i)),
  ];
  await copiarFilas(
    cliente,
    'tecnico',
    ['id', 'id_usuario', 'id_centro', 'tipo', 'especialidad', 'disponible', 'activo'],
    contexto.tecnicos.map((t) => [t.id, t.idUsuario, contexto.idCentro, t.tipo, t.especialidad, true, true]),
  );

  contexto.dispositivos = contexto.tecnicos
    .filter((tecnico) => tecnico.tipo === 'ruta')
    .map((tecnico) => ({ id: azar.uuid(), idUsuario: tecnico.idUsuario }));
  await copiarFilas(
    cliente,
    'dispositivo',
    ['id', 'id_usuario', 'identificador', 'modelo', 'vinculado_en', 'ultima_sincronizacion'],
    contexto.dispositivos.map((dispositivo, indice) => [
      dispositivo.id, dispositivo.idUsuario, `SRVT-MOV-${String(indice + 1).padStart(3, '0')}`,
      azar.elegir(['Samsung Galaxy Tab A8', 'Motorola Moto G54', 'Xiaomi Redmi Note 12']),
      contexto.inicioVentana, azar.fechaEntre(contexto.inicioVentana, contexto.finVentana),
    ]),
  );
}
