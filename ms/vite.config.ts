import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ms/', // GitHub Pagesのサブパス設定
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
