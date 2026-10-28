import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import faculty from './config/faculty.json';
const manifest = () =>
  JSON.stringify(
    {
      name: `${faculty.platformName} | ${faculty.brand} — ${faculty.faculty} | ${faculty.university}`,
      short_name: faculty.platformName,
      lang: 'ar',
      dir: 'rtl',
      start_url: '/',
      display: 'standalone',
      background_color: '#061629',
      theme_color: '#061629',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
    },
    null,
    2,
  );
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      // اسم الكلية وهويتها تأتي من config/faculty.json فقط (العنوان والوصف وملف التطبيق).
      name: 'faculty-metadata',
      transformIndexHtml: (html: string) =>
        html
          .replaceAll('%PLATFORM%', faculty.platformName)
          .replaceAll('%BRAND%', faculty.brand)
          .replaceAll('%FACULTY%', faculty.faculty)
          .replaceAll('%UNIVERSITY%', faculty.university),
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() });
      },
      configureServer(server) {
        server.middlewares.use('/manifest.webmanifest', (_req, res) => {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(manifest());
        });
      },
    },
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
