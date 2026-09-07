import React, { useEffect } from 'react';
import { routes, type StaticRoute } from '../content/staticRoutes';


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
  if (pathname === '/' || pathname === '/editor') return null;
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
    // The shell's canonical and og:url point at the home page; without this every guide told
    // search engines it was a copy of "/" (Lighthouse SEO 92 on /printify-file-requirements,
    // and a real de-indexing risk for the guides).
    const self = `https://inkmasterstudio.com${route.id === 'not-found' ? '/' : route.path}`;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousCanonical = canonical?.href;
    if (canonical) canonical.href = self;
    const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    const previousOgUrl = ogUrl?.content;
    if (ogUrl) ogUrl.content = self;
    setMetaContent('meta[name="twitter:url"]', self);

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = route.id === 'not-found' ? 'noindex, follow' : 'index, follow, max-image-preview:large';
    return () => {
      if (canonical && previousCanonical) canonical.href = previousCanonical;
      if (ogUrl && previousOgUrl) ogUrl.content = previousOgUrl;
      if (previousOgUrl) setMetaContent('meta[name="twitter:url"]', previousOgUrl);
    };
  }, [route]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950/95 px-4 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 text-sm font-black text-white">
            <img src="/logo/logo-mark.webp" alt="" className="h-8 w-8 object-contain" />
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
        <nav className="mx-auto flex max-w-5xl flex-wrap gap-3 text-xs text-slate-400" aria-label="Footer">
          {footerLinks.map(([href, label]) => (
            <a key={href} href={href} className="hover:text-slate-200">{label}</a>
          ))}
        </nav>
      </footer>
    </div>
  );
};
