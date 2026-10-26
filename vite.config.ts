import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import faculty from './config/faculty.json';
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'preview-faculty-config',
      generateBundle() {
        if (mode === 'preview')
          this.emitFile({
            type: 'asset',
            fileName: 'preview-config.json',
            source: JSON.stringify(faculty),
          });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } },
  },
  build: { outDir: 'dist' },
}));
