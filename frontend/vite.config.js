import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

function copyPdfWorker() {
  return {
    name: 'copy-pdf-worker',
    closeBundle() {
      try {
        mkdirSync('dist', { recursive: true });
        copyFileSync(
          resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
          resolve('dist/pdf.worker.min.mjs')
        );
        console.log('✅ pdf.worker.min.mjs copied to dist/');
      } catch (e) {
        console.warn('⚠️  Could not copy pdf worker:', e.message);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyPdfWorker()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
});
