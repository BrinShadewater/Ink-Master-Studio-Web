import { useEffect, useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { EditorApp } from './components/editor/EditorApp';

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
    ? <EditorApp />
    : <LandingPage onOpenEditor={() => navigate(editorPath)} />;
};

export default App;
