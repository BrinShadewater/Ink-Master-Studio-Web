import { lazy, Suspense, useEffect, useState } from 'react';
import { LandingPage } from './components/LandingPage';

const EditorApp = lazy(async () => {
  const module = await import('./components/editor/EditorApp');
  return { default: module.EditorApp };
});

const editorPath = '/editor';

const navigate = (path: string) => {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const App = () => {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const syncPath = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  return pathname === editorPath
    ? <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-[#0b121a] text-sm text-neutral-300" role="status">Opening editor...</main>}><EditorApp /></Suspense>
    : <LandingPage onOpenEditor={() => navigate(editorPath)} />;
};

export default App;
