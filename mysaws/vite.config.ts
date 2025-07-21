import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/mysews/', // GitHubPagesのリポジトリ名に合わせて調整
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
})
