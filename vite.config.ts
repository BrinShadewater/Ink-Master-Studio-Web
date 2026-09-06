import path from 'path';
import { defineConfig } from 'vite';


export default defineConfig(() => {
    return {
      publicDir: 'public',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        target: 'es2015',
        cssCodeSplit: true,
        sourcemap: false,
        rollupOptions: {
          output: {
            // No manualChunks, on purpose (2026-09-05). The hand-written vendor split put Vite's
            // own preload helper inside the pdf-export chunk (jsPDF used it first), so the landing
            // page's entry imported pdf-export to get one function and modulepreloaded ~500 KB of
            // jsPDF/html2canvas/core-js that only the editor uses. Lighthouse flagged it as 137 KB
            // of unused JavaScript on every landing visit. Default splitting keeps the landing to
            // the entry + runtime and loads jsPDF only from the editor's dynamic import.
            // Optimize asset file names
            assetFileNames: (assetInfo) => {
              const info = assetInfo.name.split('.');
              const ext = info[info.length - 1];
              if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
                return `assets/images/[name]-[hash][extname]`;
              }
              if (/woff|woff2|eot|ttf|otf/i.test(ext)) {
                return `assets/fonts/[name]-[hash][extname]`;
              }
              return `assets/[name]-[hash][extname]`;
            },
            chunkFileNames: 'assets/js/[name]-[hash].js',
            entryFileNames: 'assets/js/[name]-[hash].js',
          }
        },
        chunkSizeWarningLimit: 600,
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
            pure_funcs: ['console.log', 'console.info'],
            passes: 2
          },
          format: {
            comments: false
          }
        },
        reportCompressedSize: false, // Speeds up build
        assetsInlineLimit: 4096 // Inline assets smaller than 4kb
      }
    };
});
