import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['pruebas/**/*.prueba.ts'],
    // Las pruebas de la app corren sobre la capa sin conexion, que es codigo
    // puro. Las pantallas no se prueban aqui: lo que puede perder el trabajo
    // del tecnico es la cola, no un boton mal alineado.
    environment: 'node',
  },
});
