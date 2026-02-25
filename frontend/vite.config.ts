import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Required for some Bitcoin/crypto libraries that reference global
    global: 'globalThis',
  },
  resolve: {
    alias: {
      // Polyfill Node.js built-ins used by btc-vision packages
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
    esbuildOptions: {
      target: 'es2020',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
