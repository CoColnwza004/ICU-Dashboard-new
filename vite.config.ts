import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // ไฟล์หลัก ~160 kB (gzip) รวม React + ทุกหน้า — กราฟและ PDF แยกไฟล์แล้ว
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: { charts: ['recharts'], icons: ['lucide-react'] },
      },
    },
  },
});
