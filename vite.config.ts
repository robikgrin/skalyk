import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/skalyk/', // <--- ДОБАВЬТЕ ЭТУ СТРОЧКУ! (Замените skalyk на имя вашего репозитория, если оно другое)
  resolve: {
    alias: {
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    },
  },
})