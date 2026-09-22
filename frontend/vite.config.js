import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Port backend & frontend dibaca dari .env di root proyek (BACKEND_PORT, FRONTEND_PORT).
export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, '..');
  const env = loadEnv(mode, rootDir, '');
  const frontendPort = Number(env.FRONTEND_PORT) || 9722;
  const backendPort = Number(env.BACKEND_PORT) || 9721;

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // Pecah vendor agar cache browser efektif dan bundle awal lebih kecil.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
    envDir: rootDir,
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      port: frontendPort,
      strictPort: true,
      proxy: { '/api': { target: `http://localhost:${backendPort}`, changeOrigin: true } },
    },
    preview: {
      port: frontendPort,
      strictPort: true,
      proxy: { '/api': { target: `http://localhost:${backendPort}`, changeOrigin: true } },
    },
  };
});
