import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * El panel habla con la API del servidor. En desarrollo se hace proxy para
 * que el navegador vea todo en el mismo origen y no haya que pelear con
 * CORS ni con cookies entre puertos.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
