import React, { useEffect } from 'react';

type StaticRouteId =
  | 'privacy'
  | 'terms'
  | 'contact'
  | 'printify-file-requirements'
  | 'print-ready-file-checklist'
  | 'upscaling-art-for-t-shirt-printing'
  | 'not-found';

interface StaticRoute {
  id: StaticRouteId;
  path: string;
  title: string;
  description: string;
  sections: Array<{
    heading: string;
    body: string;
    items?: string[];
  }>;
}

const routes: StaticRoute[] = [
  {
    id: 'privacy',
    path: '/privacy',
    title: 'Privacy',
    description: 'How InkMaster Studio handles uploaded artwork, saved designs, and optional AI cleanup.',
    sections: [
      {
        heading: 'Artwork stays local by default',
        body: 'InkMaster Studio is local-first. Uploaded artwork, generated print files, saved designs, settings, and export history are stored in your browser on your device unless you choose to download or transfer them.',
      },
      {
        heading: 'AI cleanup',
        body: 'If AI cleanup is available and you choose to use it, the selected image is sent through the server-side /api/edit-image route. Provider keys stay server-side and are not exposed to the browser.',
      },
      {
        heading: 'No accounts for the core workflow',
        body: 'The core drop, product preset, checks, and download flow does not require an InkMaster account or a remote project workspace.',
      },
    ],
  },
  {
    id: 'terms',
    path: '/terms',
    title: 'Terms',
    description: 'Use InkMaster Studio to prepare artwork you have the right to upload and print.',
    sections: [
      {
        heading: 'Your artwork',
        body: 'You are responsible for making sure you have the rights and permissions needed to upload, edit, print, and sell the artwork you process with InkMaster Studio.',
      },
      {
        heading: 'Print readiness',
        body: 'InkMaster Studio creates files based on selected presets and local checks. Print-on-demand services and individual providers may apply their own upload validation, print-area, and quality rules.',
      },
      {
        heading: 'Local-first software',
        body: 'Saved designs and exports are stored in your browser. Clearing browser data can remove local records, so download important print files and portable backups when needed.',
      },
    ],
  },
  {
    id: 'contact',
    path: '/contact',
    title: 'Contact',
    description: 'Contact information for InkMaster Studio feedback, issues, and support requests.',
    sections: [
      {
        heading: 'Product feedback',
        body: 'For bugs, feature requests, or product questions, use the project repository or the contact channel linked from the site owner profile.',
      },
      {
        heading: 'Security',
        body: 'Do not send API keys or private artwork in public issue text. Report security-sensitive problems with enough detail to reproduce the issue without exposing secrets.',
      },
    ],
  },
  {
    id: 'printify-file-requirements',
    path: '/printify-file-requirements',
    title: 'Printify File Requirements Explained',
    description: 'A plain-language guide to Printify file types, size limits, DPI, RGB color, and product-specific requirements.',
    sections: [
      {
        heading: 'Supported upload shapes',
        body: 'Printify supports PNG, JPEG, and SVG uploads. InkMaster Studio defaults to PNG because it preserves transparency and works well for creator artwork.',
        items: ['PNG/JPEG cap: 100 MB', 'SVG cap: 20 MB', 'Standard raster target: 300 DPI', 'Large products may use 120-150 DPI'],
      },
      {
        heading: 'Product-specific sizes',
        body: 'The exact print area can vary by product, print provider, and print placement. InkMaster presets provide practical starter targets, and Product Creator remains the final source for provider-specific dimensions.',
      },
    ],
  },
  {
    id: 'print-ready-file-checklist',
    path: '/print-ready-file-checklist',
    title: 'Print-Ready File Checklist',
    description: 'A simple checklist creators can use before uploading art to a print-on-demand product creator.',
    sections: [
      {
        heading: 'Before upload',
        body: 'A print-ready file should match the product size, keep important art inside the print area, use RGB color, and stay within the upload service file-size limit.',
        items: ['Pick the product before exporting', 'Use transparent PNG for cutout artwork', 'Avoid tiny source images for large prints', 'Check that text remains readable at print size'],
      },
      {
        heading: 'What InkMaster checks',
        body: 'The default InkMaster flow reports product sizing, upscale notes, DPI, RGB output, transparency, and file-size cap status in plain language.',
      },
    ],
  },
  {
    id: 'upscaling-art-for-t-shirt-printing',
    path: '/upscaling-art-for-t-shirt-printing',
    title: 'Upscaling Art for T-Shirt Printing',
    description: 'How to think about upscaling smaller artwork for a full-front t-shirt print file.',
    sections: [
      {
        heading: 'Upscaling is useful, not magic',
        body: 'A smaller image can be resized to a t-shirt artboard, but the original detail still matters. Clean logos and bold art usually upscale better than low-resolution photos or tiny text.',
      },
      {
        heading: 'When to remake the source',
        body: 'If the source is very small, blurry, or full of compressed edges, remake or re-export the artwork at a larger size before sending it to a print-on-demand service.',
      },
    ],
  },
];

const routeByPath = new Map(routes.map((route) => [route.path, route]));
const footerLinks = [
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
  ['/contact', 'Contact'],
  ['/printify-file-requirements', 'Printify requirements'],
  ['/print-ready-file-checklist', 'Checklist'],
  ['/upscaling-art-for-t-shirt-printing', 'Upscaling'],
];

export const getStaticRoute = (pathname: string): StaticRoute | null => {
  if (pathname === '/') return null;
  return routeByPath.get(pathname) ?? {
    id: 'not-found',
    path: pathname,
    title: 'Page Not Found',
    description: 'This page does not exist in InkMaster Studio.',
    sections: [
      {
        heading: 'That page is not available',
        body: 'Use the links below to return to InkMaster Studio or open one of the creator file-prep guides.',
      },
    ],
  };
};

const setMetaContent = (selector: string, content: string) => {
  const element = document.querySelector<HTMLMetaElement>(selector);
  if (element) element.content = content;
};

export const StaticPage: React.FC<{ route: StaticRoute }> = ({ route }) => {
  useEffect(() => {
    document.title = `${route.title} | InkMaster Studio`;
    setMetaContent('meta[name="description"]', route.description);
    setMetaContent('meta[property="og:title"]', `${route.title} | InkMaster Studio`);
    setMetaContent('meta[property="og:description"]', route.description);
    setMetaContent('meta[name="twitter:title"]', `${route.title} | InkMaster Studio`);
    setMetaContent('meta[name="twitter:description"]', route.description);

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = route.id === 'not-found' ? 'noindex, follow' : 'index, follow, max-image-preview:large';
  }, [route]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950/95 px-4 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 text-sm font-black text-white">
            <img src="/logo/logo.png" alt="" className="h-8 w-8 object-contain" />
            InkMaster Studio
          </a>
          <a href="/" className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white">Open app</a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-300">InkMaster Studio</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">{route.title}</h1>
        <p className="mt-4 text-base leading-7 text-slate-400">{route.description}</p>
        <div className="mt-8 space-y-5">
          {route.sections.map((section) => (
            <section key={section.heading} className="border-t border-slate-800 pt-5">
              <h2 className="text-lg font-black text-white">{section.heading}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-400">{section.body}</p>
              {section.items && (
                <ul className="mt-3 grid gap-2 text-sm text-slate-300">
                  {section.items.map((item) => (
                    <li key={item} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
      <footer className="border-t border-slate-800 px-4 py-6">
        <nav className="mx-auto flex max-w-5xl flex-wrap gap-3 text-xs text-slate-500" aria-label="Footer">
          {footerLinks.map(([href, label]) => (
            <a key={href} href={href} className="hover:text-slate-200">{label}</a>
          ))}
        </nav>
      </footer>
    </div>
  );
};
