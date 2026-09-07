import fs from 'fs';
import path from 'path';
import { defineConfig, type PluginOption } from 'vite';
import { routes } from './content/staticRoutes';


const ORIGIN = 'https://inkmasterstudio.com';

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Replace one <meta name|property="key"> in the shell, or add it before </head>. */
function setMeta(html: string, key: string, content: string) {
  const attr = key.startsWith('og:') ? 'property' : 'name';
  const tag = `<meta ${attr}="${key}" content="${esc(content)}" />`;
  // Whitespace before the attribute name, not \b: inside a template literal \b is a backspace.
  const pattern = new RegExp(`<meta[^>]*?\\s(?:name|property)="${key.replace(/[.:]/g, '\\$&')}"[^>]*?/?>`, 's');
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

/**
 * Write one HTML file per static guide route, with that route's own head and its own text.
 *
 * StaticPage sets the title, description and (since the canonical fix) the canonical at
 * runtime, in a useEffect. Googlebot executes JavaScript and sees that; GPTBot, ClaudeBot,
 * PerplexityBot and every share scraper do not — so the served HTML for /privacy, /terms,
 * /contact and the three creator guides all said `https://inkmasterstudio.com/`, and every one
 * of them looked like a duplicate of the home page to the clients that decide whether they get
 * indexed. Found by auditing canonical and og:url across 52 pages on seven sites, 2026-09-06.
 *
 * The body is replaced too, not only the head: these guides exist to be found in search, and
 * the shell they inherited described the editor instead. The copy comes from the same
 * content/staticRoutes.ts the component renders, so the two cannot disagree.
 *
 * Vercel checks the filesystem before applying the SPA rewrite, so dist/privacy/index.html wins
 * for that URL and the app still hydrates inside it (proven on the shadewaterlabs.com preview).
 */
function prerenderStaticRoutes(): PluginOption {
  let outDir = 'dist';
  return {
    name: 'inkmaster-prerender-static-routes',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const root = path.resolve(__dirname, outDir);
      const shell = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
      let written = 0;
      for (const route of routes) {
        const self = `${ORIGIN}${route.path}`;
        const title = `${route.title} | InkMaster Studio`;
        let html = shell.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
        html = html.replace(
          /<link rel="canonical" href="[^"]*" \/>/,
          `<link rel="canonical" href="${esc(self)}" />`,
        );
        const meta: Record<string, string> = {
          description: route.description,
          'og:url': self,
          'og:title': title,
          'og:description': route.description,
          'twitter:url': self,
          'twitter:title': title,
          'twitter:description': route.description,
        };
        for (const [key, value] of Object.entries(meta)) html = setMeta(html, key, value);

        const body = [
          `<h1>${esc(route.title)}</h1>`,
          `<p>${esc(route.description)}</p>`,
          ...route.sections.flatMap((section) => [
            `<h2>${esc(section.heading)}</h2>`,
            `<p>${esc(section.body)}</p>`,
            ...(section.items && section.items.length
              ? [`<ul>${section.items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`]
              : []),
          ]),
        ].join('\n          ');
        html = html.replace(
          /(<div class="static-shell__inner">)[\s\S]*?(<\/div>\s*<\/main>)/,
          `$1\n          ${body}\n        $2`,
        );

        const dir = path.join(root, route.path.replace(/^\//, ''));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), html);
        written += 1;
      }
      this.info(`inkmaster-prerender-static-routes: ${written} route files written`);
    },
  };
}


export default defineConfig(() => {
    return {
      publicDir: 'public',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [prerenderStaticRoutes()],
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
