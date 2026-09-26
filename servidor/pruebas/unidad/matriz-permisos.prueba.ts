/**
 * La matriz de permisos es la fuente de la tabla rol_permiso: si aqui hay
 * un codigo que no existe en el catalogo, la siembra fallaria en la base.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGO_PERMISOS, CODIGO_ROL, MATRIZ_ROL_PERMISO } from '@servitotal/compartido';

const CODIGOS_CONOCIDOS = new Set(CATALOGO_PERMISOS.map((permiso) => permiso.codigo));

describe('catalogo de permisos', () => {
  it('no tiene codigos repetidos', () => {
    expect(CODIGOS_CONOCIDOS.size).toBe(CATALOGO_PERMISOS.length);
  });

  it('cada permiso declara modulo y descripcion', () => {
    for (const permiso of CATALOGO_PERMISOS) {
      expect(permiso.modulo.length).toBeGreaterThan(0);
      expect(permiso.descripcion.length).toBeGreaterThan(10);
    }
  });
});

describe('matriz de roles', () => {
  it('cubre exactamente los roles definidos', () => {
    expect(Object.keys(MATRIZ_ROL_PERMISO).sort()).toEqual(Object.values(CODIGO_ROL).sort());
  });

  /**
   * El pliego exige el rol de administrador como rol propio (§6 y §7), y
   * asi esta. Pero la jefatura de atencion al cliente CONSERVA sus permisos
   * administrativos, que es lo que refleja como trabaja el centro: no hay
   * una persona dedicada a administrar el sistema, lo administra quien
   * atiende al cliente.
   */
  it('el administrador existe y la jefatura conserva lo suyo', () => {
    expect(Object.values(CODIGO_ROL)).toContain('administrador');

    const jefatura = MATRIZ_ROL_PERMISO[CODIGO_ROL.JEFE_ATENCION_CLIENTE];
    expect(jefatura).toContain('seguridad.usuario.gestionar');
    expect(jefatura).toContain('seguridad.rol.gestionar');
    expect(jefatura).toContain('seguridad.dispositivo.revocar');
  });

  /**
   * El administrador se construye DESDE el catalogo, no con una lista
   * escrita a mano. Una lista a mano se queda corta el dia que alguien
   * agrega un permiso, y un administrador al que le falta un permiso nuevo
   * es un administrador que no puede administrar.
   */
  it('el administrador tiene absolutamente todos los permisos', () => {
    const suyos = new Set(MATRIZ_ROL_PERMISO[CODIGO_ROL.ADMINISTRADOR]);
    for (const permiso of CODIGOS_CONOCIDOS) {
      expect(suyos.has(permiso as never), `al administrador le falta ${permiso}`).toBe(true);
    }
  });

  /**
   * Y el de consulta, ninguno que escriba. Su valor esta en lo que NO
   * tiene: es el rol que se le da a quien supervisa sin operar.
   */
  it('el usuario de consulta no lleva ni un permiso que escriba', () => {
    const escriben = /\.(crear|editar|asignar|anular|cerrar|gestionar|registrar|cargar|programar|evaluar|reclasificar|conformar|enviar|autorizar|vincular|revocar|resolver|sincronizar|entregar|confirmar|recibir|fusionar|nota_correccion|configurar|editar_datos_sensibles)$/;
    for (const permiso of MATRIZ_ROL_PERMISO[CODIGO_ROL.USUARIO_CONSULTA]) {
      expect(escriben.test(permiso), `«${permiso}» escribe y no deberia estar`).toBe(false);
    }
  });

  it('solo asigna permisos que existen en el catalogo', () => {
    for (const [rol, permisos] of Object.entries(MATRIZ_ROL_PERMISO)) {
      for (const permiso of permisos) {
        expect(CODIGOS_CONOCIDOS.has(permiso), `${rol} tiene un permiso inexistente: ${permiso}`).toBe(true);
      }
    }
  });

  it('ningun rol operativo puede administrar usuarios por descuido', () => {
    const operativos = [
      CODIGO_ROL.TECNICO_RUTA, CODIGO_ROL.TECNICO_PLANTA, CODIGO_ROL.BODEGUERO,
      CODIGO_ROL.AGENTE_TELEFONIA, CODIGO_ROL.GESTOR_COBROS, CODIGO_ROL.GESTOR_TECNICOS,
      CODIGO_ROL.JEFE_COMPRAS,
    ];
    for (const rol of operativos) {
      expect(MATRIZ_ROL_PERMISO[rol]).not.toContain('seguridad.usuario.gestionar');
      expect(MATRIZ_ROL_PERMISO[rol]).not.toContain('seguridad.rol.gestionar');
    }
  });

  it('todo permiso del catalogo esta asignado a alguien', () => {
    const asignados = new Set(Object.values(MATRIZ_ROL_PERMISO).flat());
    const huerfanos = [...CODIGOS_CONOCIDOS].filter((codigo) => !asignados.has(codigo as never));
    expect(huerfanos).toEqual([]);
  });
});
