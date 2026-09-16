import { defineConfig } from 'vitest/config';

/**
 * Las pruebas del panel corren sobre la capa que puede equivocarse de
 * verdad: el cliente de la API, la sesion y las reglas de que se le muestra
 * a quien. Los componentes no se prueban aqui — lo que rompe el trabajo del
 * centro es pedirle algo mal al servidor o ensenarle a alguien lo que no le
 * toca, no un margen de diez pixeles.
 */
export default defineConfig({
  test: { include: ['pruebas/**/*.prueba.ts'], environment: 'node' },
});
