import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // หน้าต่าง ๆ แยกไฟล์และโหลดเมื่อใช้ (React.lazy) — กราฟ (recharts) และ PDF โหลดเฉพาะหน้าที่ต้องใช้
    chunkSizeWarningLimit: 700,
  },
});
