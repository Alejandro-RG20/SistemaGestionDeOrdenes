import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['pruebas/**/*.prueba.ts'],
    // La siembra de 30 000 ordenes tarda; las pruebas de integracion la reutilizan.
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
