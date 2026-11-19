import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base './' macht den Build ohne Anpassung auf jedem Webspace
// (GitHub Pages, Netlify, Unterordner, ...) lauffähig.
export default defineConfig(({ mode }) => ({
  base: './',
  // Die Einzeldatei (npm run build:portable) braucht alles in einem Skript, auch die nachgeladene Karte
  build: mode === 'portable' ? { rollupOptions: { output: { inlineDynamicImports: true } } } : {},
  plugins: [
    svelte({
      // Die Szenen der Projekt-Seite bekommen ihre Daten einmal beim Start und behalten sie
      onwarn(warning, handler) {
        if (warning.code === 'state_referenced_locally' && warning.filename?.includes('scenes')) return;
        handler(warning);
      }
    })
  ]
}));
