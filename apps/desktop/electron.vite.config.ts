import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const apiBase = process.env.VITE_API_BASE ?? 'http://127.0.0.1:8080';
const webSrc = resolve(__dirname, '../web/src');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@luma/win-audio': resolve(__dirname, '../../packages/win-audio/index.js'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@web': webSrc,
        '@': webSrc,
      },
    },
    define: {
      'process.env.NEXT_PUBLIC_API_BASE': JSON.stringify(apiBase),
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          float: resolve(__dirname, 'src/renderer/float.html'),
          picker: resolve(__dirname, 'src/renderer/picker.html'),
        },
      },
    },
  },
});
