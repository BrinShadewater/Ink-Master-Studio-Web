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
            manualChunks: (id) => {
              // Vendor chunks
              if (id.includes('node_modules')) {
                if (id.includes('react') || id.includes('react-dom')) {
                  return 'react-vendor';
                }
                if (id.includes('imagetracerjs')) {
                  return 'image-processing';
                }
                if (id.includes('jspdf') || id.includes('jszip')) {
                  return 'pdf-export';
                }
                if (id.includes('@google/genai')) {
                  return 'ai-vendor';
                }
              }
              // Component-based splitting for lazy-loaded modules
              if (id.includes('/components/BatchProcessor')) {
                return 'batch-processor';
              }
              if (id.includes('/components/ExportHistory')) {
                return 'export-history';
              }
            },
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
