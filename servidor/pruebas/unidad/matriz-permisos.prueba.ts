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

  it('no hay rol de administrador: administra la jefatura de atencion al cliente', () => {
    expect(Object.values(CODIGO_ROL)).not.toContain('administrador');
    const jefatura = MATRIZ_ROL_PERMISO[CODIGO_ROL.JEFE_ATENCION_CLIENTE];
    expect(jefatura).toContain('seguridad.usuario.gestionar');
    expect(jefatura).toContain('seguridad.rol.gestionar');
    expect(jefatura).toContain('seguridad.dispositivo.revocar');
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
